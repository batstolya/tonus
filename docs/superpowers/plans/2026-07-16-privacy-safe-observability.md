# Privacy-safe Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 0 PR 5 with useful production error events and alerts that cannot transport health or identity data.

**Architecture:** A strict technical event contract is shared conceptually by the browser and Edge Functions. The browser reports authenticated failures through a dedicated Edge Function; the Edge adapter stores only allowlisted metadata in a locked Supabase table and optionally sends the same safe fields to an owner-only Telegram alert chat. Critical Edge handlers use one wrapper that supplies request correlation and records 5xx/uncaught failures without changing their business responses.

**Tech Stack:** TypeScript 6, React 19, Vite 8, Supabase Postgres/RLS, Supabase Edge Functions (Deno), Vitest, Telegram Bot API.

## Global Constraints

- Use Node 24 for build and lint commands.
- Never transport an `Error`, message, stack, request body, token, email, Telegram identifier, prompt, lab value, medication name, or health value.
- Event values are server-generated or strict allowlisted identifiers; unknown input keys are discarded.
- Demo mode emits no event.
- Error reporting is best-effort and must not replace or delay the product response materially.
- This branch may open a PR but must not be merged or deployed without the owner.

---

### Task 1: Safe event contract and locked storage

**Files:**
- Create: `supabase/functions/_shared/observability.ts`
- Create: `supabase/functions/_shared/observability.test.ts`
- Create: `supabase/migrations/20260716020000_observability_events.sql`

**Interfaces:**
- Produces: `TonusEvent`, `SafeOperation`, `buildSafeEvent(input)`, `requestIdFor(req)`, and `ObservabilityTransport`.
- The persisted event contains only `timestamp`, `environment`, `service`, `operation`, `request_id`, `outcome`, `duration_ms`, `error_code`, and `release`.

- [ ] Write failing tests proving valid metadata is normalized, unknown/prohibited fields never reach the transport object, invalid identifiers fail closed, and request IDs are reused only when safe.
- [ ] Run `npm test -- supabase/functions/_shared/observability.test.ts` and confirm the missing module/API failure.
- [ ] Implement the minimum pure contract and request-ID helpers.
- [ ] Run the focused tests and confirm they pass.
- [ ] Add an append-only migration with strict checks, RLS enabled, no browser policies, and a created-at index.

### Task 2: Edge transport, alert, and wrapper

**Files:**
- Modify: `supabase/functions/_shared/observability.ts`
- Modify: `supabase/functions/_shared/observability.test.ts`

**Interfaces:**
- Produces: `captureEdgeFailure(input, deps?)` and `withObservability(operation, handler, deps?)`.
- Production dependencies use `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TONUS_ALERT_CHAT_ID`, `TONUS_ENVIRONMENT`, and `TONUS_RELEASE_SHA`.

- [ ] Add failing tests with spy transports proving only the safe event object is persisted/notified, preview does not notify, transport failure never replaces the handler response, 5xx is captured, and every response receives `x-request-id`.
- [ ] Run the focused test and confirm the new behavior fails for the expected reason.
- [ ] Implement bounded best-effort persistence/notification and the handler wrapper.
- [ ] Run the focused test and confirm it passes.

### Task 3: Authenticated browser adapter

**Files:**
- Create: `src/lib/observability.ts`
- Create: `src/lib/observability.test.ts`
- Modify: `src/main.tsx`
- Modify: `vite.config.ts`
- Create: `src/vite-env.d.ts`

**Interfaces:**
- Produces: `captureClientFailure(operation, errorCode, requestId?)` and `installClientObservability()`.
- Browser operations are limited to `web.global_error`, `web.unhandled_rejection`, and `web.edge_function_failure`.

- [ ] Write failing tests proving demo suppression, static error-code mapping, exact build release/environment fields, and no raw error/message/stack in the invocation body.
- [ ] Run `npm test -- src/lib/observability.test.ts` and confirm the API is missing.
- [ ] Implement the adapter with injected dependencies for tests and authenticated `supabase.functions.invoke` in production.
- [ ] Install global error/rejection listeners once before React renders.
- [ ] Expose Vercel/GitHub build SHA and preview/production environment through Vite compile-time constants.
- [ ] Run the focused tests and build.

### Task 4: Authenticated client-report Edge Function

**Files:**
- Create: `supabase/functions/report-client-error/index.ts`
- Modify: `supabase/config.toml`
- Modify: `supabase/functions/_shared/observability.test.ts`

**Interfaces:**
- Consumes: browser payload `{ operation, requestId, errorCode, release }`.
- Produces: `202 { accepted: true, requestId }` only after `auth.getUser()` succeeds; all persisted fields are rebuilt through `buildSafeEvent`.

- [ ] Add failing parser tests for allowed browser operations, malformed payloads, demo-like input, and prohibited extra keys.
- [ ] Implement the handler with JWT verification plus an explicit `auth.getUser()` check.
- [ ] Add `[functions.report-client-error] verify_jwt = true`.
- [ ] Run focused tests and `npm run check:functions`; do not increase the Deno error ceiling.

### Task 5: Critical-operation correlation

**Files:**
- Modify: `supabase/functions/ingest-health/index.ts`
- Modify: `supabase/functions/send-reminders/index.ts`
- Modify: `supabase/functions/telegram-bot/index.ts`
- Create: `tests/observability-inventory.test.ts`

**Interfaces:**
- Each handler is wrapped once with operations `edge.ingest_health`, `edge.send_reminders`, and `edge.telegram_bot`.

- [ ] Write a failing inventory test proving all three critical handlers use `withObservability` and no handler passes request bodies or raw errors into the adapter.
- [ ] Mechanically extract each existing inline handler and wrap it without changing authorization, response status, or business logic.
- [ ] Run the inventory test, the complete Vitest suite, Deno ratchet, and build.

### Task 6: Operations guide, review, and PR

**Files:**
- Create: `docs/guides/observability.md`
- Modify: `docs/guides/security-secrets-runbook.md`

- [ ] Document schema, prohibited data, secret names, release-SHA requirement, alert-chat setup, synthetic safe-event check, rollback, and the limitation that production acceptance cannot be claimed before merge/deploy/live receipt.
- [ ] Run `npm test`, `npm run test:scripts`, `npm run build`, `npm run lint:ceiling`, `npm run lint:diff`, `npm run check:functions`, `npm run test:readme`, and targeted Playwright smoke.
- [ ] Review the complete `origin/main...HEAD` diff for privacy leakage, auth bypass, behavior drift, and excess scope; resolve every high/critical finding.
- [ ] Push and open a non-draft PR to `main`; do not merge or deploy it.

## Self-review

- Spec coverage: client adapter, shared Edge adapter, environment/release/operation/request ID, strict redaction, demo suppression, critical failures, and alert setup are mapped above.
- Scope: no dashboard, SLO, incident-role system, source-map upload, or unrelated refactor.
- Deployment boundary: live event/notification evidence remains post-merge because `AGENTS.md` forbids deploying an unmerged branch.
