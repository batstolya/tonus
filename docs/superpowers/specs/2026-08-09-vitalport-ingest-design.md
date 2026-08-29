# VitalPort Ingest Adapter Design

**Date:** 2026-08-09
**Status:** Approved for implementation planning

## Goal

Accept VitalPort's daily Apple Health JSON in Tonus so an iPhone paired with a
Xiaomi band can use the existing automatic health-ingest pipeline without a
paid Health Auto Export or HealthSave subscription.

The first release is backend-only. It prepares a real endpoint for an evening
phone test; onboarding and settings copy remain unchanged until that test
confirms the external app's behavior.

## Existing system

`supabase/functions/ingest-health/index.ts` already provides the required
security and persistence boundary:

- a per-user ingest token supplied as `?token=` or `x-ingest-token`;
- a durable per-token rate limit;
- raw payload retention in `ingest_raw`;
- parsing into daily metric and sleep rows;
- isolated `shadow` and production `live` modes;
- promotion, score recomputation, anomaly detection, and sync status updates.

VitalPort can POST JSON to an arbitrary HTTPS webhook. It can therefore use the
same personal URL Tonus already generates for Health Auto Export:

```text
https://<project>.supabase.co/functions/v1/ingest-health?token=<user-token>
```

No new public function, token table, database migration, or deployment secret
is needed.

## Chosen architecture

Add a small, pure VitalPort adapter beside the existing HAE parser. The ingest
handler detects VitalPort's daily-snapshot envelope, converts it to the frozen
HAE-compatible internal payload, and then runs the existing `parseHAE()` path.
HAE and the Tonus mobile sender continue through their current path unchanged.

```text
VitalPort JSON
  -> detect payload shape
  -> adapt daily snapshots to HAE metrics
  -> existing parseHAE()
  -> existing staging/live persistence and downstream processing
```

Keeping conversion separate from HTTP and database code makes the external
contract independently testable and prevents a second implementation of
deduplication, units, and promotion rules.

## Payload recognition and validation

A request is treated as VitalPort only when a top-level array contains snapshot
objects with a string `id`, a parseable string `date`, and at least one known
VitalPort measurement key. The array may be named `snapshots`,
`dailySnapshots`, or `days`; no recursive or arbitrary-array search is used.
Merely sharing an individual field name such as `stepCount` is not enough.
Unknown or malformed JSON continues to produce no parsed rows rather than being
guessed into the wrong format.

Each snapshot is processed independently. A value is emitted only when it is a
finite number and passes the metric-specific range check. `null`, missing
fields, numeric strings, booleans, `NaN`, infinities, and negative values are
not measurements and are omitted. A real zero remains valid for cumulative
activity metrics but does not create a zero-length sleep session.

Accepted inclusive ranges are: steps `0..200000`, walking/running distance
`0..500000` metres, active energy `0..20000` kcal, exercise `0..1440` minutes,
resting heart rate `20..250` bpm, HRV `0..1000` ms, oxygen saturation `0..100`
percent, respiratory rate `1..100` breaths/minute, and VO2 max `1..100`.
Sleep candidates must be greater than zero and no more than 57,600 seconds
(16 hours). Values outside these bounds remain only in `ingest_raw`.

The original unmodified VitalPort body is stored in `ingest_raw`, preserving
fields Tonus does not yet model and evidence for troubleshooting.

## Date semantics

VitalPort represents the start of a local day as an ISO instant. For example,
`2026-08-05T22:00:00Z` is local midnight on 6 August in Europe/Berlin. Slicing
the UTC string would shift every record one day backward.

For VitalPort requests, the handler loads the authenticated user's
`profiles.timezone`. The adapter formats each valid snapshot instant into a
`YYYY-MM-DD` calendar date in that IANA timezone. If the profile timezone is
missing or invalid, the adapter uses UTC deterministically and records no
invented offset. The existing web bootstrap already keeps `profiles.timezone`
synchronized with the user's device.

## Metric mapping

The first release emits only metrics already understood by Tonus. Unsupported
VitalPort fields remain available in `ingest_raw` for a later, separately
designed expansion.

