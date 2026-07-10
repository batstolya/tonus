# Automation Reliability (первый релиз) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medication reminders становятся идемпотентными: атомарный claim через RPC (`FOR UPDATE SKIP LOCKED`), state machine c lease/retry/`delivery_unknown`, timezone-фиксы, structured job result.

**Architecture:** Append-only миграция добавляет поля state machine на `reminder_events` + 3 RPC (`claim_due_reminder_events`, `complete_reminder_delivery`, `fail_reminder_delivery`). Worker (`send-reminders` блок 2) перестаёт делать select+send+update: он получает claimed rows из RPC (с chat/supplement/timezone), шлёт через транспорт и подтверждает переход c `claim_token`. Чистая delivery-логика — в vitest-тестируемом `_shared/reminderDelivery.ts`. Остальные блоки (3–10) не переписываются (второй релиз пропущен по scope-решению).

**Tech Stack:** Postgres 17 RPC (plpgsql), Deno edge fn, vitest.

**Source spec:** `docs/superpowers/specs/architecture-hardening/2026-07-09-automation-reliability-design.md` — только первый релиз (§2.2–2.4, §4.1, сокращённый §4.3). Пререквизит (cron secret из security-спеки) выполнен — PR #17 смержен.

**Ответы на §8 (зафиксированы):**
1. Telegram Bot API **не имеет** idempotency key у `sendMessage` → принята `delivery_unknown`-policy: network-throw после отправки запроса = терминальный `delivery_unknown` без авторетрая; HTTP-ответ с `ok:false` = подтверждённый неуспех → retry до 3 попыток.
2. Отдельная таблица delivery attempts НЕ нужна — поля на `reminder_events` (один канал доставки).
3. Lease 10 мин (2× cron-интервал), max 3 attempts.
4. Наблюдение — structured result + runbook SQL (PostgREST/SQL Editor).
5. Все responsibilities остаются в одном координаторе (решено в scope review).

---

### Task 1: Ветка + план

- [ ] `git checkout -b feature/automation-reliability` (от свежего main), commit плана.

### Task 2: Чистая delivery-логика (TDD)

**Files:** Create `supabase/functions/_shared/reminderDelivery.ts`, `supabase/functions/_shared/reminderDelivery.test.ts`

Модуль без Deno-импортов. Экспорты:

```ts
export type SendOutcome =
  | { kind: 'sent'; messageId: number | null }
  | { kind: 'confirmed_failure'; error: string }   // Telegram ответил ok:false / non-2xx
  | { kind: 'unknown'; error: string }             // network throw: запрос мог дойти

export interface ClaimedReminder {
  id: string; user_id: string; due_at: string
  claim_token: string; attempt_count: number
  telegram_chat_id: string | null
  supplement_name: string | null; default_dose: string | null; unit: string | null
  timezone: string | null
}

// Транспорт = абстракция fetch (мокается в тестах)
export type TelegramTransport = (body: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>

export function reminderMessage(ev: ClaimedReminder): { text: string; keyboard: unknown }
export async function deliverReminder(transport: TelegramTransport, ev: ClaimedReminder): Promise<SendOutcome>
// Зеркало политики в fail_reminder_delivery (SQL) — менять синхронно!
export function nextActionOnFailure(attemptCount: number, unknown: boolean, maxAttempts?: number): 'retry' | 'failed' | 'delivery_unknown'
```

Тесты (по спеке §5 «worker contract» + retry policy):
- `deliverReminder`: json `{ok:true,result:{message_id}}` → sent; `{ok:false,description}` → confirmed_failure; transport throw → unknown; HTTP 500 → confirmed_failure (Telegram не принял).
- `nextActionOnFailure`: (1,false)→retry, (3,false)→failed, (1,true)→delivery_unknown, (3,true)→delivery_unknown.
- `reminderMessage`: имя+доза в тексте, 4 кнопки callback_data с id события.
- local-date: `localDate('Europe/Kyiv'|'Europe/Berlin'|'UTC', edge-моменты у полуночи)` — существующий хелпер `_shared/time.ts`, тесты фиксируют границу для supplement_logs-проверки.

- [ ] Тест → красный → реализация → зелёный → commit.

### Task 3: Миграция state machine + RPC

**File:** Create `supabase/migrations/20260710150000_reminder_delivery_state.sql`

