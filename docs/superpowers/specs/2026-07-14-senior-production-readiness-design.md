# Tonus Senior Production Readiness

- **Date:** 2026-07-14
- **Status:** Approved; canonical program specification
- **Owner:** Product engineering
- **Target:** Public beta and a demonstrably senior-level full-stack codebase
- **Delivery:** 15 independently reviewable pull requests

## 1. Purpose

Tonus is already a substantial full-stack product: React and TypeScript on the
client, Supabase Postgres with Row Level Security, Deno Edge Functions,
health-data ingestion, Telegram automation, AI workflows, automated tests, and
CI-controlled deployment.

The next milestone is not more product surface. It is evidence that the
existing system is safe, observable, reliable, recoverable, maintainable, and
releasable by a process that does not depend on its original author.

This document is the single source of truth for that milestone. It supersedes:

- `2026-07-13-senior-production-readiness-design.md`;
- `2026-07-14-public-repository-architecture-hardening-design.md`.

Completed debt-reduction work remains documented in
`2026-07-13-tech-debt-status.md`. The older
`2026-07-13-tech-debt-reduction-design.md` is historical context, not an active
requirements source.

## 2. What “senior production readiness” means

Senior readiness is demonstrated by explicit contracts and verified operating
procedures, not by the number of frameworks or features.

| Property | Required evidence |
|---|---|
| Security | Automated negative RLS/auth tests, protected deployment branch, secret and dependency scanning |
| Reliability | Idempotency before retry, bounded timeouts, terminal states, and recovery paths |
| Observability | Release SHA, request ID, structured events, safe error tracking, and tested alert routing |
| Privacy | Complete data inventory, consent boundaries, export, deletion, token revocation, and retention enforcement |
| Recovery | A restore drill with measured RTO/RPO and an incident-response procedure |
| Quality | Typecheck, tests, build, lint/Deno ratchets, security checks, and critical journeys block merge |
| Maintainability | Narrow entrypoints, clear domain ownership, canonical documentation, and portable setup |
| Operability | Repeatable release and rollback performed from documented runbooks |

### Beta service objectives

- **Availability:** at least 99.5% for core authenticated read/write flows over
  30 days.
- **Error-free sessions:** at least 99% of frontend sessions.
- **Critical API success rate:** at least 99%, excluding confirmed upstream
  provider outages.
- **Detection time:** a critical production failure alerts within 15 minutes.
- **RPO:** no more than 24 hours.
- **RTO:** no more than 4 hours.
- **Release gate:** 100% of required checks pass before merge to `main`.

These are beta engineering objectives, not a medical-availability promise.
Tonus is not an emergency system or a certified medical device.

## 3. Scope

### Included

- GitHub security, repository governance, and contributor-facing hygiene;
- RLS, endpoint authorization, service-role, CORS, and rate-limit validation;
- frontend and Edge Function observability;
- reliability of health ingestion, Telegram, cron, calendar, and AI providers;
- privacy, consent, export, deletion, retention, and token revocation;
- backup, restore, incident response, release, and rollback;
- decomposition of current frontend and Edge Function orchestration hotspots;
- critical beta journeys, degraded states, accessibility, and supportability;
- canonical documentation and extraction of unrelated tooling.

### Excluded

- new product features unrelated to readiness;
- a separate Node.js backend without a measured Edge Function limitation;
- microservices, Kubernetes, an event bus, or custom authentication;
- a React, Supabase, Vite, or Deno rewrite;
- certification as a medical device or replacement of legal privacy review;
- 100% test coverage or refactoring for line count alone;
- visual redesign unrelated to a critical usability or accessibility defect.

## 4. Non-negotiable engineering rules

1. **Supabase remains the backend platform.** Postgres, RLS, Storage, and Edge
   Functions remain the system boundary until measurements prove they cannot
   satisfy a workload.
2. **Fail closed.** Missing auth, secret, ownership, or policy configuration
   denies access.
3. **User-scoped by construction.** User data is accessed through user JWT and
   RLS, or ownership is validated before any service-role operation.
4. **Minimize sensitive data.** Logs and telemetry must not contain tokens,
   arbitrary request bodies, AI prompts, chat text, health measurements, lab
   values, medication names, email addresses, or Telegram identifiers.
