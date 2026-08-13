-- Backfill for 20260813120000_sleep_awake_hours.sql.
--
-- NOT a migration, on purpose: it reads `ingest_raw`, whose payloads are the
-- only surviving copy of what the phone sent, and writes a column the ingest
-- will keep filling on its own. Run it once, read the row counts it prints.
--
-- Coverage is bounded by ingest_raw, which starts 2026-06-19. Nights imported
-- from the Apple Health XML export (back to 2021) keep awake_hours NULL: the
-- XML importer discards awake intervals, and NULL is the honest answer there.
--
-- The four rules below mirror _shared/hae.ts exactly. If that heuristic ever
-- changes, this script is wrong and must change with it:
--   * the night is keyed by left(date, 10)::date — a local-date string slice,
--     matching dayOf() in hae.ts, never a timestamptz cast (which shifts
--     dates near local midnight by a day)
--   * a value above 16 is minutes, not hours
--   * a value below 0 or above 6 hours is not a night's awake time
--   * a total_sleep of 0, or above 16 hours, is not a night's sleep either
--
-- Run:  psql "$TONUS_DB_URL" -f scripts/backfill-sleep-awake.sql

begin;

with points as (
  select r.user_id,
         -- String slice, not timestamptz cast: dayOf() in hae.ts:28 takes the local
         -- date exactly as written (e.g., "2026-08-13" from "2026-08-13 00:00:00 +0200").
         -- A ::timestamptz cast would convert to UTC first, shifting dates near
         -- local midnight by one day (2026-08-13 00:00:00 +0200 → 2026-08-12 22:00:00 UTC).
         -- Match hae.ts exactly: left(string, 10)::date.
         left(p.value ->> 'date', 10)::date      as night,
         (p.value ->> 'awake')::numeric          as raw_awake,
         (p.value ->> 'totalSleep')::numeric     as raw_total_sleep
    from public.ingest_raw r
    cross join lateral jsonb_array_elements(r.payload -> 'data' -> 'metrics') m(value)
    cross join lateral jsonb_array_elements(m.value -> 'data') p(value)
   where m.value ->> 'name' = 'sleep_analysis'
     and jsonb_typeof(p.value -> 'awake') = 'number'
     and p.value ->> 'date' is not null
),
normalized as (
  select user_id, night,
         case when raw_awake > 16 then raw_awake / 60 else raw_awake end as awake_hours,
         case when raw_total_sleep > 16 then raw_total_sleep / 60 else raw_total_sleep end as total_sleep
    from points
),
plausible as (
  select user_id, night, awake_hours, total_sleep
    from normalized
   where awake_hours >= 0 and awake_hours <= 6
     and total_sleep is not null and total_sleep > 0 and total_sleep <= 16
),
-- One payload can carry several sessions for a night, and a night can appear
-- in several payloads. hae.ts keeps the longest sleep; do the same here.
picked as (
  select distinct on (user_id, night) user_id, night, awake_hours
    from plausible
   order by user_id, night, total_sleep desc nulls last
)
update public.sleep_sessions s
   set awake_hours = picked.awake_hours
  from picked
 where s.user_id = picked.user_id
   and s.date = picked.night
   and s.awake_hours is null;

-- Print what changed before deciding to keep it.
select count(*) filter (where awake_hours is not null) as with_awake,
       count(*)                                        as total_nights,
       min(date) filter (where awake_hours is not null) as first_night,
       max(date) filter (where awake_hours is not null) as last_night
  from public.sleep_sessions;

commit;
