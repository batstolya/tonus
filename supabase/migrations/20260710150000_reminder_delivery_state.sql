-- Automation reliability, первый релиз (спека §2.2–2.3):
-- state machine доставки medication reminders + атомарный claim через RPC.
-- pending/snoozed -> processing -> sent|taken|skipped|missed|failed|delivery_unknown

alter table reminder_events
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists sent_at timestamptz;

create index if not exists reminder_events_claim_idx
  on reminder_events (status, due_at);

-- Атомарный claim: due pending + наступившие snoozed + protuhшие processing
-- (lease истёк, попытки не исчерпаны). FOR UPDATE SKIP LOCKED: два
-- параллельных запуска не получают одну строку.
create or replace function claim_due_reminder_events(
  p_limit integer default 20,
  p_lease_minutes integer default 10,
  p_max_attempts integer default 3
) returns table (
  id uuid,
  user_id uuid,
  supplement_id uuid,
  due_at timestamptz,
  claim_token uuid,
  attempt_count integer,
  telegram_chat_id text,
  supplement_name text,
  default_dose text,
  unit text,
  timezone text
)
language plpgsql security definer set search_path = public as $$
begin
  -- processing с истёкшим lease и исчерпанными попытками → failed (терминально)
  update reminder_events r
  set status = 'failed',
      last_error = coalesce(r.last_error, 'lease expired after max attempts')
  where r.status = 'processing'
    and r.claimed_at < now() - make_interval(mins => p_lease_minutes)
    and r.attempt_count >= p_max_attempts;

  return query
  with candidates as (
    select r.id
    from reminder_events r
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
    set status = 'processing',
        claimed_at = now(),
        claim_token = gen_random_uuid(),
        attempt_count = r.attempt_count + 1
    from candidates c
    where r.id = c.id
    returning r.id, r.user_id, r.supplement_id, r.due_at, r.claim_token, r.attempt_count
  )
  select cl.id, cl.user_id, cl.supplement_id, cl.due_at, cl.claim_token, cl.attempt_count,
         tl.telegram_chat_id, s.name, s.default_dose, s.unit, rs.timezone
  from claimed cl
  left join telegram_links tl on tl.user_id = cl.user_id and tl.status = 'active'
  left join supplements s on s.id = cl.supplement_id
  left join reminder_settings rs on rs.user_id = cl.user_id and rs.supplement_id = cl.supplement_id
  order by cl.due_at asc, cl.id asc;
end; $$;

-- Успешный переход processing → sent|taken|skipped.
-- Неактуальный claim_token → 0 строк → false: старый worker не может
-- испортить повторно заclaim-ленный event.
create or replace function complete_reminder_delivery(
  p_event_id uuid,
  p_claim_token uuid,
  p_telegram_message_id bigint default null,
  p_status text default 'sent'
) returns boolean
language plpgsql security definer set search_path = public as $$
declare updated integer;
begin
  if p_status not in ('sent', 'taken', 'skipped') then
    raise exception 'invalid completion status %', p_status;
  end if;
  update reminder_events set
    status = p_status,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    responded_at = case when p_status in ('taken', 'skipped') then now() else responded_at end,
    tg_message_id = coalesce(p_telegram_message_id, tg_message_id),
    last_error = null
  where id = p_event_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics updated = row_count;
  return updated = 1;
end; $$;

-- Неуспех доставки. Подтверждённый (Telegram ответил ok:false) → pending
-- (ретрай следующим тиком) либо failed после p_max_attempts. Неизвестный
-- исход (network throw: сообщение могло дойти, у Telegram нет idempotency
-- key) → терминальный delivery_unknown БЕЗ авторетрая (спека §2.2).
-- ЗЕРКАЛО _shared/reminderDelivery.ts nextActionOnFailure — менять синхронно!
create or replace function fail_reminder_delivery(
  p_event_id uuid,
  p_claim_token uuid,
  p_error text,
  p_unknown boolean default false,
  p_max_attempts integer default 3
) returns boolean
language plpgsql security definer set search_path = public as $$
declare updated integer;
begin
  update reminder_events set
    status = case
      when p_unknown then 'delivery_unknown'
      when attempt_count >= p_max_attempts then 'failed'
      else 'pending'
    end,
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