5. **Idempotency before retry.** Automatic retry is allowed only after repeat
   safety is proven.
6. **Observable boundaries.** External operations record request ID, duration,
   outcome, release, and a stable error code.
7. **No silent failure.** Critical paths may not ignore database errors, use
   empty catches, or launch untracked fire-and-forget work.
8. **Migrations are the database contract.** Production schema changes are
   represented by reviewed migrations with forward-fix and rollback notes.
9. **Characterize before refactoring.** Existing behavior is protected before
   code moves; feature changes do not share architecture pull requests.
10. **One concern per pull request.** Every change is independently testable
    and reversible.

## 5. Required outcomes

### 5.1 Repository security and public governance

- Protect `main`; block force pushes and deletion.
- Require stable CI checks before merge.
- Enable Dependabot alerts and security updates, secret scanning, push
  protection, CodeQL, and private vulnerability reporting where supported.
- Add `SECURITY.md` and `CONTRIBUTING.md`.
- Reconcile `AGENTS.md` and `CLAUDE.md` with actual Vitest projects, CI, and
  deployment procedures.
- Replace user-specific absolute paths with a repository Node-version contract.
- Keep Supabase MCP access read-only by default and credential-free in tracked
  configuration.

**Accepted when:** a failing required check blocks merge; a safe dummy-secret
test is blocked or detected; setup works without editing a machine-specific
path; contributor documents contain no conflicting project facts.

### 5.2 Authorization and security validation

- Maintain a machine-readable inventory of tables, views, RPCs, Storage
  buckets, Edge Functions, cron entrypoints, and their auth owners.
- Test anonymous and cross-user select, insert/update, and delete for every
  user-owned resource.
- Document and test the alternative auth boundary of every
  `verify_jwt = false` function.
- Prove that user-controlled identifiers cannot redirect service-role access.
- Restrict authenticated CORS and define rate limits for public and costly AI
  endpoints.
- Maintain a threat model with assets, trust boundaries, abuse cases, and
  residual risks.

**Accepted when:** the automated negative matrix passes in CI; every endpoint
has auth, owner, rate-limit, and data-sensitivity metadata; no open critical or
high finding remains.

### 5.3 Production observability

Use one provider-independent adapter on the client and one shared Edge Function
adapter. Events use the following minimum contract:

```ts
type TonusEvent = {
  timestamp: string
  environment: 'preview' | 'production'
  service: 'web' | 'edge'
  operation: string
  requestId: string
  outcome: 'success' | 'failure' | 'delivery_unknown'
  durationMs?: number
  errorCode?: string
  release?: string
}
```

- Correlate frontend and Edge Function failures with the same request ID.
- Attach the exact release SHA; upload source maps only to the error provider.
- Redact prohibited fields before transport.
- Alert on auth spikes, ingest failures, cron failures, Telegram delivery,
  upstream AI failures, and frontend crash rate.
- Demo mode must not pollute production telemetry.

**Accepted when:** a synthetic failure appears with release and request ID,
triggers the expected alert within 15 minutes, and automated redaction tests
prove that prohibited fields are absent.

### 5.4 Integration reliability

Inventory each external operation with owner, timeout, idempotency key, retry
policy, concurrency policy, and terminal state.

- Use explicit timeouts and bounded exponential backoff with jitter.
- Do not retry validation, auth, consent, budget, or permanent provider errors.
- Prevent concurrent processing of the same business event.
- Persist work that cannot safely be lost.
- Provide manual recovery for terminal or delivery-unknown states.
- Surface last successful sync, diagnostic state, and safe recovery action.

**Accepted when:** duplicate webhooks do not create duplicate records; repeated
cron invocations do not duplicate delivery; provider 429/5xx/timeouts cannot
create a retry storm; every failed job reaches a diagnostic terminal state;
timeout, malformed response, network throw, 429, and 5xx tests pass.

### 5.5 Privacy and data lifecycle

- Document every data category: source, purpose, location, processor, region,
  retention, export, and deletion path.
- Require informed consent before sending health context or lab material to an
  external AI provider.
