-- Telegram links (one per user)
create table if not exists telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  telegram_chat_id text not null,
  telegram_username text,
  status text not null default 'active', -- active | paused
  linked_at timestamptz default now()
);
alter table telegram_links enable row level security;
create policy "own" on telegram_links using (auth.uid() = user_id);

-- Saved biweekly reports
create table if not exists scheduled_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  period_start date not null,
  period_end date not null,
  content text not null,
  channel text,
  delivered_at timestamptz,
  created_at timestamptz default now()
);
alter table scheduled_reports enable row level security;
create policy "own" on scheduled_reports using (auth.uid() = user_id);

-- Report settings
create table if not exists report_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  paused boolean default false,
  frequency_days integer default 14,
  next_report_at timestamptz
);
alter table report_settings enable row level security;
create policy "own" on report_settings using (auth.uid() = user_id);

-- daily_summary view (used by biweekly-report function)
create or replace view daily_summary as
select
  user_id,
  date,
  resting_heart_rate,
  hrv,
  sleep_hours,
  steps,
  active_energy,
  oxygen_saturation
from daily_metrics;

-- One-time tokens for linking Telegram account (expires in 10 min)
create table if not exists telegram_link_tokens (
  token text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
-- No RLS needed — only service role uses this table
