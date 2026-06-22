-- Геолокация пользователя для данных среды (погода/давление/AQI/пыльца через Open-Meteo).
-- Применить один раз в Supabase SQL Editor.
-- Если координаты не заданы — fetch-environment использует Мюнхен по умолчанию.

alter table public.profiles
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists location_label text;