- Require recent re-authentication and explicit confirmation for deletion.
- Delete or irreversibly detach database rows, Storage objects, Telegram links,
  ingest/widget tokens, scheduled work, and external integration credentials.
- Enforce raw-ingest retention of no more than 30 days unless a stricter or
  explicitly justified policy applies.
- Verify export completeness and exclude internal secrets.
- Allow integration revocation and immediate token invalidation.

**Accepted when:** an integration test creates a user across all owned data
surfaces, performs deletion, and proves no accessible residue remains; expired
raw payload is removed automatically; export, deletion, and revocation work
without developer intervention.

### 5.6 Backup, incident response, release, and rollback

- Verify automatic database backup and document recovery of Postgres, Storage,
  secrets/configuration, cron, and external integration state.
- Restore into an isolated environment and run schema, RLS, auth, ingest,
  dashboard, and deletion checks.
- Define incident severity, ownership, communication, token compromise, and
  postmortem procedures.
- Isolate preview from production data and credentials.
- Bind deployments and telemetry to the exact commit SHA.
- Require migration forward-fix/rollback notes before merge.
- Document and perform frontend, Edge Function, and migration recovery.

**Accepted when:** a second person follows the runbook without private verbal
context; restore meets RTO/RPO; rollback is demonstrated; the release checklist
requires no more than 15 minutes of manual work.

### 5.7 Architecture and maintainability

- Keep `src/App.tsx` as a composition root; extract bootstrap, demo lifecycle,
  navigation, refresh, and cross-feature overlay orchestration behind narrow
  contracts.
- Keep only tokens, reset, typography, and true layout primitives in global
  CSS; move feature selectors to discoverable owners.
- Group `src/lib/` by stable domain while preserving compatibility imports
  during migration and avoiding a generic `utils/` dumping ground.
- Keep `telegram-bot/index.ts` as request/auth/dispatch/response wiring;
  extract routing, commands, callbacks, state, presentation, transport, and
  Tonus services.
- Separate reminder selection, eligibility, idempotency, delivery transitions,
  rendering, transport, retry classification, and observability.
- Separate health-context queries, normalization, unit handling, aggregation,
  derived summaries, redaction, and AI-safe formatting.

**Accepted when:** entrypoints contain boundary wiring rather than product
policy; characterization and golden tests preserve behavior; there are no new
dependency cycles; relevant build, unit, component, Deno, and Playwright checks
pass after every extraction.

### 5.8 Documentation and repository scope

- Make `CONTRIBUTING.md` the canonical contributor workflow.
- Add `docs/README.md` with active setup, architecture, deployment, security,
  privacy, observability, backup, release, and incident links.
- Mark design records as draft, approved, implemented, superseded, or archived.
- Treat `docs/archive/` as explicitly non-authoritative.
- Extract `claude-monitor/` into an independently owned repository after
  dependency and secret checks; do not copy cookies, profiles, caches, reports,
  credentials, or operational data.

**Accepted when:** a new contributor can locate and execute the workflow
without private context; active documents contain no broken link; Tonus build
and deployment do not depend on `claude-monitor/`.

### 5.9 Critical journeys and supportability

The following journeys must work on mobile and desktop:

1. registration, login, and access recovery;
2. health-source connection or import;
3. readiness display with incomplete-data explanation;
4. event entry and correction;
5. AI question with a clear degraded state;
6. Telegram link and unlink;
7. account export and deletion.

Each journey requires loading, empty, offline, permission-denied, and relevant
provider-unavailable behavior; keyboard/focus accessibility; actionable errors;
and sanitized support diagnostics containing release and request ID but no
secret or health payload.

**Accepted when:** seven Playwright journeys pass on supported mobile and
desktop viewports; five external beta users finish onboarding without author
assistance; no P0 usability or accessibility blocker remains.

## 6. Implementation roadmap — 15 pull requests

Each row is a review boundary, not permission to combine all listed files into
one large rewrite. A PR receives a focused implementation plan before coding.

