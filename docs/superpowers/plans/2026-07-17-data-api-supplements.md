# B2 feature 3: Supplements data-access layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 6 direct query sites out of AdherenceBlock and TreatmentTracker into `src/lib/api/supplements.ts`, add component tests, shrink the components-db-guard allowlist 7 → 5.

**Architecture:** Same pattern as PR #89/#90. New module owns: adherence logs (RLS-scoped, no explicit user filter — preserves current behavior), treatments CRUD, supplement name options, and the `metrics_daily` window read used for before/after comparisons. `Treatment`/`MetricRow`/`SupplementItem` types move into the module. Demo-mode short-circuits stay in components. Note: `src/lib/supplements.ts` (existing `loadSupplements`) is a different, already-clean module — untouched.

**Tech Stack:** vitest node project (recording supabase mock) + jsdom component tests (`renderWithProviders`, pin `localStorage lang='en'`). Node 24.

**Branch:** `feat/data-api-supplements` off `main`.

---

### Task 0: Branch

- [ ] `git checkout main && git pull && git checkout -b feat/data-api-supplements`

### Task 1: API module `src/lib/api/supplements.ts` (TDD)

**Files:** Create `src/lib/api/supplements.ts`, test `src/lib/api/supplements.test.ts`.

Functions (signatures fixed here, used verbatim in Tasks 2–3):

```ts
export interface SupplementOption { id: string; name: string }
export interface Treatment {
  id: string; user_id: string; supplement_id: string | null; name: string
  started_at: string; outcome_metrics: string[]; notes: string | null; created_at: string
}
export interface MetricRow { date: string; metric: string; avg_val: number }

// AdherenceBlock: logs for the rolling window; RLS scopes to the user (no explicit filter today).
export async function getAdherenceLogs(sinceDate: string): Promise<AdherenceLog[]>  // AdherenceLog re-exported from '../adherence'
// TreatmentTracker
export async function getTreatments(userId: string): Promise<Treatment[]>            // order started_at desc
export async function getSupplementOptions(userId: string): Promise<SupplementOption[]> // select id,name order name
export async function getMetricDailyRows(userId: string, metrics: string[], from: string, to: string): Promise<MetricRow[]>
export async function createTreatment(userId: string, tr: { supplement_id: string | null; name: string; started_at: string }): Promise<Treatment | null> // insert().select().single(); null on error
export async function deleteTreatment(id: string): Promise<void>
```

- [ ] **Step 1.1:** Failing tests with the recording-chain mock (methods: select, eq, in, gte, lte, order, insert, delete, single). Assert per function: table, filters/order args, payload, return mapping (`data ?? []`, null on error for createTreatment).
- [ ] **Step 1.2:** Run — FAIL (module missing).
- [ ] **Step 1.3:** Implement.
- [ ] **Step 1.4:** Run — PASS.
- [ ] **Step 1.5:** Commit `feat(client): supplements data-access module src/lib/api/supplements.ts`.

### Task 2: Migrate AdherenceBlock + component test

**Files:** Modify `src/components/supplements/AdherenceBlock.tsx`, create `AdherenceBlock.test.tsx`, drop file from guard allowlist.

- [ ] **Step 2.1:** Failing test: mock `../../lib/api/supplements` + `isDemoActive:false`; one active supplement + logs → 'Adherence' title and a percent row render; `getAdherenceLogs` called with a date ≈30 days back.
- [ ] **Step 2.2:** Migrate: swap `supabase` import for `getAdherenceLogs`; effect body becomes `getAdherenceLogs(since).then(data => { if (!cancelled) setLogs(data) })` (module handles `?? []`).
- [ ] **Step 2.3:** Test + guard PASS; commit `refactor(supplements): AdherenceBlock via api module + component test`.

### Task 3: Migrate TreatmentTracker + component test

**Files:** Modify `src/components/supplements/TreatmentTracker.tsx`, create `TreatmentTracker.test.tsx`, drop from allowlist.

- [ ] **Step 3.1:** Failing test: mock api module + demo false. Case 1: one treatment started 10 days ago → 'Not enough data (need 30+ days)' visible; `getMetricDailyRows` NOT called. Case 2: delete click → `deleteTreatment` called with id and card disappears.
- [ ] **Step 3.2:** Migrate: local `Treatment`/`MetricRow`/`SupplementItem` interfaces replaced by module types (`SupplementItem` → `SupplementOption`); the load effect's two parallel queries → `getTreatments(user.id)` / `getSupplementOptions(user.id)`; the per-treatment window read → `getMetricDailyRows(user.id, ['hrv','restingHeartRate','sleepHours'], beforeStart, afterEnd)`; `handleAdd` non-demo branch → `createTreatment(...)`; `handleDelete` → `deleteTreatment(id)`.
- [ ] **Step 3.3:** Test + guard PASS; commit `refactor(supplements): TreatmentTracker via api module + component test`.

### Task 4: Gate + PR

- [ ] Spec status: `guard 15→7` → `guard 15→5 (settings, dashboard, supplements)`.
- [ ] Full gate: `VITE_DEMO= npm test && npm run test:scripts && npm run build && npm run lint:ceiling && npm run check:functions`.
- [ ] Commit docs, push, PR `refactor(supplements): data-access layer + component tests (B2 feature 3)`, merge on green (squash, delete branch). No edge functions touched.
