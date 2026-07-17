# B2 feature 5 (final): Research + Insights data-access layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the last 6 direct query sites out of ExperimentsScreen and CorrelationsBlock into `src/lib/api/research.ts` and `src/lib/api/insights.ts`, empty the components-db-guard allowlist (2 → 0), and flip the guard to zero-tolerance — completing B2's "zero `.from(` inside src/components" success criterion.

**Architecture:** Same pattern as PR #89–#92. `research.ts`: experiments CRUD (`getExperiments`, `createExperiment` insert-select-single null-on-error, `saveExperimentResult` update of result+ai_explanation, `deleteExperiment`). `insights.ts`: `getEnvironmentDays(sinceDate)` — RLS-scoped read of `environment_daily` (no explicit user filter today; `EnvDay` type moves into the module). When the allowlist empties, keep the ratchet test but the set stays empty forever (same shape as edge-fetch-guard).

**Functions:**

```ts
// research.ts — ExperimentRow/ExperimentResult come from '../experiments', Json from '../database.types'
export async function getExperiments(userId: string): Promise<ExperimentRow[] | null>  // null = load error (LoadError banner)
export async function createExperiment(userId: string, exp: {...form + baseline_start + status}): Promise<ExperimentRow | null>
export async function saveExperimentResult(id: string, result: ExperimentResult, aiExplanation: string): Promise<void>
export async function deleteExperiment(id: string): Promise<void>
// insights.ts
export interface EnvDay { date: string; temp_c: number | null; pressure_hpa: number | null; daylight_minutes: number | null; precipitation_mm: number | null; kp_index: number | null }
export async function getEnvironmentDays(sinceDate: string): Promise<EnvDay[]>
```

**Branch:** `feat/data-api-research-insights` off `main` (after #92 merges — allowlist conflicts otherwise).

---

### Task 1: API modules (TDD)
- [ ] **1.1** Failing tests `src/lib/api/research.test.ts` + `src/lib/api/insights.test.ts` (recording-chain mock). Assert tables, filters, order (`created_at desc` for experiments, `date asc` for env), payloads, null-on-error semantics.
- [ ] **1.2** Run — FAIL. **1.3** Implement both modules. **1.4** Run — PASS.
- [ ] **1.5** Commit `feat(client): research and insights data-access modules`.

### Task 2: Migrate CorrelationsBlock + component test
- [ ] **2.1** Failing test: mock `../../lib/api/insights` + demo false; env data flows into `computeLagCorrelations` — assert the block renders (title '🔗') and `getEnvironmentDays` called with ~48-day-back date. Use `daily` fixture short enough to hit the `needMoreDays` branch for a cheap deterministic assert.
- [ ] **2.2** Migrate the effect; drop `supabase` import and local `EnvDay` (import from module).
- [ ] **2.3** Drop from allowlist; test + guard PASS; commit.

### Task 3: Migrate ExperimentsScreen + component test
- [ ] **3.1** Failing test: mock `../../lib/api/research`, `../../lib/edgeFunctions`, demo false; `getExperiments` → list renders (stub `./ExperimentCard` to keep it light); delete flow calls `deleteExperiment`; `getExperiments` null → LoadError.
- [ ] **3.2** Migrate `loadExps` (null → `setLoadError(true)`), `handleCreate` (`createExperiment`), AI-explain save (`saveExperimentResult`), `handleDelete`.
- [ ] **3.3** Drop from allowlist — **allowlist now EMPTY**; update the guard header comment to say the list must stay empty (edge-fetch-guard wording). Test + guard PASS; commit.

### Task 4: Gate + PR + B2 wrap-up
- [ ] Spec status: B2 row → `DONE — 5 PRs (#89–#93), guard allowlist empty; zero .from( in components`.
- [ ] Full gate (`VITE_DEMO= npm test`, test:scripts, build, both ceilings).
- [ ] Push, PR `refactor(research,insights): data-access layer + component tests (B2 final)`, merge on green. No edge functions.
- [ ] After merge: B2 success criteria check — zero `.from(` in components (guard), component tests for the biggest screens (Settings characterization + new per-feature tests). Next workstream item: **B3 telegram-bot split**.