| PR | Priority | Deliverable | Primary surfaces | Required proof |
|---:|:---:|---|---|---|
| 1 | P0 | GitHub security and merge governance | repository ruleset, `.github/workflows/`, `SECURITY.md` | failing check blocks merge; scanning controls visible; dummy-secret test |
| 2 | P1 | Canonical contributor and portable tool configuration | `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/launch.json`, Node version file, MCP config | clean-machine setup review; no absolute path or tracked credential |
| 3 | P1 | Documentation index and `claude-monitor` extraction | `docs/README.md`, `docs/archive/`, `claude-monitor/` | link checks; independent tool validation; Tonus dependency scan |
| 4 | P0 | Security inventory, threat model, and RLS/auth negative matrix | `supabase/migrations/`, `supabase/config.toml`, `supabase/functions/`, `tests/security/` | anonymous/cross-user/service-role tests in CI; no critical/high finding |
| 5 | P0 | Privacy-safe observability foundation | client adapter, `_shared/observability.ts`, observability runbook | correlation test, redaction test, synthetic alert within 15 minutes |
| 6 | P1 | Reliability contracts and shared primitives | timeout/retry/idempotency helpers, operation catalogue | deterministic timeout/backoff tests; no retry for permanent failures |
| 7 | P1 | Health-ingest and sync idempotency | ingest functions, sync jobs, relevant migrations and UI status | duplicate, concurrent, 429, 5xx, malformed, and recovery tests |
| 8 | P1 | Telegram/reminder reliability and decomposition | bot routing/modules, reminder policy/delivery modules, ops guide | command/callback characterization; duplicate cron safety; terminal-state tests |
| 9 | P0 | Data inventory, AI consent, and integration revocation | privacy docs, AI entrypoints, Settings integration controls | consent boundaries; token revocation test; processors match implementation |
| 10 | P0 | Account deletion, export verification, and retention enforcement | migrations/RPC, Storage cleanup, Settings flow, retention job | full fixture deletion test; export completeness; expired payload removal |
| 11 | P0 | Backup, restore, and incident response | backup/incident runbooks, restore validation scripts or checklist | second-person restore drill within RTO/RPO; compromised-token exercise |
| 12 | P1 | Release governance and rollback | workflow gates, release runbook, migration checklist, release diagnostics | isolated preview; exact SHA; frontend/function/DB rollback drill |
| 13 | P1 | Frontend composition and domain ownership | `src/App.tsx`, `src/index.css`, `src/lib/`, behavior tests | no behavioral/visual regression; no cycles; compatibility imports |
| 14 | P1 | Health-context boundary decomposition | `_shared/healthContext.ts` and focused modules/tests | golden output parity for units, dates, missing data, and redaction |
| 15 | P1 | Critical journeys, support bundle, and final quality ratchet | Playwright, UI degraded states, diagnostics, lint/Deno baselines | seven journeys × mobile/desktop; sanitized bundle; zero unexplained ratchet debt |

### Dependencies

```text
PR 1 ─┬─> PR 4 ─> PR 9 ─> PR 10 ─> PR 11
      └─> PR 2 ─> PR 3

PR 5 ─> PR 6 ─┬─> PR 7
               └─> PR 8

PR 4 + PR 5 ─> PR 12
PR 5 + existing behavior tests ─> PR 13 and PR 14
PR 7–14 ─> PR 15
```

PRs 13 and 14 may run in parallel because they have separate primary
surfaces. PR 8 may not mix new Telegram behavior with decomposition. PR 15 is
the final proof gate, not a place to hide unfinished work from earlier PRs.

## 7. Verification contract

Each PR runs the smallest relevant focused tests plus every affected project
gate. The final complete gate is:

```bash
npm test
npm run build
npm run lint:ceiling
npm run check:functions
npm run test:scripts
npm run test:readme
npm run test:e2e
```

Additional mandatory evidence:

- repository settings: effective GitHub ruleset and disposable test PR;
- security: full negative access matrix and credential-pattern scan;
- observability: synthetic failure, correlation, redaction, and alert receipt;
- reliability: duplicate, concurrency, timeout, 429, 5xx, malformed response,
  and manual replay scenarios;
- privacy: full-user fixture export/deletion/revocation and retention execution;
- recovery: dated restore and rollback drill log without production personal
  data;
- architecture: characterization tests before extraction and relevant visual
  or golden parity afterward;
- beta: mobile and desktop critical journeys with sanitized diagnostics.

