# Breathing Disturbances and Personal Daylight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store, backfill, show and correlate two Apple Watch metrics Tonus currently drops: per-night breathing disturbances and personal time in daylight.

**Architecture:** Both become ordinary `metrics_daily` rows (`breathingDisturbances` avg, `daylightMinutes` sum) produced by the single HAE parser and by the ZIP importer, loaded into `DailyMetrics` by `sync.ts`, then read by the sleep screen, metrics screen and the correlations engine.

**Tech Stack:** React + Vite + TS (apps/web), Deno edge functions (`supabase/functions/_shared`), vitest (node + jsdom projects).

**Spec:** `docs/superpowers/specs/2026-11-25-breathing-disturbances-daylight-design.md`

## Global Constraints

- Node 24 for all commands: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- `npm run lint` must stay at zero warnings; `npm run check:functions` must pass (needs `export PATH="$HOME/.deno/bin:$PATH"`).
- Repo text (code, comments, commits, docs) in English; UI strings are Russian keys translated via `apps/web/src/lib/translations/*` (uk + en) — follow the `adding-translations` skill.
- Metric keys exactly: `breathingDisturbances`, `daylightMinutes`. Correlation factor key exactly: `sunlight`.
- No "apnea" wording, no normal/elevated verdict in UI.
- Missing value ≠ zero: no point → no row; parse numbers with `num()`.
- No DB migration.

## Review Focus

- HAE payload with `time_in_daylight` points from two sources on one day → sum within source, max across sources (same as steps), not double-counted.
- Breathing-disturbance point of 0 → stored as a real 0, not dropped (0 is a valid good night).
- Daylight fractional per-minute values summing to e.g. 19.6 → stored as 20 (rounded whole minutes).
- Sleep screen with breathing data on only some nights in the range → average uses only measured nights; row hidden when none.
- Correlations with `daylightMinutes` absent on most days → `sunlight` factor simply has fewer pairs; no crash, no zero-filling.

---

### Task 1: HAE parser maps both metrics

**Files:**
- Modify: `supabase/functions/_shared/hae.ts` (`METRIC_MAP`, `SUM_METRICS`, rounding line)
- Test: `supabase/functions/_shared/hae.test.ts`

**Interfaces:**
- Produces: `parseHAE()` emits `{ metric: 'breathingDisturbances', avg_val, min_val, max_val }` and `{ metric: 'daylightMinutes', sum_val }` rows.

- [ ] **Step 1: Failing tests** in `hae.test.ts`:
  - `maps breathing_disturbances to a per-night avg row`: point `{ date: '2026-11-20 02:36:00 +0100', qty: 2.285, source: 'Watch' }` → row `{ date: '2026-11-20', metric: 'breathingDisturbances', avg_val: 2.285 }`.
  - `keeps a measured zero breathing value`: qty 0 → row with `avg_val: 0`.
  - `sums time_in_daylight minutes per day and rounds`: points 0.6, 1, 1, 0.9999 on 2026-11-17 → `sum_val: 4`; plus a second day → separate row.
  - `daylight from two sources takes the max, not the sum`: source A 10×1, source B 6×1 same day → `sum_val: 10`.
