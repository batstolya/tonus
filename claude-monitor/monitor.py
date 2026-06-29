#!/usr/bin/env python3
import os, json, time, logging, subprocess, threading, requests
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

USAGE_URL        = os.environ["CLAUDE_USAGE_URL"]
SESSION_KEY      = os.environ["CLAUDE_SESSION_KEY"]
DEVICE_ID        = os.environ.get("CLAUDE_DEVICE_ID", "")
TG_TOKEN         = os.environ["TELEGRAM_BOT_TOKEN"]
TG_CHAT_ID       = os.environ["TELEGRAM_CHAT_ID"]
POLL_INTERVAL    = int(os.environ.get("POLL_INTERVAL", 60))
SUPABASE_URL     = os.environ.get("SUPABASE_URL", "")
SUPABASE_SVC_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

_data_dir  = Path("/data") if Path("/data").exists() and os.access("/data", os.W_OK) else Path("./data")
STATE_FILE = _data_dir / "state.json"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

_session_key = SESSION_KEY


# ── State ─────────────────────────────────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"session_reset_at": None, "weekly_reset_at": None, "session_exhausted_sent": False, "weekly_exhausted_sent": False, "initialized": False}

def save_state(state: dict):
    _data_dir.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


# ── Telegram ──────────────────────────────────────────────────────────────────

def send_tg(text: str, chat_id: str = None):
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            json={"chat_id": chat_id or TG_CHAT_ID, "text": text, "parse_mode": "HTML"},
            timeout=10,
        )
        r.raise_for_status()
        log.info("TG: %s", text[:60].replace("\n", " "))
    except Exception as e:
        log.error("Telegram error: %s", e)


# ── Helpers ───────────────────────────────────────────────────────────────────

