# B2 feature 4: Intake + Nutrition data-access layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 4 direct query sites out of QuickLog, NutritionScreen and MealLogger into `src/lib/api/intake.ts` (they all read/write the same `intake_events` table), add component tests, shrink the components-db-guard allowlist 5 → 2.

**Architecture:** Same pattern as PR #89/#90/#91. One module for the `intake_events` table serving both feature dirs (intake = quick water/coffee log, nutrition = meals with macros). Demo-mode short-circuits stay in components.

**Functions (used verbatim in Tasks 2–3):**

```ts
// QuickLog: insert().select().single(); null on error
export async function createIntakeEvent(userId: string, ev: {
  ts: string; type: string; amount: number | null; unit: string | null; note: string | null
}): Promise<IntakeEvent | null>   // IntakeEvent from '../../types'
export async function deleteIntakeEvent(id: string): Promise<void>
// NutritionScreen: meals for the window; null signals a load error (component shows LoadError)
export interface Meal { ts: string; note: string | null; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }
export async function getMeals(userId: string, sinceIso: string): Promise<Meal[] | null>
// MealLogger: fire-and-forget meal insert (no select in the original)
export async function createMealEvent(userId: string, meal: {
  note: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null
}): Promise<void>  // ts = new Date().toISOString(), type 'meal' inside
```

**Branch:** `feat/data-api-intake-nutrition` off `main` (after #91 merges — the guard allowlist would conflict otherwise).

---

### Task 0: Branch
- [ ] `git checkout main && git pull && git checkout -b feat/data-api-intake-nutrition`

### Task 1: API module `src/lib/api/intake.ts` (TDD)
- [ ] **1.1** Failing tests `src/lib/api/intake.test.ts` (recording-chain mock; methods: select, eq, gte, order, insert, delete, single). Assert tables, filters (`type='meal'`, `gte ts`, `order ts desc` for getMeals), payloads, null-on-error for createIntakeEvent and getMeals.
- [ ] **1.2** Run — FAIL. **1.3** Implement. **1.4** Run — PASS.
- [ ] **1.5** Commit `feat(client): intake data-access module src/lib/api/intake.ts`.

### Task 2: Migrate QuickLog + component test
- [ ] **2.1** Failing test `QuickLog.test.tsx`: mock api + demo false; add flow calls `createIntakeEvent` and prepends the returned event via `onEventsChange`; delete flow calls `deleteIntakeEvent`.
- [ ] **2.2** Migrate `handleAdd` / `handleDelete`; drop `supabase` import.
- [ ] **2.3** Drop from allowlist; test + guard PASS; commit `refactor(intake): QuickLog via api module + component test`.

### Task 3: Migrate NutritionScreen + MealLogger + tests
- [ ] **3.1** Failing tests: `NutritionScreen.test.tsx` — meals render into day aggregates; `getMeals` null → LoadError visible. `MealLogger` covered via module test only if a component test is disproportionate (it needs heavy AI-flow mocks); at minimum migrate the insert call.
- [ ] **3.2** Migrate `loadMeals` (`getMeals(user.id, since)`, null → `setLoadError(true)`) and MealLogger's `handleSave` (`createMealEvent(user.id, {...})`).
- [ ] **3.3** Drop both from allowlist; tests + guard PASS; commit `refactor(nutrition): NutritionScreen and MealLogger via api module + tests`.

### Task 4: Gate + PR
- [ ] Spec status: guard 15→2 note (settings, dashboard, supplements, intake+nutrition).
- [ ] Full gate (`VITE_DEMO= npm test`, test:scripts, build, both ceilings).
- [ ] Push, PR `refactor(intake,nutrition): data-access layer + component tests (B2 feature 4)`, merge on green. No edge functions.