- [ ] **Step 2:** `npx vitest run supabase/functions/_shared/hae.test.ts` → the new tests FAIL.
- [ ] **Step 3:** Add `breathing_disturbances: 'breathingDisturbances'`, `time_in_daylight: 'daylightMinutes'` to `METRIC_MAP`; add `'daylightMinutes'` to `SUM_METRICS`; include `daylightMinutes` in the round-to-integer list.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(ingest): parse breathing disturbances and time in daylight`.

### Task 2: ZIP importer parity

**Files:**
- Create: `apps/web/src/lib/healthAggregate.ts` (move `mergedSeconds`, `aggregateSleep`, `aggregateByDay` and their helpers out of the worker unchanged)
- Modify: `apps/web/src/workers/healthParser.worker.ts` (import `aggregateByDay` from the new module), `apps/web/src/types/index.ts` (`DailyMetrics.breathingDisturbances?: number`, `daylightMinutes?: number`)
- Test: `apps/web/src/lib/healthAggregate.test.ts`

**Interfaces:**
- Produces: `export function aggregateByDay(records: HealthRecord[]): DailyMetrics[]`; `DailyMetrics` fields `breathingDisturbances`, `daylightMinutes`.

Why the move: the worker assigns `self.onmessage` at module level, so it cannot be imported in the node test project.

- [ ] **Step 1: Failing tests:**
  - `HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances` record start 2026-11-19T23:30Z, end 2026-11-20T05:00Z, value 1.2 → day `2026-11-20` has `breathingDisturbances: 1.2` (bucketed by endDate, like sleep).
  - `HKQuantityTypeIdentifierTimeInDaylight` records 5 and 7.4 min on one day → `daylightMinutes: 12` (sum, rounded).
  - A day without these records has both fields `undefined`.
- [ ] **Step 2:** `npx vitest run apps/web/src/lib/healthAggregate.test.ts` → FAIL.
- [ ] **Step 3:** Move the code, add two bucket arrays, a case for each identifier (breathing → `bucket(r.endDate)`), and output `breathingDisturbances: avg(...)`, `daylightMinutes: rounded sum`.
- [ ] **Step 4:** Test → PASS; `npm run build` passes (worker still compiles).
- [ ] **Step 5:** Commit `feat(import): read breathing disturbances and daylight from Apple Health ZIP`.

### Task 3: Load and save in sync.ts, demo data

**Files:**
- Modify: `apps/web/src/lib/sync.ts` (save rows near line 83 and load switch near line 201), `apps/web/src/lib/demoFixture.ts`
- Test: `apps/web/src/lib/sync.test.ts`

**Interfaces:**
- Consumes: `DailyMetrics` fields from Task 2.

- [ ] **Step 1: Failing tests:** load path maps `breathingDisturbances` (avg_val, `keepAvg`) and `daylightMinutes` (sum_val, `maxSum`); save path emits both rows when set and none when undefined.
- [ ] **Step 2:** `npx vitest run apps/web/src/lib/sync.test.ts` → FAIL.
- [ ] **Step 3:** Add the cases. In `demoFixture.ts` give each demo day `breathingDisturbances` in 0.2–2.5 and `daylightMinutes` in 10–120 (deterministic via the fixture's existing RNG) so demo mode shows the new UI.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5:** Commit `feat(sync): load breathing disturbances and daylight minutes`.

### Task 4: Sleep screen row and metrics screen charts

**Files:**
- Modify: `apps/web/src/components/sleep/SleepScreen.tsx` (stat-row), `apps/web/src/components/metrics/MetricsScreen.tsx` (`METRIC_LABELS`), translations file(s) under `apps/web/src/lib/translations/`
- Test: `apps/web/src/components/sleep/SleepScreen.test.tsx`

- [ ] **Step 1: Failing tests** (`renderWithProviders`):
  - With last night `breathingDisturbances: 0.48` and slice average 0.9 → one stat with value text `0.5 · ср. 0.9` and label `нарушений дыхания в час`.
  - With no breathing values in range → no such stat.
  - Average ignores nights without a value (values 1 and 2 plus two empty nights → avg 1.5).
- [ ] **Step 2:** `npx vitest run apps/web/src/components/sleep/SleepScreen.test.tsx` → FAIL.
- [ ] **Step 3:** Add the stat (neutral colour, one decimal; "last night" = latest day in slice with a value). Add `METRIC_LABELS` entries `breathingDisturbances: 'Нарушения дыхания (в час)'`, `daylightMinutes: 'Время на дневном свете (мин)'`. Add uk/en translations for every new key.
- [ ] **Step 4:** Test → PASS; translation inventory tests pass (`npm test`).
- [ ] **Step 5:** Commit `feat(sleep): show breathing disturbances; chart daylight and breathing`.

### Task 5: `sunlight` correlation factor

**Files:**
- Modify: `apps/web/src/lib/correlations.ts`, `supabase/functions/_shared/correlations.ts` (keep the two copies identical in logic), `apps/web/src/components/insights/CorrelationsBlock.tsx` (`FACTOR_LABELS.sunlight = { icon: 'sun', label: 'Время на свету' }`), translations
- Test: `apps/web/src/lib/correlations.test.ts`, `supabase/functions/_shared/correlations.test.ts`

**Interfaces:**
- Produces: `CorrFactor` gains `'sunlight'`; factor value = `d.daylightMinutes ?? null`; `CorrDailyRow` (shared) gains `daylightMinutes?: number`. `chatTools.ts` is not changed (AI chat is a non-goal) — the factor just has no pairs there.

- [ ] **Step 1: Failing test** in both copies: 21 days where `daylightMinutes` rises and next-night `sleepHours` rises linearly → result contains `{ factor: 'sunlight', outcome: 'sleepHours', lag: 1, direction: 'up' }`; and a case with `daylightMinutes` on only 5 days → no `sunlight` entry, no throw.
- [ ] **Step 2:** Run both test files → FAIL.
- [ ] **Step 3:** Add the factor to the type, the `factors` list and the value switch in both copies; add the label + translations.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit `feat(insights): personal time in daylight as a correlation factor`.

### Task 6: Backfill script

**Files:**
- Create: `scripts/backfill-hae-metrics.ts`

- [ ] **Step 1:** Script reads `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` from env, pages `ingest_raw` one row at a time ordered by `received_at` (large payloads 520 in bulk), runs `parseHAE` from `supabase/functions/_shared/hae.ts`, keeps only rows whose `metric` is in a CLI list (default `breathingDisturbances,daylightMinutes`), merges per `(user_id,date,metric)` (avg: later payload wins; sum: max), and upserts into `metrics_daily` on `user_id,date,metric`. `--dry-run` prints counts per metric and date range without writing.
- [ ] **Step 2:** Run with `--dry-run` against prod: expect counts > 0 for both metrics and the earliest date ≥ June 2026.
- [ ] **Step 3:** Commit `chore(scripts): backfill selected HAE metrics from ingest_raw`. The real write runs after the edge function deploy (see verification).

### Task 7: Verify and ship

- [ ] `npm test`, `npm run lint`, `npm run build`, `npm run check:functions` — all green.
- [ ] Demo mode (`VITE_DEMO=1`): sleep screen stat and both metric charts render.
- [ ] Open PR. After merge: deploy `ingest-health` with `--no-verify-jwt` (see `deploying-tonus`), then run the backfill without `--dry-run`.
