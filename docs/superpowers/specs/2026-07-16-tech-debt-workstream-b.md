# Tech-debt workstream B: architecture and resilience

Follow-up to workstream A (lint/type debt, PR #43–#55) and the 2026-07-16
codebase assessment. Four items, ordered by risk-to-effort ratio. Each item
ships as its own PR (or short PR series) and leaves CI green.

**Not in scope:** beta-invite blockers (tracked in
`docs/specs/beta-invite-checklist.md`), new product features.

**Correction locked in during assessment:** score formulas are already
single-source (`supabase/functions/_shared/scores.ts`; the client file is a
re-export facade) — the previously planned "parity test" item is void.

## B1. Timeouts and retry for outbound HTTP in Edge Functions

**Problem:** only `reminderDelivery.ts` and `observability.ts` guard their
outbound calls. Everything else — Gemini (via `fetchGeminiWithConsent`),
Telegram sends, ESPN/GFZ/weather/calendar fetches (~25 call sites) — is raw
`fetch` with no timeout: a hung upstream holds the function until the
platform kills it, burning invocation time and returning opaque errors.

**Approach:** one `_shared/http.ts` helper (`fetchWithTimeout`) with an
`AbortSignal`-based deadline and a single optional retry on 5xx/network
errors for idempotent (GET) calls. Wire it into the two choke points first
(`fetchGeminiWithConsent`, a new shared `sendTelegram`), then migrate the
scattered direct call sites.

**Success:** no raw `fetch(` in edge functions outside `_shared/http.ts`
(guard test added); default deadline 30 s for AI, 10 s otherwise.

**Plan:** `docs/superpowers/plans/2026-07-16-edge-http-timeouts.md`

## B2. Data-access layer + component tests

**Problem:** 33 direct `supabase.from(...)` queries live inside
`src/components/**/*.tsx`. Components own fetching, schema knowledge, and
rendering at once — which is why only 9 of 82 components have tests: mocking
the Supabase client per component is prohibitive.

**Approach:** per-feature API modules `src/lib/api/<feature>.ts` exposing
typed functions (`getGoals(userId)`, `saveNote(...)`). Components call these;
tests mock one module boundary. Migrate feature-by-feature (goals, concerns,
supplements, dashboard, settings, …) — each feature is an independent PR.
After each migration, add component tests for that feature's main screen
using the existing `renderWithProviders` harness.

**Success:** zero `.from(` inside `src/components` (ratchet-style guard
test); the five largest screens have render + interaction tests.

**Plan:** authored per feature when B1 lands (first target: the feature with
the most queries — count at planning time).

## B3. Split the Telegram bot module

**Problem:** `supabase/functions/telegram-bot/index.ts` is 1498 lines:
command routing, per-command handlers, formatting, and API calls in one file.

**Approach:** after B1/B2 establish the shared HTTP helper, split into
`telegram-bot/commands/<command>.ts` handler modules + a thin router in
`index.ts`. Pure formatting helpers move to `_shared` where reused by
send-reminders. Behavior-preserving refactor: existing tests must pass
unchanged; add router-level tests for command dispatch.

**Success:** `index.ts` under ~200 lines (routing + wiring only); each
command handler under ~150 lines and individually testable.

**Plan:** authored when B2's first feature PR lands.

## B4. Lint debt 16 → 0, remove the ratchet

**Problem:** 16 known ESLint errors held by `.lint-ceiling`.

**Approach:** burn down in one or two PRs, lowering the ceiling with each
commit (the ratchet enforces monotonic progress). When it hits 0, replace
the ceiling script with plain `eslint --max-warnings 0` in CI and delete
`.lint-ceiling`. Same follow-up applies to `.deno-check-ceiling` (16) if the
fixes prove cheap — assess after the lint burn-down.

**Success:** `npm run lint` exits 0; ceiling machinery removed.

**Plan:** no separate plan needed — mechanical; execute directly with the
ratchet as the guide.

## Order and status

| Item | Size | Status |
|---|---|---|
| B1 http timeouts | S | DONE — PR #88, 24 fns redeployed 2026-07-16 |
| B2 data layer + component tests | L (per-feature PRs) | in progress — settings migrated (guard 15→10) |
| B3 telegram-bot split | M | pending B2 start |
| B4 lint 16→0 | S | any time; scheduled last to avoid conflicts |
