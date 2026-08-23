-- Multiple doses per day for supplements.
-- Spec: docs/superpowers/specs/2026-08-23-supplement-multi-dose-design.md
--
-- `taken` stays as the boolean seven consumers already read; it now holds the
-- invariant taken = (taken_count > 0), enforced by a trigger so that every
-- writer -- web upsert, Telegram RPC, raw SQL -- keeps the two columns in sync.

alter table supplements
  add column if not exists doses_per_day int not null default 1;

do $c$ begin
  alter table supplements
    add constraint supplements_doses_per_day_range check (doses_per_day between 1 and 10);
exception when duplicate_object then null; end $c$;

alter table supplement_logs
  add column if not exists taken_count int not null default 1;

do $c$ begin
  alter table supplement_logs
    add constraint supplement_logs_taken_count_nonneg check (taken_count >= 0);
exception when duplicate_object then null; end $c$;

-- Rows written before this migration mean exactly one dose.
update supplement_logs set taken_count = 0 where taken is not true and taken_count <> 0;

create or replace function public.sync_supplement_log_taken()
returns trigger
language plpgsql
as $$
begin
  new.taken := new.taken_count > 0;
  return new;
end;
$$;

drop trigger if exists supplement_logs_sync_taken on supplement_logs;
create trigger supplement_logs_sync_taken
  before insert or update on supplement_logs
  for each row execute function public.sync_supplement_log_taken();

-- Atomic increment for Telegram, where the caller knows the delta but not the
-- current count. Clamped to [0, doses_per_day]; returns the new count.
-- The Telegram bot runs on the service role and resolves the user itself, so
-- the user id is a parameter; an authenticated caller may only pass its own.
create or replace function public.log_supplement_dose(
  p_user_id uuid,
  p_supplement_id uuid,
  p_date date,
  p_delta int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_max int;
  v_next int;
begin
  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'forbidden';
  end if;

  select doses_per_day into v_max
  from supplements
  where id = p_supplement_id and user_id = p_user_id;

  if v_max is null then
    raise exception 'supplement not found';
  end if;

  insert into supplement_logs (user_id, supplement_id, date, taken_count)
  values (p_user_id, p_supplement_id, p_date, least(greatest(p_delta, 0), v_max))
  on conflict (user_id, supplement_id, date) do update
    set taken_count = least(greatest(supplement_logs.taken_count + p_delta, 0), v_max)
  returning taken_count into v_next;

  return v_next;
end;
$$;

revoke all on function public.log_supplement_dose(uuid, uuid, date, int) from public;
grant execute on function public.log_supplement_dose(uuid, uuid, date, int) to authenticated, service_role;
