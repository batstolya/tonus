# Monolith Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `supabase/functions/send-reminders/index.ts` (717 lines) into responsibility modules and extract navigation/bootstrap/import-handlers from `src/App.tsx` (570 lines), behavior-preserving, as two independent PRs.

**Architecture:** Move-only refactor following the telegram-bot precedent: thin `index.ts` entrypoint + flat sibling modules, each exporting `run<Name>(ctx)` functions over a shared `Ctx = { supabase, nowMs }`. Frontend: pure navigation config in `src/app/navigation.tsx`, side-effect logic in two hooks. No behavior changes; existing comments and spec references move verbatim with their code.

**Tech Stack:** Deno (edge functions, checked by `npm run check:functions`), React 19 + Vite, vitest (node + jsdom projects).

**Spec:** `docs/superpowers/specs/2026-07-18-monolith-decomposition-design.md`

**Environment:** Everything needs Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`. Deno for check:functions: `export PATH="$HOME/.deno/bin:$PATH"`. Working dir is the worktree `/Users/anatolii/tonus/.claude/worktrees/monolith-decomposition`.

**Verification commands (used throughout):**
- `npm test` — full vitest suite (baseline: 692 passed, 2 skipped)
- `npm run check:functions` — deno check over edge-function prod code (baseline: clean)
- `npm run lint` — eslint, zero warnings tolerated
- `npm run build` — tsc + vite build

**Section markers:** Tasks reference the `// ── N. …` section comments in `send-reminders/index.ts`, not line numbers — line numbers shift as code moves. "Move section N" means: cut the entire block from its `── N.` comment down to (not including) the next `── N+1.` comment (or the final `return new Response` for §12), preserving every comment inside.

---

## PR A — send-reminders split

Branch: `refactor/split-send-reminders` off the current worktree branch (which already carries the spec/plan docs).

```bash
git checkout -b refactor/split-send-reminders
```

### Task 1: `ctx.ts` + `time.ts` with tests (TDD)

**Files:**
- Create: `supabase/functions/send-reminders/ctx.ts`
- Create: `supabase/functions/send-reminders/time.ts`
- Create: `supabase/functions/send-reminders/time.test.ts`
- Modify: `supabase/functions/send-reminders/index.ts` (delete moved code, add imports)

- [ ] **Step 1: Write the failing test**

