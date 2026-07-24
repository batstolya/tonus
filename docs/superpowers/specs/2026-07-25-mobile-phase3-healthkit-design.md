# Mobile Phase 3 — HealthKit Sync (draft)

**Date:** 2026-07-25
**Status:** **DRAFT — not approved.** Written unattended, from the actual
`ingest-health` source and live npm data rather than from memory. The library
question the parent design left open is now answered by evidence; two genuine
decisions remain at the bottom.
**Parent:** `2026-07-18-mobile-monorepo-design.md` (Phase 3)
**Depends on:** Phase 2 (#139, merged) and Phase 2b auth (`#143`, draft) — sync
needs a signed-in user to attribute samples to.

## Goal

The app reads Apple Health on the phone and delivers it to the existing
`ingest-health` edge function, so Tonus stops depending on the third-party
Health Auto Export app. This is the mobile app's entire reason to exist; every
screen is optional next to it.

## The server contract (read from the source, not assumed)

`supabase/functions/ingest-health/index.ts` is 297 lines and already does
everything the phone needs. **The mobile app should speak HAE's dialect rather
than get an endpoint of its own** — no server change, one parser, one dedup
implementation.

- **Auth is an ingest token, not a JWT.** The function reads
  `?token=` or the `x-ingest-token` header, looks it up in `ingest_tokens`, and
  derives `user_id` from the row. It is deployed `--no-verify-jwt`.
- **Payload shape:** `{ data: { metrics: [{ name, units, data: [point…] }] } }`.
  Points carry `date`, `source`, and either `qty`/`value` (sums) or
  `Avg`/`Min`/`Max` (averages); sleep uses its own point shape
  (`totalSleep`/`deep`/`rem`/`core`, `sleepStart`, `sleepEnd`).
- **Metrics it understands** (`METRIC_MAP`, 14 of them): `step_count`,
  `distance_walking_running` / `walking_running_distance`, `active_energy`,
  `apple_exercise_time`, `flights_climbed`, `heart_rate`,
  `resting_heart_rate`, `walking_heart_rate_average`,
  `heart_rate_variability`, `blood_oxygen_saturation`, `respiratory_rate`,
  `apple_sleeping_wrist_temperature`, `vo2_max`, plus `sleep_analysis`.
  Anything else is silently ignored — sending more is harmless, sending fewer
  loses data.
- **Units the server expects:** distance in km (values >100 are treated as
  metres and divided), active energy in kcal (kJ converted only when `units`
  says so), oxygen saturation as a fraction. The phone must either match these
  or set `units` truthfully.
- **Dedup is per source:** for sum metrics the server sums within a `source`
  and then takes the **maximum across sources**. This is what makes running in
  parallel with HAE safe for steps/distance/energy — two sources reporting the
  same day do not double. The mobile app must therefore set a distinct
  `source` on every point (e.g. `"Tonus iOS"`).
- **Averaged metrics blend across sources.** HRV, resting HR and friends are
  averaged over all points of the day regardless of source. Identical values
  average to themselves, so parallel running is harmless when both agree — and
  produces a blend when they disagree slightly. Worth watching, not worth
  blocking on.

### The parallel-run constraint nobody had noticed

`ingest_tokens` has **`user_id` as its primary key** — one token per user, and
`mode` (`shadow` | `live`) lives on that row. `shadow` writes only to
`*_staging`; `live` also promotes into `metrics_daily` / `sleep_sessions`.

So the phone **cannot** run in shadow while HAE stays live: they share the one
token and therefore the one mode. The parent design's "HAE runs in parallel
until reliability is confirmed" needs a mechanism, and there are two:

1. **Compare from `ingest_raw`** (recommended, no migration). Every payload is
   already archived there verbatim. Both senders post under the same live
   token; a comparison script parses the mobile and HAE payloads for the same
   day with the same parser and diffs them per metric. Mobile data reaches
   production immediately, protected by max-per-source dedup on the metrics
   where double counting would actually hurt.
2. **Give the phone its own token** (migration). `ingest_tokens` gains a
   surrogate key plus a label so a user can hold several tokens with
   independent modes. Cleanest isolation, but it touches a production table,
   its RLS policy, and `apps/web/src/lib/autosync.ts`, which assumes
   `maybeSingle()`.

Note that staging cannot be the comparison ground in either case: staging rows
upsert on `user_id,date,metric` with no source dimension, so the two senders
overwrite each other there.

## Library: `@kingstinct/react-native-healthkit`

The parent design listed this as an open choice between two libraries. It is
not close, as of 2026-07-25 on npm:

| | `react-native-health` | `@kingstinct/react-native-healthkit` |
| --- | --- | --- |
| Latest version | 1.19.0 | **14.0.2** |
| Last published | **2024-10-15** (~21 months stale) | 2026-06-05 |
| Peer `react-native` | `>=0.67.3` | `>=0.79` |
| Peer `react` | — | `>=19` |
| Architecture | legacy native modules | **Nitro** (`react-native-nitro-modules >=0.35`, current 0.36.1) |
| License | MIT | MIT |

`apps/mobile` runs React Native 0.86 and React 19. A library last published in
2024 against RN 0.67 is not a candidate for a New Architecture app — picking it
would mean debugging someone else's unmaintained native code before writing a
line of product logic.

**Decision: `@kingstinct/react-native-healthkit` v14, with
`react-native-nitro-modules`.** Verify at implementation time whether it ships
an Expo config plugin (`app.plugin.js`); if it does not, the HealthKit
entitlement and usage descriptions go into `app.json` under
`ios.entitlements` / `ios.infoPlist` directly. Either way this is a prebuild —
which is exactly why Phase 2 kept `expo-dev-client` and CNG.

## Shape of the work

Three milestones, each independently valuable and independently verifiable:

**3a — Read and show.** Request HealthKit permissions, read the mapped metric
types for the last N days, and render the result on a debug screen. **Sends
nothing.** Zero risk to production data, and it is the milestone that proves
the hard part: that the phone can read what HAE reads. Verifiable on a real
device (the Simulator has no Health data worth reading — see risks).

**3b — Build the payload.** A pure module that converts HealthKit samples into
the HAE-shaped JSON above, with `source: "Tonus iOS"`. Pure and unit-testable
under vitest, so it lives in `packages/shared` (client-only logic → born
there, per the shared-code boundary). This is where unit conversion and the
per-day/per-source grouping get pinned down by tests rather than by hope.

**3c — Deliver.** Fetch the user's ingest token (`ingest_tokens`, readable
under RLS by its owner; `apps/web/src/lib/autosync.ts` already has the
create-if-missing logic and is a candidate to move into shared), POST on app
open, then add background delivery (`HKObserverQuery` + `UIBackgroundModes`).
On-open sync is the guarantee; background delivery is best effort because iOS
throttles it — that split is already the parent design's decision.

