-- Environment data table (weather + daylight from Open-Meteo)
-- Run once in Supabase SQL Editor

create table if not exists public.environment_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  temp_c numeric,
  pressure_hpa numeric,
  daylight_minutes int,
  precipitation_mm numeric,
  created_at timestamptz not null default now(),
  unique(user_id, date)
);

alter table public.environment_daily enable row level security;

create policy "users see own environment" on public.environment_daily for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists environment_daily_user_date_idx on public.environment_daily(user_id, date);