def reset_bucket(iso: str) -> str:
    """Round reset timestamp to nearest 10 minutes — avoids false triggers from server jitter."""
    dt = datetime.fromisoformat(iso)
    return dt.strftime("%Y-%m-%dT%H:") + str(dt.minute // 10)

def seconds_until(iso: str) -> float:
    dt = datetime.fromisoformat(iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt - datetime.now(timezone.utc)).total_seconds()

def seconds_until_epoch(ts) -> float | None:
    """Секунд до unix-времени ts (epoch). None → нет данных."""
    if not ts:
        return None
    return ts - datetime.now(timezone.utc).timestamp()

def fmt_time(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m = rem // 60
    if h > 0:
        return f"{h}ч {m:02d}м"
    return f"{m}м"

def bar(pct: float, width: int = 10) -> str:
    filled = round(pct / 100 * width)
    return "█" * filled + "░" * (width - filled)

def status_text(data: dict) -> str:
    s = data.get("five_hour") or {}
    w = data.get("seven_day") or {}
    s_pct  = s.get("utilization", 0)
    w_pct  = w.get("utilization", 0)
    s_secs = seconds_until(s["resets_at"]) if s.get("resets_at") else None
    w_secs = seconds_until(w["resets_at"]) if w.get("resets_at") else None

    s_line = f"{bar(s_pct)} {s_pct:.0f}% · сброс через <b>{fmt_time(s_secs)}</b>" if s_secs else f"{bar(s_pct)} {s_pct:.0f}%"
    w_line = f"{bar(w_pct)} {w_pct:.0f}% · сброс через <b>{fmt_time(w_secs)}</b>" if w_secs else f"{bar(w_pct)} {w_pct:.0f}%"

    return (
        f"<b>Сессия (5ч)</b>\n{s_line}\n\n"
        f"<b>Неделя</b>\n{w_line}"
    )


# ── Codex (читаем лимиты из session-транскриптов Codex CLI) ─────────────────────
# Лимиты пишутся в события token_count в ~/.codex/sessions/**/rollout-*.jsonl
# (это персистентно, в отличие от logs_*.sqlite, который чистится).

CODEX_DIR = os.environ.get("CODEX_DIR", os.path.expanduser("~/.codex"))

def _newest_rollout() -> str | None:
    base = Path(CODEX_DIR)
    root = base / "sessions" if (base / "sessions").is_dir() else base
    files = sorted(root.rglob("rollout-*.jsonl"), key=lambda f: f.stat().st_mtime, reverse=True)
    return str(files[0]) if files else None

def parse_codex_rate_limits(line: str) -> dict | None:
    """rate_limits из одной строки rollout-транскрипта (payload.rate_limits)."""
    if not line or '"rate_limits"' not in line or "used_percent" not in line:
        return None
    try:
        obj = json.loads(line)
    except Exception:
        return None
    rl = (obj.get("payload") or {}).get("rate_limits") or obj.get("rate_limits")
    if not isinstance(rl, dict) or not (rl.get("primary") or rl.get("secondary")):
        return None
    return {
        "primary": rl.get("primary") or {},
        "secondary": rl.get("secondary") or {},
        "plan_type": rl.get("plan_type"),
    }

def _reset_secs(window: dict):
    # rollout пишет resets_at; на всякий случай поддержим и reset_at
    return seconds_until_epoch(window.get("resets_at") or window.get("reset_at"))

def fetch_codex_usage() -> dict | None:
    path = _newest_rollout()
    if not path:
        return None
    try:
        latest = None
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                rl = parse_codex_rate_limits(line)
                if rl:
                    latest = rl
        return latest
    except Exception as e:
        log.error("Codex fetch error: %s", e)
        return None

def codex_status_text(c: dict) -> str:
    p = c.get("primary") or {}
    s = c.get("secondary") or {}
    p_pct = p.get("used_percent", 0)
    s_pct = s.get("used_percent", 0)
    p_secs = _reset_secs(p)
    s_secs = _reset_secs(s)
    p_line = f"{bar(p_pct)} {p_pct:.0f}% · сброс через <b>{fmt_time(p_secs)}</b>" if p_secs else f"{bar(p_pct)} {p_pct:.0f}%"
    s_line = f"{bar(s_pct)} {s_pct:.0f}% · сброс через <b>{fmt_time(s_secs)}</b>" if s_secs else f"{bar(s_pct)} {s_pct:.0f}%"
    plan = f" · {c['plan_type']}" if c.get("plan_type") else ""
    return (
        f"🤖 <b>Codex · 5ч</b>{plan}\n{p_line}\n\n"
        f"🤖 <b>Codex · неделя</b>\n{s_line}"
    )


# ── Claude API ────────────────────────────────────────────────────────────────

def push_to_supabase(data: dict):
    if not SUPABASE_URL or not SUPABASE_SVC_KEY:
        return
    s = data.get("five_hour") or {}
    w = data.get("seven_day") or {}
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/claude_usage",
            headers={
                "apikey": SUPABASE_SVC_KEY,
                "Authorization": f"Bearer {SUPABASE_SVC_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            json={
                "id": 1,
                "session_pct": s.get("utilization", 0),
                "session_resets_at": s.get("resets_at"),
                "weekly_pct": w.get("utilization", 0),
                "weekly_resets_at": w.get("resets_at"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            timeout=10,
        )
    except Exception as e:
        log.error("Supabase push error: %s", e)


def fetch_usage(retry=True) -> dict | None:
    global _session_key
    try:
        r = requests.get(USAGE_URL, headers={
            "Cookie": f"sessionKey={_session_key}; anthropic-device-id={DEVICE_ID}",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Referer": "https://claude.ai/settings/usage",
            "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin",
        }, timeout=15)
        if r.status_code == 401:
            if retry:
                try:
                    subprocess.run(["python3", "extract_cookie.py"], timeout=30)
                    load_dotenv(override=True)
                    _session_key = os.environ.get("CLAUDE_SESSION_KEY", _session_key)
                    return fetch_usage(retry=False)
                except Exception:
                    pass
            send_tg("🔑 sessionKey истёк. Обнови в .env вручную:\nDevTools → Network → запрос usage → Cookie → sessionKey")
            return None
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.error("Fetch error: %s", e)
        return None


# ── Command listener ──────────────────────────────────────────────────────────

_tg_offset = 0

def poll_commands():
    global _tg_offset
    while True:
        try:
            r = requests.get(
                f"https://api.telegram.org/bot{TG_TOKEN}/getUpdates",
                params={"offset": _tg_offset, "timeout": 30, "allowed_updates": ["message"]},
                timeout=40,
            )
            for upd in r.json().get("result", []):
                _tg_offset = upd["update_id"] + 1
                msg  = upd.get("message", {})
                text = msg.get("text", "").strip().lower()
                cid  = str(msg.get("chat", {}).get("id", ""))
                if text in ("/usage", "/u"):
                    parts = []
                    data = fetch_usage()
                    parts.append(status_text(data) if data else "❌ Claude: не удалось получить данные")
                    c = fetch_codex_usage()
                    if c:
                        parts.append(codex_status_text(c))
                    send_tg("\n\n".join(parts), cid)
                elif text in ("/codex", "/c"):
                    c = fetch_codex_usage()
                    send_tg(codex_status_text(c) if c else "❌ Codex: нет данных (запусти Codex хотя бы раз)", cid)
        except Exception as e:
            log.error("Poll error: %s", e)
        time.sleep(1)


# ── Main loop ─────────────────────────────────────────────────────────────────

def check(state: dict) -> dict:
    data = fetch_usage()
    if not data:
        return state

    s = data.get("five_hour") or {}
    w = data.get("seven_day") or {}
    s_reset = s.get("resets_at")
    w_reset = w.get("resets_at")
    s_pct   = s.get("utilization", 0)
    w_pct   = w.get("utilization", 0)

    log.info("session=%.0f%%  weekly=%.0f%%", s_pct, w_pct)
    push_to_supabase(data)

    WARN_THRESHOLD = 80
    s_secs      = seconds_until(s_reset) if s_reset else None
    w_secs      = seconds_until(w_reset) if w_reset else None
    s_exhausted = s_pct >= 100
    w_exhausted = w_pct >= 100
    s_warn      = s_pct >= WARN_THRESHOLD
    w_warn      = w_pct >= WARN_THRESHOLD

    if not state.get("initialized"):
        # Первый запуск — просто запоминаем текущее состояние, ничего не шлём
        state["session_reset_at"]      = s_reset
        state["weekly_reset_at"]       = w_reset
        state["session_exhausted_sent"] = s_exhausted
        state["weekly_exhausted_sent"]  = w_exhausted
        state["session_warn_sent"]      = s_warn
        state["weekly_warn_sent"]       = w_warn
        state["initialized"]            = True
        save_state(state)
        return state

    # Предупреждение на 80% — сессия
    if s_warn and not s_exhausted and not state.get("session_warn_sent"):
        countdown = f"<b>{fmt_time(s_secs)}</b>" if s_secs else "—"
        send_tg(
            f"⚠️ <b>Сессия на {s_pct:.0f}%</b>\n\n"
            f"Скоро лимит. Сброс через {countdown}\n\n"
            f"{status_text(data)}"
        )
        state["session_warn_sent"] = True

    # Предупреждение на 80% — неделя
    if w_warn and not w_exhausted and not state.get("weekly_warn_sent"):
        countdown = f"<b>{fmt_time(w_secs)}</b>" if w_secs else "—"
        send_tg(
            f"⚠️ <b>Недельный лимит на {w_pct:.0f}%</b>\n\n"
            f"Скоро лимит. Сброс через {countdown}\n\n"
            f"{status_text(data)}"
        )
        state["weekly_warn_sent"] = True

    # Сессия исчерпана (utilization достигла 100%)
    if s_exhausted and not state.get("session_exhausted_sent"):
        countdown = f"<b>{fmt_time(s_secs)}</b>" if s_secs else "—"
        send_tg(
            f"🔴 <b>Сессия исчерпана</b>\n\n"
            f"Сбросится через {countdown}\n\n"
            f"{status_text(data)}"
        )
        state["session_exhausted_sent"] = True

    # Недельный лимит исчерпан
    if w_exhausted and not state.get("weekly_exhausted_sent"):
        countdown = f"<b>{fmt_time(w_secs)}</b>" if w_secs else "—"
        send_tg(
            f"🔴 <b>Недельный лимит исчерпан</b>\n\n"
            f"Сбросится через {countdown}\n\n"
            f"{status_text(data)}"
        )
        state["weekly_exhausted_sent"] = True

    # Сессия восстановилась — лимит был исчерпан (100%), а теперь упал ниже
    if state.get("session_exhausted_sent") and not s_exhausted:
        send_tg(f"⚡️ <b>Пора кодить!</b> Сессия восстановилась\n\n{status_text(data)}")
        state["session_exhausted_sent"] = False

    # Неделя восстановилась
    if state.get("weekly_exhausted_sent") and not w_exhausted:
        send_tg(f"🚀 <b>Пора кодить!</b> Недельные лимиты восстановились\n\n{status_text(data)}")
        state["weekly_exhausted_sent"] = False

    # Сброс флагов предупреждения когда упало ниже порога (новое окно)
    if not s_warn:
        state["session_warn_sent"] = False
    if not w_warn:
        state["weekly_warn_sent"] = False

    state["session_reset_at"] = s_reset or state["session_reset_at"]
    state["weekly_reset_at"]  = w_reset or state["weekly_reset_at"]
    save_state(state)
    return state


def check_codex(state: dict) -> dict:
    c = fetch_codex_usage()
    if not c:
        return state
    p = c.get("primary") or {}
    s = c.get("secondary") or {}
    p_pct = p.get("used_percent", 0)
    s_pct = s.get("used_percent", 0)

    # Данные обновляются только когда Codex работает. Если окно 5ч уже сброшено
    # (reset в прошлом) — данные устарели, не шлём по ним алерты (иначе ложные
    # предупреждения по вчерашнему окну). Команды /usage и /codex показывают как есть.
    p_secs = _reset_secs(p)
    s_secs = _reset_secs(s)
    if (p_secs is not None and p_secs <= 0) and (s_secs is not None and s_secs <= 0):
        return state

    log.info("codex 5h=%.0f%%  week=%.0f%%", p_pct, s_pct)

    WARN = 80
    p_ex, s_ex = p_pct >= 100, s_pct >= 100
    p_warn, s_warn = p_pct >= WARN, s_pct >= WARN

    if not state.get("codex_initialized"):
        state.update({
            "codex_p_ex_sent": p_ex, "codex_s_ex_sent": s_ex,
            "codex_p_warn_sent": p_warn, "codex_s_warn_sent": s_warn,
            "codex_initialized": True,
        })
        save_state(state)
        return state

    if p_warn and not p_ex and not state.get("codex_p_warn_sent"):
        send_tg(f"⚠️ <b>Codex · сессия на {p_pct:.0f}%</b>\n\n{codex_status_text(c)}")
        state["codex_p_warn_sent"] = True
    if s_warn and not s_ex and not state.get("codex_s_warn_sent"):
        send_tg(f"⚠️ <b>Codex · неделя на {s_pct:.0f}%</b>\n\n{codex_status_text(c)}")
        state["codex_s_warn_sent"] = True
    if p_ex and not state.get("codex_p_ex_sent"):
        send_tg(f"🔴 <b>Codex · сессия исчерпана</b>\n\n{codex_status_text(c)}")
        state["codex_p_ex_sent"] = True
    if s_ex and not state.get("codex_s_ex_sent"):
        send_tg(f"🔴 <b>Codex · недельный лимит исчерпан</b>\n\n{codex_status_text(c)}")
        state["codex_s_ex_sent"] = True
    if state.get("codex_p_ex_sent") and not p_ex:
        send_tg(f"⚡️ <b>Codex снова доступен!</b>\n\n{codex_status_text(c)}")
        state["codex_p_ex_sent"] = False
    if state.get("codex_s_ex_sent") and not s_ex:
        send_tg(f"🚀 <b>Codex: недельные лимиты восстановились</b>\n\n{codex_status_text(c)}")
        state["codex_s_ex_sent"] = False
    if not p_warn:
        state["codex_p_warn_sent"] = False
    if not s_warn:
        state["codex_s_warn_sent"] = False

    save_state(state)
    return state


PID_FILE = _data_dir / "monitor.pid"

def main():
    # Prevent multiple instances
    _data_dir.mkdir(parents=True, exist_ok=True)
    if PID_FILE.exists():
        old_pid = int(PID_FILE.read_text().strip())
        try:
            os.kill(old_pid, 0)  # check if process alive
            log.error("Already running (pid=%d). Kill it first: kill %d", old_pid, old_pid)
            return
        except ProcessLookupError:
            pass  # old pid is dead, continue
    PID_FILE.write_text(str(os.getpid()))

    log.info("Monitor started (pid=%d). Commands: /usage", os.getpid())
    threading.Thread(target=poll_commands, daemon=True).start()
    state = load_state()
    try:
        while True:
            try:
                state = check(state)
            except Exception as e:
                log.error("Error: %s", e)
            try:
                state = check_codex(state)
            except Exception as e:
                log.error("Codex error: %s", e)
            time.sleep(POLL_INTERVAL)
    finally:
        PID_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
