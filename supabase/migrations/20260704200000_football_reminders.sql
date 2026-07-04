-- Football Match Reminders MVP
-- Run in Supabase SQL Editor, then deploy:
--   npx supabase functions deploy sync-football-fixtures --project-ref mxnmubakfzqoosgsqmhh
--   npx supabase functions deploy send-football-reminders --project-ref mxnmubakfzqoosgsqmhh
--   npx supabase functions deploy telegram-bot --project-ref mxnmubakfzqoosgsqmhh

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;

create table if not exists football_matches (
  id uuid primary key default gen_random_uuid(),

  provider text not null default 'api-football',
  provider_fixture_id bigint unique,
  short_id text unique,

  league_id int not null,
  season int not null,
  competition_name text not null,
  round_name text,

  home_team_id bigint,
  home_team_name text not null,
  home_team_code text,
  home_team_logo text,

  away_team_id bigint,
  away_team_name text not null,
  away_team_code text,
  away_team_logo text,

  kickoff_at timestamptz not null,
  venue_name text,
  venue_city text,

  status_short text not null default 'NS',
  status_long text not null default 'Not Started',

  raw_payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_football_matches_kickoff_at
  on football_matches(kickoff_at);

create index if not exists idx_football_matches_status
  on football_matches(status_short);

create index if not exists idx_football_matches_league_season
  on football_matches(league_id, season);

create unique index if not exists idx_football_matches_short_id
  on football_matches(short_id);

alter table football_matches enable row level security;
drop policy if exists "football matches readable" on football_matches;
create policy "football matches readable"
  on football_matches for select
  using (auth.uid() is not null);

create table if not exists football_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,

  telegram_chat_id bigint not null,
  timezone text not null default 'Europe/Berlin',

  reminders_enabled boolean not null default true,
  reminder_minutes_before int not null default 30,

  watch_all_worldcup boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table football_user_settings enable row level security;
drop policy if exists "own football user settings" on football_user_settings;
create policy "own football user settings"
  on football_user_settings for all
  using (auth.uid() = user_id);

do $$
begin
  create type football_reminder_status as enum (
    'pending',
    'processing',
    'sent',
    'skipped',
    'failed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists football_match_reminders (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references football_matches(id) on delete cascade,

  reminder_type text not null default 'pre_match_30',
  scheduled_at timestamptz not null,

  status football_reminder_status not null default 'pending',
  sent_at timestamptz,
  telegram_message_id bigint,
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id, match_id, reminder_type)
);

create index if not exists idx_football_match_reminders_due
  on football_match_reminders(status, scheduled_at);

alter table football_match_reminders enable row level security;
drop policy if exists "own football match reminders" on football_match_reminders;
create policy "own football match reminders"
  on football_match_reminders for all
  using (auth.uid() = user_id);

do $$
begin
  create type football_watch_response as enum (
    'watching',
    'not_watching'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists football_match_responses (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references football_matches(id) on delete cascade,

  response football_watch_response not null,
  responded_at timestamptz not null default now(),

  telegram_callback_query_id text,
  telegram_message_id bigint,

  unique(user_id, match_id)
);

alter table football_match_responses enable row level security;
drop policy if exists "own football match responses" on football_match_responses;
create policy "own football match responses"
  on football_match_responses for all
  using (auth.uid() = user_id);

create or replace function generate_football_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into football_match_reminders (
    user_id,
    match_id,
    reminder_type,
    scheduled_at
  )
  select
    fus.user_id,
    fm.id,
    'pre_match_30',
    fm.kickoff_at - make_interval(mins => fus.reminder_minutes_before)
  from football_user_settings fus
  cross join football_matches fm
  where fus.reminders_enabled = true
    and fus.watch_all_worldcup = true
    and fm.kickoff_at > now()
    and fm.status_short in ('NS', 'TBD')
  on conflict(user_id, match_id, reminder_type)
  do update set
    scheduled_at = excluded.scheduled_at,
    status = 'pending',
    error_message = null,
    updated_at = now()
  where football_match_reminders.status in ('pending', 'failed')
    and football_match_reminders.scheduled_at is distinct from excluded.scheduled_at;

  get diagnostics inserted_count = row_count;

  update football_match_reminders r
  set status = 'cancelled',
      updated_at = now()
  from football_matches m
  where r.match_id = m.id
    and r.status in ('pending', 'processing')
    and m.status_short in ('PST', 'CANC', 'ABD');

  return inserted_count;
end;
$$;

create or replace function claim_due_football_reminders()
returns table (
  reminder_id uuid,
  user_id uuid,
  match_id uuid,
  match_short_id text,
  telegram_chat_id bigint,
  timezone text,
  home_team_name text,
  away_team_name text,
  kickoff_at timestamptz,
  competition_name text,
  round_name text,
  venue_name text,
  venue_city text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select r.id
    from football_match_reminders r
    join football_matches m on m.id = r.match_id
    where r.status = 'pending'
      and r.scheduled_at <= now()
      and r.scheduled_at > now() - interval '20 minutes'
      and m.kickoff_at > now()
      and m.status_short in ('NS', 'TBD')
    order by r.scheduled_at asc
    limit 50
    for update skip locked
  ),
  claimed as (
    update football_match_reminders r
    set status = 'processing',
        updated_at = now()
    from due
    where r.id = due.id
    returning r.*
  )
  select
    c.id as reminder_id,
    c.user_id,
    c.match_id,
    m.short_id as match_short_id,
    s.telegram_chat_id,
    s.timezone,
    m.home_team_name,
    m.away_team_name,
    m.kickoff_at,
    m.competition_name,
    m.round_name,
    m.venue_name,
    m.venue_city
  from claimed c
  join football_matches m on m.id = c.match_id
  join football_user_settings s on s.user_id = c.user_id
  where s.reminders_enabled = true;
end;
$$;

create or replace function mark_football_reminder_sent(
  p_reminder_id uuid,
  p_telegram_message_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update football_match_reminders
  set status = 'sent',
      sent_at = now(),
      telegram_message_id = p_telegram_message_id,
      error_message = null,
      updated_at = now()
  where id = p_reminder_id;
end;
$$;

create or replace function mark_football_reminder_failed(
  p_reminder_id uuid,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update football_match_reminders
  set status = 'failed',
      error_message = left(p_error_message, 2000),
      updated_at = now()
  where id = p_reminder_id;
end;
$$;

grant execute on function generate_football_reminders() to service_role;
grant execute on function claim_due_football_reminders() to service_role;
grant execute on function mark_football_reminder_sent(uuid, bigint) to service_role;
grant execute on function mark_football_reminder_failed(uuid, text) to service_role;

select cron.unschedule('sync-football-fixtures-every-30-min')
where exists (select 1 from cron.job where jobname = 'sync-football-fixtures-every-30-min');

select cron.schedule(
  'sync-football-fixtures-every-30-min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/sync-football-fixtures',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

select cron.unschedule('send-football-reminders-every-5-min')
where exists (select 1 from cron.job where jobname = 'send-football-reminders-every-5-min');

select cron.schedule(
  'send-football-reminders-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/send-football-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
