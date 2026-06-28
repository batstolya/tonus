-- Age + sex on profiles, for the AI "ideal supplement timing" feature.
-- Without these columns the supplements page AI schedule errors:
--   "Could not find the 'birth_year' column of 'profiles' in the schema cache".
-- Run once in Supabase SQL Editor (or via Management API).

alter table public.profiles add column if not exists birth_year int;   -- год рождения (для возраста)
alter table public.profiles add column if not exists sex text;          -- 'male' | 'female' | null

notify pgrst, 'reload schema';
