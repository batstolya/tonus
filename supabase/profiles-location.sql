-- Add weather location to profiles (geolocation / city-search for fetch-environment).
-- Without these columns the Settings "Дані середовища" card errors:
--   "Could not find the 'latitude' column of 'profiles' in the schema cache".
-- Run once in Supabase SQL Editor (or via Management API). Applied 2026-06-22.

alter table public.profiles add column if not exists latitude numeric;        -- широта, из геолокации/поиска города
alter table public.profiles add column if not exists longitude numeric;       -- долгота
alter table public.profiles add column if not exists location_label text;      -- человекочитаемая метка (напр. "Мюнхен")

notify pgrst, 'reload schema';
