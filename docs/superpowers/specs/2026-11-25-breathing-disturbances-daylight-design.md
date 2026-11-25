# Sleep breathing disturbances and personal time in daylight — design

Status: approved 2026-11-25. Size: small change.

## Intent

The owner's Apple Watch Series 10 already sends 31 metric types through
Health Auto Export (HAE); Tonus parses 14 plus sleep. Two of the dropped ones
carry real signal and need no new data source:

- `breathing_disturbances` — Apple's per-night "Breathing Disturbances"
  (events per hour, the basis of Series 10 sleep apnea notifications).
- `time_in_daylight` — minutes the watch's ambient light sensor saw daylight.

Goal: store both, backfill history, show them, and use personal daylight as a
correlation factor.

## Data shape (verified against prod `ingest_raw`, 2026-11-18..25)

- `breathing_disturbances`, units `count`: one point per night, dated in the
  early morning of the wake-up day (e.g. `2026-11-20 02:36:00 +0100`, qty 2.29).
  `dayOf()` therefore lands it on the same date as that night's `sleep_sessions`
  row. Observed range 0–2.3.
- `time_in_daylight`, units `min`: per-minute points with qty 0..1 (fraction of
  the minute). Daily value = sum.

## Goals

1. Parse both in `_shared/hae.ts` (autosync + mobile, same parser):
   `breathing_disturbances → breathingDisturbances` (avg metric),
   `time_in_daylight → daylightMinutes` (sum metric, rounded to whole minutes).
2. Parity in the ZIP importer (`healthParser.worker.ts`):
   `HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances`,
   `HKQuantityTypeIdentifierTimeInDaylight`.
3. Load into `DailyMetrics` (`sync.ts`) as `breathingDisturbances`,
   `daylightMinutes`; keep the ZIP save path writing them too.
4. One-off backfill script: re-parse `ingest_raw` with `parseHAE` and upsert
   only these two metrics into `metrics_daily`.
5. Sleep screen: "Breathing disturbances" row — last night's value and the
   personal 30-day average. No "apnea" wording and no normal/elevated verdict:
   Apple does not publish its threshold and we do not invent a medical norm.
6. Metrics screen: charts for both.
7. Correlations: new factor `sunlight` (personal daylight minutes) next to the
   existing weather `daylight` factor, in both web and `_shared` copies.

## Non-goals

AI chat context, anomaly detector, Telegram alerts, the other 15 unused
metrics, HAE workouts export. Candidates for a follow-up.

## Anti-goals

- Presenting breathing disturbances as a diagnosis.
- Confusing personal daylight with weather day length — they stay separate
  factors with distinct labels.
- Counting a missing value as zero (use `num()`; no point → no row).

## Approaches considered

- **Chosen: plain `metrics_daily` rows via the existing parser.** Matches how
  every other metric flows; backfill is a re-parse of raw payloads.
- New columns on `sleep_sessions` for breathing disturbances — rejected: needs a
  migration and a second write path, and the value is already a daily metric.
- Read straight from `ingest_raw` in the UI — rejected: raw is not a read model.

## Left to the builder

Exact labels/translations (follow `adding-translations`), chart styling (reuse
existing metric chart), whether `daily_metrics` view gets the columns (only if
a server-side consumer in scope needs them — none does now, so no migration).
