# Metric Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse, store, show and backfill the 15 remaining HAE metrics through one catalog module.

**Architecture:** `supabase/functions/_shared/metricCatalog.ts` holds the 15 entries plus two pure helpers (unit normalisation, per-day aggregation). The HAE parser, the ZIP aggregation, `sync.ts`, the metrics screen and the backfill script iterate the catalog; the 16 existing metrics keep their code paths.

**Tech Stack:** TS, Deno edge functions, React + Vite, vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-metric-catalog-design.md`

## Global Constraints

- Node 24 (`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`); lint `--max-warnings 0`; `npm run check:functions` clean.
- Repo text in English; UI labels are Russian keys with uk/en entries in `apps/web/src/lib/translations/metrics.ts`.
- Catalog keys exactly as in the spec table. Existing 16 metrics untouched.
- Unit conversion by declared unit only: HAE energy `kJ` → kcal (÷4.184); ZIP `WalkingAsymmetryPercentage` / `WalkingDoubleSupportPercentage` × 100.
- sum/count: sum within source, max across sources. No point → no row.

## Review Focus

- HAE basal energy in kJ and ZIP basal in kcal for the same day → same kcal value.
- ZIP asymmetry 0.25 → stored 25, HAE 25 → stored 25.
- Audio day of 50 dB and 80 dB → energy average ≈ 77 dB, not 65.
- ZIP AppleStandHour `Idle` records → contribute 0, not dropped or counted as 1.
- A catalog metric with points from a composite source string (`Watch|Watch`) → treated as its own source (max, not sum).

---

### Task 1: Catalog module

**Files:** Create `supabase/functions/_shared/metricCatalog.ts`, `supabase/functions/_shared/metricCatalog.test.ts`

**Produces:**
- `type CatalogAgg = 'sum' | 'count' | 'avg' | 'energyAvg'`
- `interface CatalogEntry { key: string; hae: string; hk: string; agg: CatalogAgg; label: string; zipScale?: number; zipCategory?: Record<string, number> }`
- `METRIC_CATALOG` (`as const satisfies readonly CatalogEntry[]`), `type CatalogKey`, `CATALOG_BY_HAE: Map<string, CatalogEntry>`, `CATALOG_BY_HK: Map<string, CatalogEntry>`
- `haeValue(entry, value: number, units: string): number` (kJ→kcal for basalEnergy)
- `aggregateDay(entry, points: { v: number; src: string }[]): { avg_val: number; min_val: number; max_val: number } | { sum_val: number } | null`

- [ ] Tests: 15 unique keys/hae/hk; `haeValue(basal, 41.84, 'kJ') === 10`, kcal unchanged; `aggregateDay` sum → max across sources; count → number of points (per source, max); avg → avg/min/max; energyAvg of 50 & 80 → ≈77.0 (±0.1) with max 80; empty → null.
- [ ] RED → implement → GREEN → commit `feat(metrics): catalog of remaining Apple Health metrics`.

### Task 2: HAE parser reads the catalog

**Files:** Modify `supabase/functions/_shared/hae.ts`; test `hae.test.ts`. Also export `isSumMetric(key)` (existing SUM_METRICS or catalog sum/count) for the backfill.

- [ ] Tests: basal kJ payload → `{ metric: 'basalEnergy', sum_val }` in kcal; asymmetry 28.9 → avg 28.9; handwashing 3 points → sum_val 3; audio 50/80 → avg ≈77, max 80; existing metrics unchanged (existing suite).
- [ ] RED → in the non-sleep branch, when `METRIC_MAP` misses, look up `CATALOG_BY_HAE`, group points per day, apply `haeValue` + `aggregateDay` → GREEN → commit.

### Task 3: ZIP importer reads the catalog

**Files:** Modify `apps/web/src/workers/healthParser.worker.ts` (`parseXML`: map `zipCategory` string values to numbers for catalog category types), `apps/web/src/lib/healthAggregate.ts` (catalog buckets, `zipScale`, `aggregateDay` → value: sum_val or avg_val); test `healthAggregate.test.ts`.

- [ ] Tests: asymmetry 0.25 → `walkingAsymmetry: 25`; basal 20 kcal ×2 → 40; stand-hour records value 1 and 0 → 1; handwashing 2 events → 2.
- [ ] Move category mapping into an exported pure `recordValue(type, valueStr): number | null` in `healthAggregate.ts` so it is testable; test Stood→1, Idle→0, HandwashingEvent NotApplicable→1, sleep mapping unchanged.
- [ ] RED → implement → GREEN → commit.

### Task 4: Daily model and sync

**Files:** `apps/web/src/types/index.ts` (`DailyMetrics extends Partial<Record<CatalogKey, number>>`), `apps/web/src/lib/sync.ts` (`metricRowsOf` / `applyMetricRow` loop over catalog: sum/count → `sum_val` + `maxSum`; avg/energyAvg → `avg_val` + `keepAvg`); test `sync.test.ts`.

- [ ] Tests: load `basalEnergy` sum_val, `walkingSpeed` avg_val; save emits rows for set catalog fields only.
- [ ] RED → implement → GREEN → commit.

### Task 5: Metrics screen labels

**Files:** `MetricsScreen.tsx` (spread catalog labels into `METRIC_LABELS`), `translations/metrics.ts` (uk/en for 15 labels); test: a node test asserting every catalog label has uk+en.

- [ ] RED → implement → GREEN; demo fixture gets plausible values for a few catalog metrics (physicalEffort, basalEnergy, standHours, walkingSpeed) → commit.

### Task 6: Backfill script uses the catalog

**Files:** `scripts/backfill-hae-metrics.ts` — use `isSumMetric` instead of `SUM_METRICS`; `--metrics all-catalog` shorthand.

- [ ] Dry-run against prod → counts per catalog key > 0 for metrics present in payloads → commit.

### Task 7: Verify and ship

- [ ] `npm test`, `npm run lint`, `npm run build`, `npm run check:functions`; demo check of Metrics screen; final review; PR; merge on owner's go; deploy `ingest-health` (`--no-verify-jwt`); backfill.
