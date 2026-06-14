-- Run this in Supabase SQL Editor

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  timezone text default 'Europe/Berlin',
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Import log
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  period_start date,
  period_end date,
  records_added int default 0,
  imported_at timestamptz default now()
);
alter table public.imports enable row level security;
create policy "own imports" on public.imports using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Daily metrics (one row per user+date+metric)
create table if not exists public.metrics_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  metric text not null,
  avg_val numeric,
  min_val numeric,
  max_val numeric,
  sum_val numeric,
  count_val int,
  json_val jsonb,
  constraint metrics_daily_unique unique (user_id, date, metric)
);
alter table public.metrics_daily enable row level security;
create policy "own metrics" on public.metrics_daily using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists metrics_daily_user_date on public.metrics_daily(user_id, date);

-- Sleep sessions (one row per user+date)
create table if not exists public.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  bedtime timestamptz,
  wake_time timestamptz,
  duration_hours numeric,
  deep_hours numeric,
  rem_hours numeric,
  core_hours numeric,
  constraint sleep_sessions_unique unique (user_id, date)
);
alter table public.sleep_sessions enable row level security;
create policy "own sleep" on public.sleep_sessions using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Intake events (coffee, alcohol, meals, etc.)
create table if not exists public.intake_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null,
  type text not null,
  amount numeric,
  unit text,
  note text,
  created_at timestamptz default now()
);
alter table public.intake_events enable row level security;
create policy "own intake" on public.intake_events using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists intake_events_user_ts on public.intake_events(user_id, ts);

-- Calendar events (from .ics, cal.com, Google Calendar)
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  uid text not null,
  title text not null,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  description text,
  location text,
  source text default 'ics',
  constraint calendar_events_unique unique (user_id, uid)
);
alter table public.calendar_events enable row level security;
create policy "own calendar" on public.calendar_events using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists calendar_events_user_ts on public.calendar_events(user_id, start_ts);
