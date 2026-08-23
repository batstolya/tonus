-- A running log of what the user notices, unattached to any concern.
-- Spec: docs/superpowers/specs/2026-08-23-observations-design.md
--
-- date + at_time repeat the pair concern_logs uses, so both kinds of entry sort
-- through the same comparator and an entry without a time behaves identically.

create table if not exists observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  at_time time,
  tag text not null default 'other',
  note text not null,
  created_at timestamptz default now()
);

do $c$ begin
  alter table observations
    add constraint observations_tag_known
    check (tag in ('sleep', 'skin', 'gut', 'wellbeing', 'other'));
exception when duplicate_object then null; end $c$;

create index if not exists observations_user_date_idx on observations (user_id, date desc);

alter table observations enable row level security;
do $policy$ begin
  create policy "own" on observations for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;

-- Account deletion has to reach the new table too, or these notes outlive the
-- account they belong to. The whole function is restated because Postgres has
-- no way to patch one statement of a function body; only the observations
-- delete is new.
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
