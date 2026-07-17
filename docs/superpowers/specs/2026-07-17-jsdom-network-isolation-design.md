# jsdom network isolation — design

Date: 2026-07-17. Status: approved (owner delegated: "делай спеку и начинай делать").

## Problem

Component tests (vitest jsdom project) mount components whose effects fire real
network calls: `.from()` queries through the shared Supabase client, edge-function
calls through `callFunction`, and two direct `fetch` sites (EnvironmentSection
geocoding, MealLogger food search). The client is created with dummy env
(`http://localhost:54321`), so these requests fail — but **asynchronously**, often
after the test's jsdom is torn down. The rejection then surfaces as an unhandled
error and fails an unrelated test (the #93 StreakMenu → WorkoutPlanCard flake on
`main`).

Today's defense is per-test: every test that mounts a component must `vi.mock` the
api modules it (or any nested child) uses. That is easy to forget — 24 component
files contain `.then(` today, and any new component re-opens the hole.

Per-component cancellation (`let cancelled = …` in 24 files) was considered and
rejected: in React 18 setState-after-unmount is a harmless no-op in production,
so the churn would fix nothing real — the only victim is the test runner.

## Decision

Kill the class at the infrastructure level: **the jsdom project gets no network,
ever.** Two additions to `vitest.setup.ts` (jsdom-only setup file):

1. **Inert Supabase client mock** — `vi.mock` of `src/lib/supabase` exporting a
   client whose query surface is a chainable thenable: every method returns the
   chain itself, `await` resolves to `{ data: null, error: null, count: null }`.
   Special-cased surfaces:
   - `auth`: `getSession`/`getUser` resolve `{ data: { session: null, user: null }, error: null }`;
     `onAuthStateChange` returns `{ data: { subscription: { unsubscribe() {} } } }`.
   - `channel()` returns a chainable with `subscribe()`; `removeChannel` is a no-op
     (realtime never connects).
2. **Global fetch stub** — `globalThis.fetch` replaced by a vi.fn returning
   `new Response('{}', { status: 200 })`. Direct-fetch components get an inert
   success instead of a real request.

Existing per-test `vi.mock('…/lib/api/<feature>')` calls keep working and remain
the way to feed specific data into a test; the global layer is the safety net
underneath, not a replacement.

A guard test (`src/test/network-isolation.test.tsx`) locks the contract:
- `supabase.from('x').select().eq().order()` awaits to the inert shape,
- `supabase.auth.getSession()` resolves a null session without throwing,
- `globalThis.fetch` is a vitest mock (`vi.isMockFunction`).

## Consequences / risks

- Components rendered without local mocks now see "no data" (`data: null`) instead
  of a crashed request — tests exercise empty states, which components already
  handle (`LoadError` / empty-state paths).
- `callFunction` under a null session throws `EdgeFunctionError(401)`
  **deterministically during the test** instead of racing teardown. If any
  existing test trips on this, the fix is a local api-module mock (the already
  sanctioned pattern) — such a failure is the guard doing its job.
- Node-project tests (`*.test.ts`, including `src/lib/api/*.test.ts` which test
  the real query chains with recording mocks) are untouched: the setup file is
  jsdom-only.

## Out of scope

- Per-component effect cancellation (rejected above).
- `send-reminders/index.ts` (717 lines) decomposition — only remaining large
  handwritten file; optional taste-level follow-up, not debt.
- Deno check ceiling (16) — stays ratcheted; fixes are not cheap.