Ratchets may only move down. Program completion requires zero unexplained lint
or Deno-check debt; any unavoidable tool false positive must be narrowly
suppressed at the exact line with a written reason, not hidden by a raised
global ceiling.

## 8. Rollout and stop conditions

- Enable new GitHub checks in advisory mode for one stable pull-request cycle
  before making them required.
- Use compatibility exports for file moves and remove them in a later
  mechanical change only after import migration is verified.
- Delete documentation only after tracked-reference validation.
- Perform restore and destructive deletion tests only in an isolated
  environment with synthetic data.
- Attach a rollback note to every PR; no workstream may require reverting the
  entire program.

Stop a PR when:

- user-visible behavior changes outside its approved scope;
- a required check fails or a ratchet increases;
- an undocumented data, auth, deployment, or external-provider dependency is
  discovered;
- bundle, startup, or relevant runtime metrics regress materially;
- a module extraction introduces a cycle or a less coherent boundary;
- a security control blocks emergency recovery without a documented owner
  path.

Resume only after the discovered contract and residual risk are documented and
reviewed.

## 9. Program definition of done

Public beta and the senior-readiness claim require all of the following:

- [ ] all 15 roadmap PRs are accepted or an explicit evidence-backed decision
  records why a PR is unnecessary;
- [ ] `main` is protected and the complete stable quality gate blocks merge;
- [ ] Dependabot security updates, secret scanning, push protection, CodeQL,
  and private vulnerability reporting are active where GitHub supports them;
- [ ] no open critical/high security finding exists;
- [ ] every user-data surface passes the negative authorization matrix;
- [ ] telemetry redaction and 15-minute synthetic alerting are verified;
- [ ] critical integrations have tested idempotency, timeout, terminal states,
  and recovery;
- [ ] export, deletion, retention, consent, and revocation tests pass;
- [ ] a second person completes restore within RTO/RPO without verbal help;
- [ ] frontend, Edge Function, and migration rollback are demonstrated;
- [ ] public setup and active documentation are canonical, portable, and free
  of broken links or credentials;
- [ ] unrelated `claude-monitor` tooling no longer lives inside the Tonus
  product boundary;
- [ ] architecture entrypoints are wiring boundaries protected by behavior,
  golden, and integration tests;
- [ ] all seven critical journeys pass on mobile and desktop;
- [ ] five beta users complete onboarding without author assistance;
- [ ] the release candidate runs for seven days without an open P0/P1 defect;
- [ ] the product owner signs the go/no-go checklist.

## 10. Required program artifacts

The completed program leaves these durable sources of truth:

- `SECURITY.md` and `CONTRIBUTING.md`;
- `docs/README.md`;
- security inventory and threat model;
- privacy data inventory, retention policy, and AI-processing description;
- observability, integration-recovery, backup/restore, incident-response, and
  release runbooks;
- dated restore, rollback, and synthetic-alert evidence;
- implementation plans and PR links for each roadmap item;
- residual-risk register with owner and review date.

No additional umbrella design document should be created for this program.
New documents must either be a focused implementation plan for one roadmap PR,
a required runbook, or execution evidence.

## 11. Estimated effort

For one strong full-stack engineer working from the current codebase:

- repository/security foundation: 1–2 weeks;
- authorization and privacy validation: 2–4 weeks;
- observability and integration reliability: 2–4 weeks;
- backup, incident, release, and rollback evidence: 1–2 weeks;
- architecture decomposition and critical journeys: 2–4 weeks.

Expected calendar time is **8–12 focused full-time weeks**, or approximately
**3–5 months alongside ongoing product work**. Security, restore, and beta
evidence cannot be compressed merely by adding parallel implementation.

## 12. Node.js backend decision

The lack of a separate Node.js backend is not a readiness gap. Add a long-lived
service only if measurements demonstrate at least one of these conditions:

- Edge Function runtime or timeout limits block a required workload;
- a persistent connection or queue consumer is required;
- a necessary library/runtime is unavailable in Deno;
- measured latency or cost is structurally unacceptable;
- compliance requires a separate isolated boundary.

Until then, an additional backend would increase secrets, deployments, failure
modes, and operational ownership without proven value.
