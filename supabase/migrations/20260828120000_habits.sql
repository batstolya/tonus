-- Abstinence habits: a day is clean unless a break was recorded.
-- Spec: docs/superpowers/specs/2026-08-28-habits-design.md
--
-- Inverted from supplements: `supplement_logs` records success, `habit_breaks`
-- records failure. The table is sparse on purpose -- a clean month stores zero
-- rows, which is a valid state rather than missing data. `start_date` is what
-- keeps that inversion honest: without it an empty log would claim clean days
-- back to account creation.

create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  note text,
  start_date date not null default current_date,
  active boolean not null default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

create index if not exists habits_user_active_idx on habits (user_id, active);

alter table habits enable row level security;
do $policy$ begin
  create policy "own" on habits for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

create table if not exists habit_breaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  habit_id uuid references habits(id) on delete cascade not null,
  date date not null,
  note text,
  created_at timestamptz default now(),
  unique (user_id, habit_id, date)
);

create index if not exists habit_breaks_user_date_idx on habit_breaks (user_id, date desc);

alter table habit_breaks enable row level security;
do $policy$ begin
  create policy "own" on habit_breaks for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- One function both marks and clears, because Telegram knows the intent but not
-- whether a row already exists. Mirrors log_supplement_dose: the bot runs on the
-- service role and resolves the user itself, so the user id is a parameter, and
-- an authenticated caller may only pass its own.
create or replace function public.set_habit_break(
  p_user_id uuid,
  p_habit_id uuid,
  p_date date,
  p_broken boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_start date;
begin
  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'forbidden';
  end if;

  select start_date into v_start
  from habits
  where id = p_habit_id and user_id = p_user_id;

  if v_start is null then
    raise exception 'habit not found';
  end if;

  if p_date < v_start then
    raise exception 'date precedes habit start';
  end if;

  if p_broken then
    insert into habit_breaks (user_id, habit_id, date)
    values (p_user_id, p_habit_id, p_date)
    on conflict (user_id, habit_id, date) do nothing;
  else
    delete from habit_breaks
    where user_id = p_user_id and habit_id = p_habit_id and date = p_date;
  end if;

  return p_broken;
end;
$$;

revoke all on function public.set_habit_break(uuid, uuid, date, boolean) from public;
grant execute on function public.set_habit_break(uuid, uuid, date, boolean) to authenticated, service_role;

-- Account deletion has to reach the new tables too, or this history outlives
-- the account. The whole function is restated because Postgres has no way to
-- patch one statement of a function body; only the habit_breaks/habits
-- deletes are new (habit_breaks first, since it references habits).
create or replace function public.delete_user_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_count integer;
begin
  delete from public.chat_messages where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('chat_messages', v_count);
  delete from public.habit_breaks where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('habit_breaks', v_count);
  delete from public.habits where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('habits', v_count);
  delete from public.concern_logs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('concern_logs', v_count);
  delete from public.goal_progress where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('goal_progress', v_count);
  delete from public.lab_results where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('lab_results', v_count);
  delete from public.reminder_events where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('reminder_events', v_count);
  delete from public.reminder_settings where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('reminder_settings', v_count);
  delete from public.supplement_logs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('supplement_logs', v_count);
  delete from public.treatments where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('treatments', v_count);
  delete from public.intake_events where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('intake_events', v_count);
  delete from public.chat_sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('chat_sessions', v_count);
  delete from public.health_concerns where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('health_concerns', v_count);
  delete from public.goals where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('goals', v_count);
  delete from public.lab_files where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('lab_files', v_count);
  delete from public.supplements where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('supplements', v_count);
  delete from public.recommendations where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('recommendations', v_count);
  delete from public.ai_analyses where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('ai_analyses', v_count);
  delete from public.ai_processing_consents where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('ai_processing_consents', v_count);
  delete from public.ai_usage where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('ai_usage', v_count);
  delete from public.cal_sync where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('cal_sync', v_count);
  delete from public.calendar_events where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('calendar_events', v_count);
  delete from public.coach_events where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('coach_events', v_count);
  delete from public.coach_profile where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('coach_profile', v_count);
  delete from public.context_notes where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('context_notes', v_count);
  delete from public.daily_note_settings where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('daily_note_settings', v_count);
  delete from public.daily_scores where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('daily_scores', v_count);
  delete from public.environment_daily where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('environment_daily', v_count);
  delete from public.experiments where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('experiments', v_count);
  delete from public.football_match_reminders where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('football_match_reminders', v_count);
  delete from public.football_match_responses where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('football_match_responses', v_count);
  delete from public.football_user_settings where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('football_user_settings', v_count);
  delete from public.hair_entries where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('hair_entries', v_count);
  delete from public.health_alerts where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('health_alerts', v_count);
  delete from public.heart_rate_samples where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('heart_rate_samples', v_count);
  delete from public.ideas where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('ideas', v_count);
  delete from public.imports where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('imports', v_count);
  delete from public.ingest_raw where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('ingest_raw', v_count);
  delete from public.ingest_tokens where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('ingest_tokens', v_count);
  delete from public.metrics_daily where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('metrics_daily', v_count);
  delete from public.metrics_daily_staging where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('metrics_daily_staging', v_count);
  delete from public.observations where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('observations', v_count);
  delete from public.report_settings where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('report_settings', v_count);
  delete from public.research_runs where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('research_runs', v_count);
  delete from public.scheduled_reports where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('scheduled_reports', v_count);
  delete from public.sleep_sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('sleep_sessions', v_count);
  delete from public.sleep_sessions_staging where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('sleep_sessions_staging', v_count);
  delete from public.telegram_link_tokens where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('telegram_link_tokens', v_count);
  delete from public.telegram_links where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('telegram_links', v_count);
  delete from public.widget_tokens where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('widget_tokens', v_count);
  delete from public.workout_schedule where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('workout_schedule', v_count);
  delete from public.profiles where id = p_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('profiles', v_count);
  return v_result;
end $$;

revoke all on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;
