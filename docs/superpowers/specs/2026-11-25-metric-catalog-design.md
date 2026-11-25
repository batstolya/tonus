# Metric catalog for the remaining Apple Health metrics — design

Status: draft 2026-11-25. Size: small change (repeats the pattern of PR #258
through one data-driven module).

## Intent

Health Auto Export (HAE) sends 31 metric types; after PR #258 Tonus uses 16.
The owner wants the remaining 15 visible too. Instead of hand-wiring each one in
five places (HAE parser, ZIP importer, sync load/save, labels, translations),
one catalog describes every new metric and all those places read it. Adding a
future metric becomes one catalog entry. The same catalog will later carry
min/max into the doctor report (owner's next idea — not in this change).

## Goals

1. `supabase/functions/_shared/metricCatalog.ts` — the single list (below).
   Imported by Deno functions and by the web app (relative path, as
   `apps/web/src/lib/scores.ts` already does).
2. HAE parser (`_shared/hae.ts`) parses every catalog metric.
3. ZIP importer (`apps/web/src/lib/healthAggregate.ts` + worker `parseXML`)
   parses every catalog metric, including two category types.
4. `DailyMetrics` gains one optional numeric field per catalog key, typed from
   the catalog (`{ [K in CatalogKey]?: number }`); `sync.ts` load/save use the
   catalog.
5. Metrics screen (Body → Overview) lists them; labels + uk/en translations.
6. Backfill history from `ingest_raw` with the existing script.

## The catalog (verified against prod payloads and a real export.xml)

| key | HAE name (units) | ZIP type (units) | per-day rule |
|---|---|---|---|
| physicalEffort | physical_effort (kcal/hr·kg) | PhysicalEffort (same) | avg/min/max |
| basalEnergy | basal_energy_burned (**kJ**) | BasalEnergyBurned (**kcal**) | sum, kcal |
| standHours | apple_stand_hour (count, 1 per stood hour) | category AppleStandHour: Stood=1, Idle=0 | sum |
| standMinutes | apple_stand_time (min) | AppleStandTime (min) | sum |
| environmentalAudio | environmental_audio_exposure (dBASPL) | EnvironmentalAudioExposure | energy avg + max |
| headphoneAudio | headphone_audio_exposure (dBASPL) | HeadphoneAudioExposure | energy avg + max |
| walkingSpeed | walking_speed (km/hr) | WalkingSpeed (km/hr) | avg/min/max |
| walkingStepLength | walking_step_length (cm) | WalkingStepLength (cm) | avg/min/max |
| walkingAsymmetry | walking_asymmetry_percentage (**%**, 0–100) | WalkingAsymmetryPercentage (**fraction** 0–1) | avg/min/max, % |
| walkingDoubleSupport | walking_double_support_percentage (**%**) | WalkingDoubleSupportPercentage (**fraction**) | avg/min/max, % |
| stairSpeedUp | stair_speed_up (m/s) | StairAscentSpeed (m/s) | avg/min/max |
| stairSpeedDown | stair_speed_down (m/s) | StairDescentSpeed (m/s) | avg/min/max |
| sixMinuteWalk | six_minute_walking_test_distance (m) | SixMinuteWalkTestDistance (m) | avg |
| cyclingDistance | cycling_distance (km) | DistanceCycling (km) | sum, km |
| handwashing | handwashing (s per event) | category HandwashingEvent | count of events |

Rules shared with existing metrics:
- sum/count: sum within a source, max across sources (iPhone + Watch not doubled).
- avg: points from all sources averaged; min/max kept.
- Unit conversion is driven by the declared unit, never by value heuristics:
  kJ → kcal for energy; ZIP percentage fractions × 100.
- No point → no row (unknown, not 0).

## Non-goals

Existing 16 metrics stay on their current code paths (migrating them is a
separate step). No doctor report, AI chat, correlations, sleep-screen or
raw-data tab changes. No DB migration (rows go to `metrics_daily`).

## Anti-goals

- A wrong unit silently scaling a metric (e.g. asymmetry 0.25 shown as 0.25 %).
- Breaking any of the 16 working metrics.

## Approaches considered

- **Chosen (owner, 2026-11-25): one catalog read by every path.** 15 metrics now,
  one line each later; one module and more tests this time.
- Hand-wire 15 metrics like PR #258 — rejected: ~75 near-identical edits and the
  same cost again for every future metric.

## Calls made by the builder (owner can override)

- Decibels are averaged as energy (10·log10(mean(10^(L/10)))), the correct way
  to average sound levels; a plain average would understate loud periods.
- Handwashing shows number of events per day, not total seconds.
- Catalog lives in `supabase/functions/_shared/` because Deno cannot import from
  `apps/web`, while the web app already imports `_shared` modules.
