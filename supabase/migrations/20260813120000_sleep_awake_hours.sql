-- Night-time awake hours, as reported by Health Auto Export in the
-- `awake` field of `sleep_analysis`. Nullable on purpose: NULL means the
-- night predates this column (or the source sent no field), 0 means the
-- source measured zero. Time in bed and sleep efficiency are derived from
-- duration_hours + awake_hours and are deliberately not stored.
alter table public.sleep_sessions
  add column if not exists awake_hours numeric;

alter table public.sleep_sessions_staging
  add column if not exists awake_hours real;