## Verification

- 3a: permissions dialog appears; the debug screen shows today's steps, HRV,
  resting HR and last night's sleep, and they match the Health app on the same
  phone.
- 3b: vitest over the payload builder, including the unit conversions the
  server cares about (km, kcal, saturation fraction) and multi-source grouping.
- 3c: a POST lands in `ingest_raw`; `metrics_daily` shows the day; and — the
  real test — the `ingest_raw` diff against the same day's HAE payload is
  empty or explainably small.
- HAE stays enabled throughout. It gets turned off only after a stretch of
  clean diffs, and that is a separate, deliberate decision.

## Risks

- **The Simulator has no useful Health data.** Samples can be injected by hand,
  but 3a's real verification needs the physical iPhone, which needs free-team
  provisioning (7-day re-signing). This is the first phase that genuinely
  cannot be finished on the desk without the device.
- **Background delivery is unreliable by design.** Do not let the sync's
  correctness depend on it; on-open catch-up must be able to backfill any gap.
- **Nitro is a young native runtime.** If the library misbehaves under RN 0.86,
  the fallback is not `react-native-health` — it is writing a thin native
  module for the handful of types Tonus reads.
- **Token sharing with HAE.** Rotating the ingest token from the web
  (`autosync.ts` upserts a new one) would silently break whichever sender was
  not updated. Worth a note in the UI when the phone becomes a sender.

## Open decisions (the user's)

1. **Parallel-run mechanism: `ingest_raw` diffing, or a second token via
   migration?** Recommendation: **`ingest_raw` diffing.** It needs no
   production schema change, and the dedup rules already protect the metrics
   where double counting matters. Take the migration only if you want the
   phone's data provably quarantined before it touches `metrics_daily`.
2. **When does HAE get switched off?** Recommendation: keep it running until a
   full week of clean diffs, then turn it off in one deliberate step rather
   than letting both linger indefinitely.

## Out of scope

Android / Health Connect, writing back into HealthKit, workouts as first-class
objects (only `apple_exercise_time` is mapped today), and the Today screen that
consumes all this.
