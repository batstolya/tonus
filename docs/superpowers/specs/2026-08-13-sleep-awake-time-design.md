# Sleep: night-time awake time and sleep efficiency

Date: 2026-08-13
Status: approved, ready for planning

## Problem

Apple Health shows how long the user was awake during the night (orange spikes
on the Sleep chart, "Awake 9 min" in the Stages list). Tonus shows nothing.

The data is not missing at the source. A production payload check
(`ingest_raw`, latest row 2026-08-13 09:14 UTC) shows `sleep_analysis` carries
the field on every night present in the last 25 payloads:

```json
{ "rem": 2.11, "core": 5.71, "deep": 0.52,
  "awake": 0.1498, "totalSleep": 8.3499,
  "inBedStart": "2026-08-13 01:13:43 +0200",
  "inBedEnd":   "2026-08-13 09:43:42 +0200" }
```

`awake: 0.1498 h` is 9 minutes — exactly what the phone displays for that
night. The parser in `supabase/functions/_shared/hae.ts` never reads the field,
`sleep_sessions` has no column for it, so the value is discarded on arrival.

## Scope

In scope: total awake time per night, time in bed, sleep efficiency — stored,
backfilled from raw payloads, and surfaced in the sleep screen, the AI context
and the doctor report.

Out of scope: the **number** of awakenings and their timestamps. HAE collapses
a night into one aggregate row; individual awake episodes exist only as
HealthKit samples with `value = 2`, which the mobile client currently filters
out (`apps/mobile/src/health/read.ts`). That is a separate piece of work on the
mobile side.

Also out of scope: history before 2026-06-19. `ingest_raw` starts there, while
`sleep_sessions` reaches back to 2021 via a one-off XML import. Teaching the
XML parser to read awake intervals was considered and deliberately deferred.

## Design

### Schema

One new column, not three:

```sql
alter table public.sleep_sessions add column awake_hours numeric;
alter table public.sleep_sessions_staging add column awake_hours real;
```

`inBedStart`/`inBedEnd` are redundant — in the observed payloads they equal
`sleepStart`/`sleepEnd`, and the arithmetic closes: 8.35 h asleep + 0.15 h
awake = 8.50 h, exactly the in-bed span. Time in bed and efficiency are
therefore derived, not stored.

`NULL` means "not known" (nights ingested before this change); `0` means "Apple
measured zero". The distinction drives whether the UI renders a value or
nothing at all, so it must survive the whole path — this is the same trap
`num()` in `hae.ts` already documents for sleep phases.

### Ingest

`hae.ts`: add `awake` to `HaePoint` and `awake_hours` to `SleepRow`. Read it
with the existing `num()` guard and the same `toH()` minutes-or-hours
heuristic used for the phases. Keep the existing per-day selection rule (the
row with the longest sleep wins).

Implausible values (`awake > 6`) become `NULL` rather than dropping the whole
night: a bad awake reading must not cost us the sleep duration.

`ingest-health/index.ts` needs no change — it upserts whole `SleepRow`s into
both the staging and the live table.

### Derived values

New module `apps/web/src/lib/sleepQuality.ts`, pure functions, the single home
of the formula:

- `timeInBedHours(duration, awake)` → `duration + awake`
- `sleepEfficiency(duration, awake)` → `duration / (duration + awake)`,
  returning `null` when `awake` is `null`

The edge functions get the same arithmetic; `_shared` is the boundary they can
import from, so the sleep-context code there computes it locally rather than
reaching into `apps/web`.

### Consumers

- **Sleep screen** — "Awake: 9 min" and "Efficiency: 98%" alongside the phase
  breakdown. When `awake_hours` is `NULL` the rows are not rendered at all; no
  dashes, no zeros.
- **AI context** (`supabase/functions/_shared/healthContext.ts`) — awake time
  and efficiency in the nightly summary, so the model can reason about
  fragmented sleep instead of judging a night by its total.
- **Doctor report** — the numbers join the sleep section, and the
  `MISSING_LINES` entry in `apps/web/src/lib/doctorReport/markdown.ts` is
  rewritten: time in bed and efficiency are now present, the count of
  awakenings still is not. The line must stay truthful about what is missing —
  that is its entire purpose.

### Backfill

`scripts/backfill-sleep-awake.sql`, in the style of the existing
`backfill-lab-*.sql`: unnest `ingest_raw.payload` with `jsonb_array_elements`,
pick the `sleep_analysis` metric, and set `awake_hours` where it is currently
`NULL`. Covers 2026-06-19 to today. Run by the user — it mutates production.

## Testing

- `hae.test.ts` — awake is parsed; a minutes-shaped value is converted; an
  absent field yields `NULL`, never `0`; an implausible value nulls the field
  but keeps the night.
- `sleepQuality.test.ts` — efficiency arithmetic and `null` propagation.
- Sleep screen component test — the rows disappear when `awake_hours` is
  `NULL` and render when it is present.
- Doctor report tests already assert the `MISSING_LINES` contents and will
  need updating in step with the rewritten line.

## Verification

Beyond tests: after deploy, re-run the payload comparison for a recent night
and confirm the stored `awake_hours` matches what Apple Health displays.
