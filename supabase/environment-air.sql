-- Add air quality + pollen to environment_daily (Phase 10c)
-- Run once in Supabase SQL Editor (or via Management API). Applied 2026-06-21.

alter table public.environment_daily add column if not exists air_quality int;   -- European AQI, дневное среднее
alter table public.environment_daily add column if not exists pollen numeric;     -- суммарная пыльца grains/m³, дневное среднее