`supabase/functions/send-reminders/time.test.ts` (vitest node project runs `supabase/**/*.test.ts`; deno ignores `*.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { localNow, timeDue } from './time.ts'

describe('timeDue', () => {
  it('fires inside the 5-minute cron window [target, target+5)', () => {
    expect(timeDue('09:00', '09:00')).toBe(true)
    expect(timeDue('09:00', '09:04')).toBe(true)
    expect(timeDue('09:00', '09:05')).toBe(false)
    expect(timeDue('09:00', '08:59')).toBe(false)
  })

  it('handles hour boundaries in pure minute arithmetic', () => {
    expect(timeDue('23:58', '23:59')).toBe(true)
    // window crossing midnight does NOT wrap (documented existing behavior)
    expect(timeDue('23:58', '00:01')).toBe(false)
  })
})

describe('localNow', () => {
  it('returns hh:mm, ISO-like date and 1..7 weekday for a real timezone', () => {
    const r = localNow('Europe/Kyiv')
    expect(r.hhmm).toMatch(/^\d{2}:\d{2}$/)
    expect(r.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.weekday).toBeGreaterThanOrEqual(1)
    expect(r.weekday).toBeLessThanOrEqual(7)
  })

  it('differs across timezones far apart', () => {
    const kyiv = localNow('Europe/Kyiv')
    const tokyo = localNow('Asia/Tokyo')
    // Tokyo is 6-7 hours ahead of Kyiv; at least one field must differ almost always.
    // Compare full tuples to avoid a flaky exact-hour assertion.
    expect(`${tokyo.dateStr} ${tokyo.hhmm}`).not.toBe(`${kyiv.dateStr} ${kyiv.hhmm}`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/send-reminders/time.test.ts`
Expected: FAIL — `Cannot find module './time.ts'`

- [ ] **Step 3: Create `ctx.ts` and `time.ts`**

`supabase/functions/send-reminders/ctx.ts`:

```ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Shared per-run context passed to every section module.
// НЕ ReturnType<typeof createClient>: тот инстанцирует дефолтные генерики
// (schema=never) и не совместим с реальным клиентом.
export type Ctx = {
  supabase: SupabaseClient
  nowMs: number
}
```

`supabase/functions/send-reminders/time.ts` — move `localNow` (with its comment `// Текущее локальное время…`) and `timeDue` (with its comment `// время дозы наступило…`) verbatim from `index.ts`, adding `export`:

```ts
// Текущее локальное время в указанной таймзоне → { hhmm, weekday(1=Пн..7=Вс), dateStr }
export function localNow(tz: string) {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    hhmm: `${parts.hour}:${parts.minute}`,
    weekday: wdMap[parts.weekday] ?? 1,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

// время дозы наступило в текущем 5-минутном окне cron
export function timeDue(target: string, nowHHMM: string): boolean {
  const [th, tm] = target.split(':').map(Number)
  const [nh, nm] = nowHHMM.split(':').map(Number)
  const tMin = th * 60 + tm
  const nMin = nh * 60 + nm
  // окно [target, target+5) — cron тикает каждые 5 мин
  return nMin >= tMin && nMin < tMin + 5
}
```

In `index.ts`: delete both function definitions, add `import { localNow, timeDue } from './time.ts'`.

- [ ] **Step 4: Run tests + deno check**

Run: `npx vitest run supabase/functions/send-reminders/time.test.ts` → PASS (6 tests)
Run: `npm run check:functions` → clean

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-reminders/
git commit -m "refactor(send-reminders): extract time helpers and shared Ctx type"
```

### Task 2: `tg.ts` — Telegram send + transport

**Files:**
- Create: `supabase/functions/send-reminders/tg.ts`
- Modify: `supabase/functions/send-reminders/index.ts`

- [ ] **Step 1: Create `tg.ts`**

Move `tgSend` and the `TG_TOKEN` const from `index.ts`; also move the `transport` construction (currently inline in §2) here as `makeTransport`:

```ts
import { sendTelegram } from '../_shared/telegram.ts'
import { fetchWithTimeout } from '../_shared/http.ts'
import type { TelegramTransport } from '../_shared/reminderDelivery.ts'

const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!

export async function tgSend(chatId: string, text: string, replyMarkup?: unknown): Promise<number | null> {
  const res = await sendTelegram(TG_TOKEN, chatId, text, {
    payload: { parse_mode: 'HTML', reply_markup: replyMarkup },
  })
  if (!res) return null
  const data = await res.json()
  return data?.result?.message_id ?? null
}

export function makeTransport(): TelegramTransport {
  return (body) =>
    fetchWithTimeout(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
}
```

In `index.ts`: delete `tgSend`, delete the `TG_TOKEN` const, replace the inline `const transport: TelegramTransport = …` in §2 with `const transport = makeTransport()`, add `import { tgSend, makeTransport } from './tg.ts'`, drop now-unused imports (`sendTelegram`; keep `fetchWithTimeout` — §5 still uses it until Task 5).

- [ ] **Step 2: Verify**

Run: `npm run check:functions` → clean. Run: `npm test` → 698 passed (692 + 6 new).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-reminders/
git commit -m "refactor(send-reminders): extract telegram send and transport"
```

### Task 3: `doses.ts` (§1)

**Files:**
- Create: `supabase/functions/send-reminders/doses.ts`
- Modify: `supabase/functions/send-reminders/index.ts`

- [ ] **Step 1: Create module, move section 1**

`doses.ts` skeleton — the body between `{}` is section 1 of `index.ts` moved verbatim (the `reminder_settings` query, the `for (const s of settings ?? [])` loop, all comments):

```ts
import { localToIso } from '../_shared/time.ts'
import { localNow, timeDue } from './time.ts'
import type { Ctx } from './ctx.ts'

// ── 1. Создать события для наступивших доз ──────────────────────────────────
export async function runDoseCreation({ supabase }: Ctx): Promise<number> {
  // …moved body; ends with `return created`
}
```

In `index.ts`: replace section 1 with `const created = await runDoseCreation(ctx)` where `ctx: Ctx = { supabase, nowMs }` is built right after `createClient` (define it in this task; keep the existing `nowMs` const). Add import.

- [ ] **Step 2: Verify**

Run: `npm run check:functions` → clean. Run: `npm test` → all pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-reminders/
git commit -m "refactor(send-reminders): extract dose event creation"
```

### Task 4: `delivery.ts` (§2 + §3)

**Files:**
- Create: `supabase/functions/send-reminders/delivery.ts`
- Modify: `supabase/functions/send-reminders/index.ts`

- [ ] **Step 1: Create module**

Two exports. `runDelivery` returns a discriminated union so the §4.1 "config error → visible 500" contract stays in `index.ts`:

```ts
import { localDate } from '../_shared/time.ts'
import {
  deliverReminder, nextActionOnFailure, type ClaimedReminder,
} from '../_shared/reminderDelivery.ts'
import { makeTransport } from './tg.ts'
import type { Ctx } from './ctx.ts'

export type DeliveryCounters = {
  claimed: number; sent: number; skipped: number; retried: number
  failed: number; deliveryUnknown: number; remaining: number
}
export type DeliveryResult =
  | ({ ok: true } & DeliveryCounters)
  | { ok: false; error: string }

// ── 2. Доставка due-событий через атомарный claim (спека automation §2.2–2.3) ─
export async function runDelivery({ supabase }: Ctx): Promise<DeliveryResult> {
  // …moved §2 body. The claim-error early return becomes:
  //   if (claimErr) return { ok: false, error: `claim failed: ${claimErr.message}` }
  // The backlog count (`remaining`) query moves here too (it belongs to §4.2 delivery SLO).
  // Ends with:
  //   return { ok: true, claimed: claimed.length, sent, skipped, retried, failed, deliveryUnknown, remaining: remaining ?? 0 }
}

// ── 3. Пометить просроченные как missed (sent > 3ч без ответа) ───────────────
export async function runMarkMissed({ supabase, nowMs }: Ctx): Promise<void> {
  // …moved §3 body (staleBefore + update)
}
```

In `index.ts`, sections 2–3 become:

```ts
const deliveryRes = await runDelivery(ctx)
if (!deliveryRes.ok) {
  // Ошибка конфигурации/схемы — job обязан упасть видимо, а не вернуть 200 (§4.1).
  return new Response(JSON.stringify({ runId, error: deliveryRes.error }), {
    status: 500, headers: { 'Content-Type': 'application/json' },
  })
}
await runMarkMissed(ctx)
```

The final response object reads `deliveryRes.claimed`, `deliveryRes.sent`, etc. instead of loose variables.

- [ ] **Step 2: Verify**

Run: `npm run check:functions` → clean. Run: `npm test` → all pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-reminders/
git commit -m "refactor(send-reminders): extract claim delivery and missed marking"
```

### Task 5: `dailyNote.ts` (§4 + buildForecastText)

**Files:**
- Create: `supabase/functions/send-reminders/dailyNote.ts`
- Modify: `supabase/functions/send-reminders/index.ts`

- [ ] **Step 1: Create module**

Move `buildForecastText` (whole function with its SPEC-READINESS-FORECAST comment, not exported) and section 4 verbatim:

```ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { localDate } from '../_shared/time.ts'
import { forecastReadiness } from '../_shared/forecast.ts'
import { forecastBlock } from '../_shared/forecastMessage.ts'
import { localNow, timeDue } from './time.ts'
import { tgSend } from './tg.ts'
import type { Ctx } from './ctx.ts'

// …buildForecastText moved verbatim (stays module-private)…

// ── 4. Вечерний вопрос «как прошёл день» (SPEC-DAILY-NOTE) ───────────────────
export async function runDailyNotes({ supabase }: Ctx): Promise<number> {
  // …moved §4 body incl. EVENING_QUESTIONS; ends with `return notesSent`
}
```

In `index.ts`: section 4 → `const notesSent = await runDailyNotes(ctx)`; drop now-unused imports (`forecastReadiness`, `forecastBlock`, and `SupabaseClient` if unused).

- [ ] **Step 2: Verify** — `npm run check:functions` clean, `npm test` pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-reminders/
git commit -m "refactor(send-reminders): extract evening daily-note question"
```

### Task 6: `digests.ts` (§5 + §6)

**Files:**
- Create: `supabase/functions/send-reminders/digests.ts`
- Modify: `supabase/functions/send-reminders/index.ts`

- [ ] **Step 1: Create module**

Env consts used only here move here:

```ts
import { fetchWithTimeout } from '../_shared/http.ts'
import { localNow, timeDue } from './time.ts'
import { tgSend } from './tg.ts'
import type { Ctx } from './ctx.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const INTERNAL_SECRET = Deno.env.get('TONUS_INTERNAL_SECRET') ?? ''

// ── 5. Автоматический двухнедельный отчёт (раз в 14 дней, утром ~09:00) ──────
export async function runBiweeklyReports({ supabase, nowMs }: Ctx): Promise<number> {
  // …moved §5 body (drop the wrapping bare block `{}`); ends with `return reportsSent`
}

// ── 6. Утренняя сводка (B4) ─────────────────────────────────────────────────
export async function runMorningSummaries({ supabase, nowMs }: Ctx): Promise<number> {
  // …moved §6 body; ends with `return morningsSent`
}
```

In `index.ts`: sections 5–6 → two awaited calls; delete `SUPABASE_ANON_KEY`/`INTERNAL_SECRET` consts (now unused there; `SUPABASE_URL` stays — `createClient` needs it) and the `fetchWithTimeout` import.

- [ ] **Step 2: Verify** — `npm run check:functions` clean, `npm test` pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-reminders/
git commit -m "refactor(send-reminders): extract biweekly report and morning summary"
```

### Task 7: `coach.ts` (§7 + §8 + §9)

**Files:**
- Create: `supabase/functions/send-reminders/coach.ts`
- Modify: `supabase/functions/send-reminders/index.ts`

- [ ] **Step 1: Create module**

```ts
import { localNow, timeDue } from './time.ts'
import { tgSend } from './tg.ts'
import type { Ctx } from './ctx.ts'

// ── 7. Проактивные алерты (раз в день ~10:00, дедуп 3 дня) ───────────────────
export async function runProactiveAlerts({ supabase, nowMs }: Ctx): Promise<number> { /* moved §7 */ }

// ── 8. Контекстные nudges коуча (раз в день ~13:00, дедуп 4 дня) ─────────────
// Связывают поведение (события) с результатом по личным данным пользователя.
export async function runCoachNudges({ supabase, nowMs }: Ctx): Promise<number> { /* moved §8 */ }

// ── 9. Резолвер follow-up: подвести итог принятого совета по сроку ───────────
export async function runFollowupResolver({ supabase, nowMs }: Ctx): Promise<number> { /* moved §9 */ }
```

Each returns its counter (`alertsSent` / `nudgesSent` / `followupsSent`). The hrv_drop/rhr_rise deletion rationale comment in §7 moves along. In `index.ts`: three awaited calls.

- [ ] **Step 2: Verify** — `npm run check:functions` clean, `npm test` pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-reminders/
git commit -m "refactor(send-reminders): extract coach alerts, nudges, follow-ups"
```

### Task 8: `reminders.ts` (§10 + §11)

**Files:**
- Create: `supabase/functions/send-reminders/reminders.ts`
- Modify: `supabase/functions/send-reminders/index.ts`

- [ ] **Step 1: Create module**

```ts
import { shiftTime, workoutNotificationText, type DayEntry, type DayTimes } from '../_shared/workoutPlan.ts'
import { stormNotificationClause } from '../_shared/geoStorm.ts'
import { localNow, timeDue } from './time.ts'
import { tgSend } from './tg.ts'
import type { Ctx } from './ctx.ts'

// ── 10. Обобщённые напоминания (фото волос, устаревшие анализы) ───────────────
export async function runGeneralReminders({ supabase, nowMs }: Ctx): Promise<number> { /* moved §10, returns generalRemindersSent */ }

// ── 11. Уведомление о тренировке за N часов (спека workout-schedule §2) ─────
export async function runWorkoutNotices({ supabase }: Ctx): Promise<number> { /* moved §11, returns workoutNoticesSent */ }
```

In `index.ts`: two awaited calls; drop `workoutPlan.ts`/`geoStorm.ts` imports.

- [ ] **Step 2: Verify** — `npm run check:functions` clean, `npm test` pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-reminders/
git commit -m "refactor(send-reminders): extract general and workout reminders"
```

### Task 9: `experiments.ts` (§12) + final thin `index.ts`

**Files:**
- Create: `supabase/functions/send-reminders/experiments.ts`
- Modify: `supabase/functions/send-reminders/index.ts`

- [ ] **Step 1: Create module**

```ts
import { computeBaselineStart, computeResult, type ExpDaily, type ExperimentRow } from '../_shared/experiments.ts'
import { verdictMessage } from '../_shared/experimentVerdict.ts'
import { localNow, timeDue } from './time.ts'
import { tgSend } from './tg.ts'
import type { Ctx } from './ctx.ts'

// ── 12. Автовердикт завершившихся экспериментов (SPEC-EXPERIMENT-LOOP §2.2) ──
// Утром 09:10 локального времени юзера: завершившиеся active-эксперименты
// получают финальный result (атомарно, active→completed) и вердикт в Telegram.
export async function runExperimentVerdicts({ supabase }: Ctx): Promise<number> { /* moved §12, returns verdictsSent */ }
```

- [ ] **Step 2: Verify final `index.ts` shape**

After this task `index.ts` must be exactly (imports elided to those actually used):

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isValidCronSecret } from '../_shared/auth.ts'
import { withObservability } from '../_shared/observability.ts'
import type { Ctx } from './ctx.ts'
import { runDoseCreation } from './doses.ts'
import { runDelivery, runMarkMissed } from './delivery.ts'
import { runDailyNotes } from './dailyNote.ts'
import { runBiweeklyReports, runMorningSummaries } from './digests.ts'
import { runProactiveAlerts, runCoachNudges, runFollowupResolver } from './coach.ts'
import { runGeneralReminders, runWorkoutNotices } from './reminders.ts'
import { runExperimentVerdicts } from './experiments.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('CRON_SECRET') ?? ''

const handler = async (req: Request) => {
  // Fail closed: без корректного cron-секрета не читаем таблицы и не шлём (спека §3.2).
  if (!isValidCronSecret(req, CRON_SECRET)) return new Response('unauthorized', { status: 401 })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const nowMs = Date.now()
  const runId = crypto.randomUUID()
  const ctx: Ctx = { supabase, nowMs }

  const created = await runDoseCreation(ctx)

  const deliveryRes = await runDelivery(ctx)
  if (!deliveryRes.ok) {
    // Ошибка конфигурации/схемы — job обязан упасть видимо, а не вернуть 200 (§4.1).
    return new Response(JSON.stringify({ runId, error: deliveryRes.error }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
  await runMarkMissed(ctx)

  const notesSent = await runDailyNotes(ctx)
  const reportsSent = await runBiweeklyReports(ctx)
  const morningsSent = await runMorningSummaries(ctx)
  const alertsSent = await runProactiveAlerts(ctx)
  const nudgesSent = await runCoachNudges(ctx)
  const followupsSent = await runFollowupResolver(ctx)
  const generalRemindersSent = await runGeneralReminders(ctx)
  const workoutNoticesSent = await runWorkoutNotices(ctx)
  const verdictsSent = await runExperimentVerdicts(ctx)

  // Structured execution result (§4.1) + backlog signal (§4.2)
  const { ok: _ok, ...delivery } = deliveryRes
  return new Response(JSON.stringify({
    runId,
    ...delivery,
    durationMs: Date.now() - nowMs,
    created, notesSent, reportsSent, morningsSent, alertsSent, nudgesSent, followupsSent, generalRemindersSent,
    workoutNoticesSent, verdictsSent,
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(withObservability('edge.send_reminders', handler))
```

JSON response keys must be identical to the original (`runId, claimed, sent, skipped, retried, failed, deliveryUnknown, remaining, durationMs, created, notesSent, reportsSent, morningsSent, alertsSent, nudgesSent, followupsSent, generalRemindersSent, workoutNoticesSent, verdictsSent`) — observability/monitoring may read them.

- [ ] **Step 3: Verify** — `npm run check:functions` clean, `npm test` pass, `npm run lint` clean.

- [ ] **Step 4: Diff audit (move-only proof)**

Run: `git diff refactor/split-send-reminders~8 -- supabase/functions/send-reminders/ | grep -E '^[+-]' | grep -vE '^[+-][+-]' | sort | uniq -c | sort -rn | head -30`
Manually confirm removed lines reappear as added lines (modulo `export`/indent/ctx destructuring). Any logic line present on only one side needs an explanation or a fix.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-reminders/
git commit -m "refactor(send-reminders): extract experiment verdicts, thin index to orchestration"
```

### Task 10: PR A

- [ ] **Step 1: Full local gate**

Run: `npm test && npm run lint && npm run build && npm run check:functions` → all green.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin refactor/split-send-reminders
gh pr create --title "refactor(functions): split send-reminders into responsibility modules" --body "$(cat <<'EOF'
Move-only decomposition of the 717-line send-reminders handler into flat modules
(doses, delivery, dailyNote, digests, coach, reminders, experiments, time, tg)
per docs/superpowers/specs/2026-07-18-monolith-decomposition-design.md.

- No behavior changes; JSON response shape identical
- Fail-closed cron gate and §4.1 error-isolation semantics preserved in index.ts
- New unit tests for pure time helpers (timeDue window math, localNow)

Deploy after merge: npx supabase functions deploy send-reminders, then verify one
cron tick in edge logs (structured result JSON with runId).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Post-merge deploy + smoke** (after CI green and merge)

```bash
npx supabase functions deploy send-reminders --project-ref <ref>
```
Then check edge logs for the next cron tick: expect a 200 with the structured JSON result (or 401s only from unauthorized probes). No 500s.

---

## PR B — App.tsx extraction

Branch off main (independent of PR A):

```bash
git checkout -b refactor/app-shell-extraction origin/main
```

(If PR A hasn't merged yet, the spec/plan docs aren't on main — that's fine, this PR carries only code.)

### Task 11: `src/app/navigation.tsx` with tests (TDD)

**Files:**
- Create: `src/app/navigation.tsx`
- Create: `src/app/navigation.test.tsx` (`.tsx` because the module under test contains JSX; jsdom project)
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

`src/app/navigation.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { NAV_GROUPS, getActiveGroup, getActiveSubView, filterNavGroups } from './navigation'

describe('getActiveGroup', () => {
  it('maps every configured view to its group', () => {
    for (const g of NAV_GROUPS) {
      for (const v of g.views) expect(getActiveGroup(v.view)).toBe(g.id)
    }
  })
  it('maps hair (not in any group) to journal', () => {
    expect(getActiveGroup('hair')).toBe('journal')
  })
  it('returns null for views outside groups', () => {
    expect(getActiveGroup('dashboard')).toBeNull()
    expect(getActiveGroup('settings')).toBeNull()
  })
})

describe('getActiveSubView', () => {
  it('highlights concerns when on hair', () => {
    expect(getActiveSubView('hair')).toBe('concerns')
  })
  it('is identity otherwise', () => {
    expect(getActiveSubView('sleep')).toBe('sleep')
  })
})

describe('filterNavGroups', () => {
  it('hides metric-gated views when the metric is absent', () => {
    const none = { hasHeartRate: false, hasSleep: false, hasActivity: false, hasStress: false }
    const body = filterNavGroups(none as never).find(g => g.id === 'body')!
    expect(body.views.map(v => v.view)).toEqual(['metrics'])
  })
  it('keeps everything when all metrics available', () => {
    const all = { hasHeartRate: true, hasSleep: true, hasActivity: true, hasStress: true }
    const body = filterNavGroups(all as never).find(g => g.id === 'body')!
    expect(body.views).toHaveLength(5)
  })
})
```

Note: check `src/lib/availableMetrics.ts` for the exact `AvailableMetrics` shape before finalizing the fixture objects — if it has more keys, spread them in instead of `as never` casts (prefer a complete literal over casting).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/navigation.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/navigation.tsx`**

Move from `App.tsx` verbatim, adding `export` and the one new pure helper `filterNavGroups` (extracted from the `visibleNavGroups` expression in the component body):

```tsx
import React from 'react'
import type { AppView } from '../store/appStore'
import type { AvailableMetrics } from '../lib/availableMetrics'

export type GroupId = 'body' | 'journal' | 'coach'

export type NavView = { view: AppView; label: string; requiresMetric?: keyof AvailableMetrics }

export const NAV_GROUPS: {
  id: GroupId
  label: string
  defaultView: AppView
  icon: React.ReactElement
  views: NavView[]
}[] = [
  // …the three group objects moved verbatim from App.tsx (body/journal/coach with SVG icons)…
]

export function getActiveGroup(view: AppView): GroupId | null {
  if (view === 'hair') return 'journal'
  for (const g of NAV_GROUPS) {
    if (g.views.some(v => v.view === view)) return g.id
  }
  return null
}

export function getActiveSubView(view: AppView): AppView {
  if (view === 'hair') return 'concerns'
  return view
}

export function filterNavGroups(availableMetrics: AvailableMetrics) {
  return NAV_GROUPS.map(g => ({
    ...g,
    views: g.views.filter(v => !v.requiresMetric || availableMetrics[v.requiresMetric]),
  }))
}
```

(Check whether `AvailableMetrics` is exported from `src/lib/availableMetrics.ts`; if not, export it there — `NavView` already references it via inline `import()` today.)

In `App.tsx`: delete `GroupId`, `NavView`, `NAV_GROUPS`, `getActiveGroup`, `getActiveSubView`; import them from `./app/navigation`; replace the `visibleNavGroups` map expression with `const visibleNavGroups = filterNavGroups(availableMetrics)`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/navigation.test.tsx` → PASS. Run: `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/ src/App.tsx src/lib/availableMetrics.ts
git commit -m "refactor(ui): extract navigation config from App.tsx"
```

### Task 12: `useAppBootstrap` hook

**Files:**
- Create: `src/hooks/useAppBootstrap.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the hook**

Moves three pieces from `App.tsx`: the `intakeEvents`/`dbLoading` state, the timezone-sync effect, and the big `init` effect. All comments move verbatim.

```ts
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isDemoActive } from '../lib/demo'
import { loadMetricsFromSupabase, loadHRSamples } from '../lib/sync'
import { persistDailyScores } from '../lib/scores'
import { loadCalendarEvents } from '../lib/calendarSync'
import { startEffect } from '../lib/startEffect'
import { syncProfileTimezone } from '../lib/api/settings'
import type { IntakeEvent } from '../lib/api/intake'
import type { DailyMetrics, HeartRateSample, CalendarEvent } from '../types'

type Args = {
  user: User | null
  setDaily: (daily: DailyMetrics[], samples: HeartRateSample[], keepView?: boolean) => void
  setEvents: (events: CalendarEvent[], source?: string) => void
}

// Загрузка данных при входе + синк profiles.timezone. Вынесено из App.tsx
// (2026-07-18 monolith-decomposition spec) без изменения поведения.
export function useAppBootstrap({ user, setDaily, setEvents }: Args) {
  const [dbLoading, setDbLoading] = useState(true)
  const [intakeEvents, setIntakeEvents] = useState<IntakeEvent[]>([])

  // Держим profiles.timezone в такт устройству: серверные локальные времена
  // (отчёт, чат, бот) читают эту колонку через _shared/userTimezone.ts.
  const tzSyncUserId = !isDemoActive() && user ? user.id : null
  useEffect(() => {
    if (!tzSyncUserId) return
    startEffect(() => syncProfileTimezone(tzSyncUserId).catch(() => {}))
  }, [tzSyncUserId])

  useEffect(() => {
    let cancelled = false

    async function init() {
      // …init body moved verbatim from App.tsx (demo branch with dynamic imports,
      //  Promise.all load, cancelled guards, persistDailyScores) — the only textual
      //  change: `setIntakeEvents(intakeRes.data as typeof intakeEvents)` becomes
      //  `setIntakeEvents(intakeRes.data as IntakeEvent[])`, and the demo branch's
      //  `demoList('intake_events') as typeof intakeEvents` likewise.
    }

    startEffect(init)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return { dbLoading, intakeEvents, setIntakeEvents }
}
```

In `App.tsx`: delete the moved state/effects, call `const { dbLoading, intakeEvents, setIntakeEvents } = useAppBootstrap({ user, setDaily, setEvents })`. The `intakeEvents` state type changes from `Parameters<typeof QuickLog>[0]['events']` to `IntakeEvent[]` — identical type, clearer name; QuickLog usage compiles unchanged.

- [ ] **Step 2: Verify** — `npm test` (jsdom App tests still pass), `npm run lint`, `npm run build` all green.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAppBootstrap.ts src/App.tsx
git commit -m "refactor(ui): extract app bootstrap into useAppBootstrap hook"
```

### Task 13: `useImportHandlers` hook

**Files:**
- Create: `src/hooks/useImportHandlers.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the hook**

Moves: `syncMsg`, `googleLoading`, `showGoogleEvents`, `calSyncTimes` state; `handleDone`, `handleEvents`, `handleGoogleCalendar`; and the Google auto-sync effect (it calls `handleEvents`, so it lives with them). Function bodies move verbatim, only `t`/`locale`/`user`/store setters arrive via args.

```ts
import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { CalendarEvent, DailyMetrics, HeartRateSample } from '../types'
import { syncMetricsToSupabase, syncHRSamples } from '../lib/sync'
import { persistDailyScores } from '../lib/scores'
import { saveCalendarEvents, loadCalendarEvents } from '../lib/calendarSync'
import { connectGoogleCalendar, silentGoogleCalendarSync, isGoogleCalendarAvailable } from '../lib/googleCalendar'
import { shouldAutoSync } from '../lib/syncSchedule'
import type { useT } from '../lib/i18n'

type Args = {
  user: User | null
  dbLoading: boolean
  t: ReturnType<typeof useT>['t']
  locale: ReturnType<typeof useT>['locale']
  setDaily: (daily: DailyMetrics[], samples: HeartRateSample[], keepView?: boolean) => void
  setEvents: (events: CalendarEvent[], source?: string) => void
}

// Импорт данных (файл/ICS/Google) и авто-синк календаря. Вынесено из App.tsx
// (2026-07-18 monolith-decomposition spec) без изменения поведения.
export function useImportHandlers({ user, dbLoading, t, locale, setDaily, setEvents }: Args) {
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showGoogleEvents, setShowGoogleEvents] = useState(true)
  const [calSyncTimes, setCalSyncTimes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('cal_sync_times') ?? '{}') } catch { return {} }
  })

  // …handleDone, handleEvents, handleGoogleCalendar moved verbatim…

  // Авто-синхронизация Google Calendar «хотя бы раз в день» … (comment moves verbatim)
  const googleAutoSyncedRef = useRef(false)
  useEffect(() => {
    // …moved verbatim…
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dbLoading])

  return {
    syncMsg, googleLoading, showGoogleEvents, setShowGoogleEvents,
    calSyncTimes, handleDone, handleEvents, handleGoogleCalendar,
  }
}
```

In `App.tsx`: delete moved code, call the hook after `useAppBootstrap` (it needs `dbLoading`).

- [ ] **Step 2: Verify** — `npm test`, `npm run lint`, `npm run build` green.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useImportHandlers.ts src/App.tsx
git commit -m "refactor(ui): extract import handlers into useImportHandlers hook"
```

### Task 14: Final check + PR B

- [ ] **Step 1: Confirm App.tsx size and content**

Run: `wc -l src/App.tsx` → expect ≤ ~300 lines (lazy imports + component with layout/JSX only).
Confirm all `lazy(() => import(…))` declarations are still in `App.tsx` (unchanged chunking).

- [ ] **Step 2: Verify in browser (demo mode)**

Per the running-tonus skill: ensure `.env.local` with dummy keys exists, start the dev server via preview tools, open with `VITE_DEMO=1`/demo button, click through: dashboard → Тело/Дневник/Коуч groups → subnav (Стресс, Проблемы → Волосы back-nav) → Настройки → language/theme switches. Expect no console errors, navigation highlights identical to before.

- [ ] **Step 3: Full gate**

Run: `npm test && npm run lint && npm run build` → green.

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin refactor/app-shell-extraction
gh pr create --title "refactor(ui): extract navigation and bootstrap from App.tsx" --body "$(cat <<'EOF'
Move-only decomposition of the 570-line App.tsx per
docs/superpowers/specs/2026-07-18-monolith-decomposition-design.md:

- src/app/navigation.tsx — NAV_GROUPS + group/subview resolvers (+ unit tests)
- src/hooks/useAppBootstrap.ts — auth-dependent data load, tz sync
- src/hooks/useImportHandlers.ts — file/ICS/Google import + calendar auto-sync
- App.tsx keeps lazy imports (unchanged chunking) and layout only

No behavior changes; verified in demo mode (navigation, imports UI, theming).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Frontend deploys automatically after merge via green CI → Vercel hook.

---

## Self-review notes

- Spec coverage: every module in the spec's target layouts has a task (Tasks 1–9 cover all 12 sections + time/tg/ctx; Tasks 11–13 cover navigation + both hooks); tests match the spec's testing section; delivery §-by-§ counters and the two-PR delivery plan are Tasks 10/14.
- Deviations from spec, both amended in the spec file: `buildForecastText` lives in `dailyNote.ts` (its real consumer), navigation module is `.tsx` (JSX icons).
- `remaining` backlog count moved into `runDelivery` (it's the §4.2 delivery-SLO signal); response key unchanged.