```sql
-- Automation reliability, первый релиз (спека §2.2–2.3).
alter table reminder_events
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists sent_at timestamptz;

create index if not exists reminder_events_claim_idx
  on reminder_events (status, due_at);

-- Атомарный claim: pending + наступившие snoozed + протухшие processing.
create or replace function claim_due_reminder_events(
  p_limit integer default 20,
  p_lease_minutes integer default 10,
  p_max_attempts integer default 3
) returns table (
  id uuid, user_id uuid, due_at timestamptz,
  claim_token uuid, attempt_count integer,
  telegram_chat_id text, supplement_name text,
  default_dose text, unit text, timezone text
)
language plpgsql security definer set search_path = public as $$
begin
  -- processing, исчерпавшие попытки после истёкшего lease → failed (терминально)
  update reminder_events r set status = 'failed',
    last_error = coalesce(r.last_error, 'lease expired after max attempts')
  where r.status = 'processing'
    and r.claimed_at < now() - make_interval(mins => p_lease_minutes)
    and r.attempt_count >= p_max_attempts;

  return query
  with candidates as (
    select r.id from reminder_events r
    where (r.status = 'pending')
       or (r.status = 'snoozed' and r.snooze_until is not null and r.snooze_until <= now())
       or (r.status = 'processing'
           and r.claimed_at < now() - make_interval(mins => p_lease_minutes)
           and r.attempt_count < p_max_attempts)
    order by r.due_at asc, r.id asc
    limit p_limit
    for update skip locked
  ), claimed as (
    update reminder_events r
    set status = 'processing', claimed_at = now(),
        claim_token = gen_random_uuid(), attempt_count = r.attempt_count + 1
    from candidates c where r.id = c.id
    returning r.*
  )
  select cl.id, cl.user_id, cl.due_at, cl.claim_token, cl.attempt_count,
         tl.telegram_chat_id, s.name, s.default_dose, s.unit, rs.timezone
  from claimed cl
  left join telegram_links tl on tl.user_id = cl.user_id and tl.status = 'active'
  left join supplements s on s.id = cl.supplement_id
  left join reminder_settings rs on rs.user_id = cl.user_id and rs.supplement_id = cl.supplement_id
  order by cl.due_at asc, cl.id asc;
end; $$;

-- Успешный переход processing → sent|taken|skipped. Только актуальный claim_token.
create or replace function complete_reminder_delivery(
  p_event_id uuid, p_claim_token uuid,
  p_telegram_message_id bigint default null,
  p_status text default 'sent'
) returns boolean
language plpgsql security definer set search_path = public as $$
declare updated integer;
begin
  if p_status not in ('sent','taken','skipped') then
    raise exception 'invalid completion status %', p_status;
  end if;
  update reminder_events set
    status = p_status,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    responded_at = case when p_status in ('taken','skipped') then now() else responded_at end,
    tg_message_id = coalesce(p_telegram_message_id, tg_message_id),
    last_error = null
  where id = p_event_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics updated = row_count;
  return updated = 1;
end; $$;

-- Неуспех: подтверждённый → pending (retry) либо failed после max_attempts;
-- неизвестный исход (network) → delivery_unknown, БЕЗ авторетрая (спека §2.2).
-- Зеркало _shared/reminderDelivery.ts nextActionOnFailure — менять синхронно!
create or replace function fail_reminder_delivery(
  p_event_id uuid, p_claim_token uuid, p_error text,
  p_unknown boolean default false, p_max_attempts integer default 3
) returns boolean
language plpgsql security definer set search_path = public as $$
declare updated integer;
begin
  update reminder_events set
    status = case
      when p_unknown then 'delivery_unknown'
      when attempt_count >= p_max_attempts then 'failed'
      else 'pending' end,
    last_error = left(p_error, 2000)
  where id = p_event_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics updated = row_count;
  return updated = 1;
end; $$;

revoke all on function claim_due_reminder_events(integer, integer, integer) from public, anon, authenticated;
revoke all on function complete_reminder_delivery(uuid, uuid, bigint, text) from public, anon, authenticated;
revoke all on function fail_reminder_delivery(uuid, uuid, text, boolean, integer) from public, anon, authenticated;
grant execute on function claim_due_reminder_events(integer, integer, integer) to service_role;
grant execute on function complete_reminder_delivery(uuid, uuid, bigint, text) to service_role;
grant execute on function fail_reminder_delivery(uuid, uuid, text, boolean, integer) to service_role;
```

- [ ] Написать миграцию, commit. (Проверка на живой БД — при `db push`, локального PG нет.)

### Task 4: Worker на claim/complete/fail + timezone-фиксы

**File:** Modify `supabase/functions/send-reminders/index.ts` блок 2 (строки 72–127) + импорты.

- Импорт: `deliverReminder`, `nextActionOnFailure` типы из `../_shared/reminderDelivery.ts`; `localDate` из `../_shared/time.ts`.
- Блок 2 → rpc-цикл:

```ts
const runId = crypto.randomUUID()
const t0 = Date.now()
const { data: claimed, error: claimErr } = await supabase.rpc('claim_due_reminder_events', { p_limit: 20 })
if (claimErr) return new Response(JSON.stringify({ runId, error: 'claim failed: ' + claimErr.message }), { status: 500, ... })
let sent = 0, skippedCnt = 0, retried = 0, failedCnt = 0, unknownCnt = 0
const transport: TelegramTransport = (body) =>
  fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
for (const ev of (claimed ?? []) as ClaimedReminder[]) {
  try {
    // §2.4: локальная дата события в его timezone, не UTC-дата сервера
    const localDay = localDate(ev.timezone || 'Europe/Kyiv', new Date(ev.due_at))
    const { data: log } = await supabase.from('supplement_logs').select('taken')
      .eq('user_id', ev.user_id).eq('supplement_id', ev.supplement_id).eq('date', localDay).maybeSingle()
    if (log?.taken) { await supabase.rpc('complete_reminder_delivery', { p_event_id: ev.id, p_claim_token: ev.claim_token, p_status: 'taken' }); skippedCnt++; continue }
    if (!ev.telegram_chat_id) { await supabase.rpc('fail_reminder_delivery', { p_event_id: ev.id, p_claim_token: ev.claim_token, p_error: 'no active telegram link', p_unknown: false }); failedCnt++; continue }
    const outcome = await deliverReminder(transport, ev)
    if (outcome.kind === 'sent') { await supabase.rpc('complete_reminder_delivery', { p_event_id: ev.id, p_claim_token: ev.claim_token, p_telegram_message_id: outcome.messageId }); sent++ }
    else {
      const action = nextActionOnFailure(ev.attempt_count, outcome.kind === 'unknown')
      await supabase.rpc('fail_reminder_delivery', { p_event_id: ev.id, p_claim_token: ev.claim_token, p_error: outcome.error, p_unknown: outcome.kind === 'unknown' })
      if (action === 'retry') retried++; else if (action === 'delivery_unknown') unknownCnt++; else failedCnt++
    }
  } catch (e) {
    await supabase.rpc('fail_reminder_delivery', { p_event_id: ev.id, p_claim_token: ev.claim_token, p_error: String(e).slice(0, 500), p_unknown: false }).catch(() => {})
    failedCnt++
  }
}
```

- `claim_due_reminder_events` должен возвращать и `supplement_id` (для supplement_logs-проверки) — добавить в RETURNS TABLE и SELECT.
- §2.4 фикс 2: `kyivHour` (блок 8, строка 309) — `(getUTCHours()+3)%24` ломается на зимнем времени → заменить на `Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',hour12:false}).format(new Date(iso)))`.
- Structured result (§4.1): `{ runId, claimed: (claimed??[]).length, sent, skipped: skippedCnt, retried, failed: failedCnt, delivery_unknown: unknownCnt, remaining, durationMs, created, notesSent, ... }`; `remaining` = count pending после цикла (`head:true, count:'exact'`).
- Блоки 3–10 без изменений (кроме kyivHour).

- [ ] Реализация, `npm test`, `npm run build`, commit.

### Task 5: Runbook (§4.3 сокращённый)

**File:** Create `docs/guides/reminders-ops.md` — как посмотреть pending/processing/failed/delivery_unknown, как снять stuck lease (`update ... set status='pending', claim_token=null where status='processing' and claimed_at < now()-interval '1 hour'` — только по runbook), как безопасно повторить failed (`update ... set status='pending', attempt_count=0 where id=... and status='failed'`), что означает delivery_unknown (Telegram мог доставить — проверить чат перед ретраем), как проверить последние job results.

- [ ] Написать, commit.

### Task 6: Gate + PR

- [ ] `npm test` (все, включая новые), `npm run build`, lint не хуже baseline.
- [ ] Push, PR: rollout-чеклист по §6 (миграция `db push` ДО деплоя функции; интеграционная проверка параллельного claim — на живой БД после push; cutover: старый cron продолжает работать — тот же endpoint, повторный деплой функции атомарен).

## Self-Review
- §2.2 поля/статусы → Task 3; §2.3 claim/complete/fail c token → Tasks 3–4; §2.4 UTC-date и DST-час → Task 4 (глобальные Kyiv-гейты дневных блоков — второй релиз, пропущено по scope); §4.1 → Task 4; §4.3 → Task 5; §5 чистая логика → Task 2 (DB-integration тесты параллельного claim требуют локального PG — нет Docker; проверка на живой БД после push, отмечено в PR).
- Вопрос №1 §8 (обязателен до реализации) — закрыт: idempotency key отсутствует → delivery_unknown policy.