| VitalPort snapshot field | HAE metric | Conversion | Tonus result |
| --- | --- | --- | --- |
| `stepCount` | `step_count` | round to an integer | `steps.sum_val` |
| `walkingRunningDistanceMeters` | `distance_walking_running` | keep metres; the existing parser converts to km | `distance.sum_val` |
| `activeEnergyKcal` | `active_energy` | keep kcal and mark units `kcal` | `activeEnergy.sum_val` |
| `exerciseMinutes` | `apple_exercise_time` | round to an integer | `exerciseMinutes.sum_val` |
| `restingHeartRate` | `resting_heart_rate` | daily value | `restingHeartRate.avg_val` |
| `hrv` | `heart_rate_variability` | milliseconds | `hrv.avg_val` |
| `bloodOxygenSaturationPercent` | `blood_oxygen_saturation` | keep percent; the existing parser normalizes it to a fraction | `oxygenSaturation.avg_val` |
| `respiratoryRate` | `respiratory_rate` | breaths per minute | `respiratoryRate.avg_val` |
| `vo2Max` | `vo2_max` | daily value | `vo2max.avg_val` |

`restingEnergyKcal`, `weightKg`, body-fat fields, workout objects, and other
currently unsupported fields are not silently mapped to unrelated metrics.

## Xiaomi sleep fallback

The observed Xiaomi/Mi Fitness chain writes only duration-like `In Bed` data to
Apple Health. VitalPort consequently sends:

```json
{
  "sleepHours": 0,
  "sleepBreakdown": {
    "asleepSeconds": 0,
    "inBedSeconds": 23020.45742201805,
    "stages": []
  }
}
```

The adapter chooses sleep duration in this order:

1. positive `sleepBreakdown.asleepSeconds`;
2. positive `sleepHours` converted to seconds;
3. positive `sleepBreakdown.inBedSeconds` as an explicit Xiaomi fallback.

It converts the chosen duration to hours and emits `sleep_analysis`. Durations
outside `(0, 16]` hours are omitted by the existing parser. No deep, REM, or
core values are fabricated. Bedtime and wake time remain `null` because the
daily snapshot does not provide them.

The fallback is intentionally an approximation: Tonus receives the only sleep
duration exposed through Apple Health, not Xiaomi's internal stage model.

## Idempotency and source identity

Every generated point uses source `VitalPort · Apple Health`. Existing daily
upserts make retries idempotent by user, date, and metric. Existing
sum-within-source/max-across-sources logic prevents a parallel VitalPort and HAE
test from adding the same steps, distance, or energy together.

VitalPort's snapshot `id` is not used as a database key in this release. The
daily tables are already keyed by the business identity Tonus uses.

## Errors and observability

Authentication, rate limiting, malformed JSON responses, raw-payload capture,
and `last_ingest_at`/`last_status` updates retain their current behavior. The
successful response stays backward-compatible and reports the parsed metric and
sleep counts.

Failure of the profile-timezone lookup must not make valid health data
unreceivable; UTC is the deterministic fallback. Database write failures remain
visible in the existing status string.

## Testing

Pure adapter tests cover:

- recognition of the VitalPort envelope;
- the captured Xiaomi daily snapshots;
- local-day conversion of `22:00Z` to the following Berlin date;
- DST-safe IANA timezone formatting;
- metric names and units;
- preservation of zero versus omission of `null` and invalid numbers;
- percentage oxygen normalization through `parseHAE()`;
- sleep precedence and the `inBedSeconds` fallback;
- no fabricated sleep stages;
- rejection of malformed snapshots;
- compatibility: an HAE payload is not classified or modified as VitalPort.

The existing HAE parser suite remains the regression boundary. Repository tests,
the Edge Function type check, and lint/build checks run before handoff.

## Evening acceptance test

1. Obtain the user's existing personal auto-sync URL from Tonus.
2. In VitalPort, choose **Custom Webhook**, paste that full URL, keep auth type
   `None`, save, and run the connectivity test.
3. Send a generated export while the ingest token is in `shadow` mode.
4. Confirm a raw payload, expected staging metric rows, the corrected local
   dates, and an approximate sleep row.
5. Only after inspection, switch the token to `live`, send again, and verify the
   dashboard. Keep the source in shadow if the real envelope differs from the
   captured preview.

## Non-goals

- No onboarding or settings UI changes.
- No production deployment during the implementation session.
- No Xiaomi Cloud integration or sleep-stage recovery.
- No new database metrics for resting energy, weight, or body fat.
- No separate VitalPort credentials or token lifecycle.
- No promise of exact background delivery timing; iOS controls that schedule.
