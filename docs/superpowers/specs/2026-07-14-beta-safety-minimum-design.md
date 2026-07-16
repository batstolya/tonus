# Tonus Beta Safety Minimum

- **Date:** 2026-07-15
- **Status:** Approved; execution in progress, with PR 0 deployed and production-verified
- **Owner:** Anatolii
- **Target:** Make Tonus safe enough to invite the first five external beta users
- **Delivery:** Nine focused pull requests followed by observed user validation
- **Parent program:** `2026-07-14-senior-production-readiness-design.md`

## 1. Purpose

The parent senior-readiness program defines the long-term engineering standard
for Tonus. Implementing all fifteen parent roadmap items before anyone outside
uses the product would delay the cheapest product evidence: watching intended
users try it.

This specification defines **Phase 0**, the mandatory safety and quality gate
before the first external invitations. It protects health data, AI processing,
accounts, recovery, error handling, and the production deployment path. It
postpones broader architecture and operational work until actual usage or team
growth demonstrates the need.

The parent program is parked, not cancelled. Phase 0 completion allows a
five-user beta; it does not constitute completion of senior production
readiness.

## 2. Release rule

No external user receives an invitation until PR 0–8 are:

1. merged or otherwise recorded in the protected release history;
2. deployed to the intended environment from a clean checkout of the reviewed
   commit;
3. verified through their required production or isolated-environment checks;
4. free of unresolved critical or high security/privacy findings.

PR 0 is an emergency security fix. Its production deployment and black-box
verification must precede any public commit, branch, issue, or pull request that
describes the affected authorization path.

The nine PRs have different purposes:

- **Hard safety:** PR 0, 1, 2, 3, 4, 6, and 7.
- **Operational safety:** PR 5.
- **Release quality:** PR 8.

The labels explain risk; they do not relax the release rule. All nine are small
enough and valuable enough to remain prerequisites for the first invitations.

## 3. Verified baseline

As of 2026-07-15:

- the repository is public;
- `main` is not protected and production frontend deployment follows changes to
  `main`;
- GitHub secret scanning, push protection, security updates, and code scanning
  are not fully enabled;
- Edge Functions are deployed manually and the repository has no reproducible,
  tracked mechanism proving which reviewed commit is live;
- no automated black-box matrix proves anonymous and cross-user isolation for
  every user-data table, Storage bucket, and non-standard Edge Function auth
  boundary;
- eleven Edge Functions use `verify_jwt = false` and require their own tested
  authorization boundary;
- three Edge Functions used partial service-role token validation for internal
  calls carrying a user identifier. PR 0 secure versions are deployed and the
  required synthetic production black-box matrix passes; draft PR #63 is open
  with green CI and awaits review/merge;
- twelve Edge Functions use Google Gemini for AI processing;
- AI consent is stored only in browser `localStorage` and guards two UI entry
  points, not every server-side egress to Gemini;
- account export exists, while complete account deletion is not proven;
- the active Supabase backup/PITR capability and a working restore procedure
  are not verified;
- historical browser-profile/session material was removed from version
  control, while credential and session rotation status must be confirmed
  privately.

Exact table, function, and integration counts must come from generated
inventories. Hand-maintained snapshot counts above describe the audit and are
not implementation contracts.

## 4. Pull requests

### PR 0 — Emergency service-to-service authorization fix

**Scope**

- Replace partial service-role token validation in `coach-profile`,
  `biweekly-report`, and `suggest-experiments` with a full, fail-closed
  comparison through the shared authorization helper.
- Reject public anon keys, user access tokens, malformed authorization headers,
  and missing runtime configuration on the internal-call path.
- Preserve ordinary user-JWT calls and trusted Telegram/reminder calls.
- Do not add product behavior or unrelated refactoring.
- Translate new code and test comments to English before public review.

**Current implementation evidence**

- branch: `fix/service-role-auth-bypass`;
- reviewed/deployed commit: `a611fbe422fce2e33c499fa12f17acb2288d01b8`;
- GitHub record: draft PR #63, with CI and Vercel checks passing;
- focused auth tests: 15 passing;
- complete Vitest suite: 484 passing;
- Deno-check errors: 16, equal to the existing ratchet;
- lint errors: 16, equal to the existing ratchet;
- Chromium journeys: 6 passing;
- deployed versions: `coach-profile` v11, `biweekly-report` v34, and
  `suggest-experiments` v11, all `ACTIVE` with intended JWT modes;
- production smoke: all nine denied-path checks, all six user/service scoping
  assertions, the deterministic cross-user budget sentinel, and synthetic
  fixture cleanup passed.

No credential, synthetic identifier, response body, or real health record was
retained in the deployment evidence.

**Acceptance**

- Public/user tokens plus a caller-controlled user identifier cannot enter the
  internal service path.
- A normal authenticated user call remains scoped to that user.
- Telegram report generation, reminder report generation, and Telegram
  experiment suggestions still work.
- Missing internal authentication configuration fails closed.
- Deployment evidence ties the tested function behavior to the reviewed commit.

**Rollback**

Do not restore partial token comparison. If a legitimate caller breaks, keep
the secure functions deployed, disable the affected internal workflow, inspect
its headers, and forward-fix the caller. Only a previously secure function
version may be redeployed.

**Follow-up boundary**

PR 0 may compare the full service-role credential to close the active
vulnerability with the smallest patch. PR 3 replaces that over-privileged
credential with a dedicated internal secret.

### PR 1 — Repository governance and Edge Function deployment evidence

**Repository scope**

- Protect `main` against force-push and deletion.
- Require pull requests and stable CI checks before merge.
- Enable Dependabot alerts/security updates, secret scanning, push protection,
  CodeQL, and private vulnerability reporting where supported.
- Add `SECURITY.md` with a private reporting address.
- Add a concise `CONTRIBUTING.md` linking the real Node 24, test, ratchet,
  frontend deployment, and Edge Function deployment workflows.

**Deployment scope**

- Add one canonical Edge Function deployment guide and wrapper/checklist.
- The mechanism accepts an explicit function list, refuses a dirty checkout,
  prints the exact Git SHA, deploys only the named functions, and requires
  post-deployment smoke checks.
- Record function names, project reference, reviewed SHA, operator, deployment
  time, and smoke result without recording credentials.
- Attach the sanitized deployment receipt to the corresponding change record.
- Keep production deployment manual in Phase 0. CI receives no broad Supabase
  production credential merely to automate a low-frequency operation.

Enable new required GitHub checks in advisory mode for one successful PR cycle
before making them mandatory.

**Acceptance**

- A failing required check blocks merge.
- Force-push and branch deletion are blocked.
- A safe dummy-secret test is blocked or detected.
- A stranger has a private vulnerability-reporting path.
- A reviewer can determine which commit and function list were deployed and
  see the corresponding smoke result.

### PR 2 — Generated security inventory and negative authorization matrix

This PR is read-only with respect to production behavior. It builds evidence
before changing additional boundaries.

**Scope**

- Generate a machine-readable inventory of user-data tables, views, RPCs,
  Storage buckets, Edge Functions, and their authorization owners.
- Against an isolated Supabase project with two fixture users, verify:
  - anonymous select/insert/update/delete is denied or returns no protected
    data;
  - user B cannot read, modify, or delete user A's data;
  - cross-user Storage object access is denied;
  - each `verify_jwt = false` function rejects missing, invalid, and
    inappropriate credentials;
  - a caller cannot redirect service-role work with another user's identifier.
- Make CI fail when a new protected surface is not classified.
- Record current CORS, rate-limit, credential type, and data sensitivity without
  changing production behavior in this PR.

**Acceptance**

- The complete negative matrix passes in CI.
- Every protected surface has an auth owner and sensitivity classification.
- Inventory drift fails CI.
- Findings are prioritized; no critical/high finding is silently moved to a
  later phase.

### PR 3 — Dedicated internal authentication and minimum abuse controls

**Internal authentication**

- Introduce a dedicated `TONUS_INTERNAL_SECRET` for trusted service-to-service
  calls; never expose it to the frontend.
- Compare the full value with the shared fail-closed secret helper.
- Migrate callees first to accept the new secret without weakening the exact
  PR 0 check, then migrate callers, verify them, and finally remove use of the
  service-role credential as an inter-function bearer.
- Keep the Supabase service-role key inside functions only for authorized
  database operations.

**Abuse and CORS controls**

- Use the PR 2 inventory to define the allowed browser origins for UI-only
  endpoints and document explicit exceptions for webhooks, cron, and Scriptable
  widget access.
- Add minimum durable rate limits to public token-based endpoints and costly AI
  operations that lack an effective limit.
- Key authenticated limits by user; key long-lived token limits by a hash, never
  by storing raw tokens in rate-limit logs.
- Existing AI cost budgets remain defense-in-depth and do not replace request
  rate limiting.

**Acceptance**

- No internal HTTP caller sends the service-role key as its authentication
  credential.
- Missing/wrong internal secrets fail closed before side effects.
- UI-only CORS rejects unapproved origins while documented non-browser clients
  still work.
- Rate-limit tests cover allowed traffic, exceeded limits, reset behavior, and
  isolation between users/tokens.

### PR 4 — Durable account-level AI processing consent

**Data contract**

- Store consent in Supabase per user, provider, purpose, and policy version with
  `granted_at` and nullable `revoked_at`.
- Consent is denied by default and protected by RLS.
- Existing browser `localStorage` values are not migrated as proof of consent;
  current users must consent again through the durable flow.

**Egress boundary**

- Add one shared Edge Function helper that checks current consent immediately
  before constructing or sending any Gemini request containing user-provided or
  health-related data.
- Apply it to the generated inventory of all Gemini-using functions, including
  UI, scheduled, Telegram, and internal paths.
- A missing row, revoked consent, unknown policy version, or database error
  fails closed before third-party egress.
- Add an inventory test that fails when a new Gemini-using function lacks the
  shared consent boundary.

**User experience**

- Explain the provider, categories of data, processing purpose, and revocation
  effect in plain language.
- Allow grant/revoke from Settings on every device.
- When a Telegram or scheduled workflow lacks consent, do not call Gemini;
  return a safe explanation directing the user to Settings.
- Revocation affects subsequent AI calls immediately; it does not claim to
  erase data already processed by a third party beyond the documented provider
  contract.

**Acceptance**

- All inventoried Gemini egress paths pass server-side consent tests.
- Calls with missing/revoked/stale consent make zero provider request.
- Consent granted on one device is visible on another.
- Revocation blocks UI, Telegram, scheduled, and internal AI paths.
- Logs and analytics contain no consent payload or health data beyond the
  minimum status metadata.

Legal review of consent copy and provider terms remains a professional task;
engineering tests prove enforcement, not legal sufficiency.

### PR 5 — Privacy-safe error tracking and basic alerting

**Scope**

- Add one client adapter and one shared Edge Function adapter.
- Attach environment, exact release SHA, operation, and request ID.
- Redact tokens, arbitrary bodies, health values, lab results, medication
  names, chat text, AI prompts, emails, and Telegram identifiers before
  transport.
- Prevent demo mode from reporting production events.
- Configure one actively monitored notification for new production errors and
  repeated failures of critical operations.

Formal SLO dashboards, multi-level incident roles, and a large observability
platform remain outside Phase 0.

**Acceptance**

- A deliberate safe test error appears with the correct release SHA/request ID.
- Redaction tests fail when a prohibited field reaches transport.
- The test error triggers the configured notification.
- Demo mode produces no production event.

### PR 6 — Complete account deletion

**Scope**

- Add a Settings flow with recent re-authentication and explicit destructive
  confirmation.
- Delete or irreversibly detach every user-owned record, Storage object,
  Telegram link, ingest/widget token, scheduled job, AI-consent record, and
  external integration credential listed by the generated inventory.
- Revoke active sessions and prevent deleted credentials from reuse.
- Keep export intact and verify that it excludes internal secrets.
- Add an isolated integration test that creates a fixture user across every
  owned surface, deletes the account, and proves no accessible residue remains.

Use migrations/RPCs and documented application boundaries. Do not hide a
manually copied table list in UI code.

**Acceptance**

- Export completes before deletion and contains expected user categories.
- The full fixture deletion test passes.
- The deleted account cannot authenticate or reuse integration credentials.
- Repeating deletion is safe and cannot restore partial state.

Engineering verification does not replace professional GDPR or health-data
legal review.

### PR 7 — Backup restore and credential/session rotation verification

**Scope**

- Confirm the active Supabase database backup and PITR capabilities.
- Inventory recovery requirements for database schema/data, Storage,
  configuration, Edge Function secrets, cron, and external integrations.
- Restore into a scratch project using synthetic or approved non-production
  data.
- Verify schema, RLS, authentication, ingestion, dashboard, export, consent,
  and deletion after restore.
- Privately verify rotation/revocation of credentials and browser sessions that
  may have existed in removed historical profile material.
- Record credential name, status, date, and owner, never its value.

If the plan provides no adequate recovery path, external invitations remain
blocked until an acceptable backup/export strategy is selected and tested.

**Acceptance**

- A dated restore log contains no personal production data.
- The scratch environment passes required smoke checks.
- Rotation status is confirmed for every identified credential/session family.
- No secret or private recovery artifact is committed.

### PR 8 — Two critical Playwright journeys

Run both journeys against an isolated environment on mobile and desktop:

1. sign up -> grant AI consent when needed -> connect/import a health source ->
   dashboard renders meaningful imported state;
2. export -> delete account -> authentication and protected data access are no
   longer possible.

Use deterministic fixtures or controlled provider substitutes. CI must not
depend on personal health data or an uncontrolled external account.

**Acceptance**

- Both journeys pass on mobile and desktop in CI.
- Onboarding reaches a meaningful product state, not an empty dashboard.
- Deletion proves backend state removal, not only UI navigation.
- AI processing never occurs before durable consent in the tested journey.
- Failures preserve sanitized release/request diagnostics.

## 5. Dependency order

```text
PR 0: emergency fix -> deploy -> black-box verify
  |
  +--> PR 1: governance + reproducible deployment evidence
  |
  +--> PR 2: generated inventory + read-only security matrix
          |
          +--> PR 3: internal auth + CORS/rate limits
          +--> PR 4: durable AI consent
          +--> PR 5: error tracking + alert
          +--> PR 6: account deletion
          +--> PR 7: restore + rotation verification
                       |
                       +--> PR 8: critical journeys
```

PRs 3–7 may be developed independently after PR 2 stabilizes the inventories.
PR 8 begins only when consent, deletion, and the isolated test environment are
available. External invitations begin only after PR 0–8 are deployed and
verified.

## 6. Five-user validation

After the release gate passes:

1. Invite five people from the intended user group.
2. Observe onboarding without step-by-step assistance.
3. Record where users stop, misunderstand the product, or cannot recover.
4. Collect only consented, non-sensitive feedback; never copy personal health
   payloads into issue trackers.
5. Classify findings as safety blocker, onboarding blocker, missing value, or
   preference.
6. Fix safety/onboarding blockers before wider invitations.
7. Reprioritize the parent roadmap using observed evidence.

The Phase 0 definition of done ends at permission to start this exercise. The
beta-validation milestone is complete only after all five participants can
reach a meaningful dashboard, understand product limitations, and find account
export/deletion without developer intervention. Product desirability is a
separate outcome.

## 7. Deferred until evidence activates it

| Deferred item | Activation trigger |
|---|---|
| Formal availability/error-rate SLOs and dashboards | Paying users, an external promise, or enough traffic to measure them |
| Full incident roles, communication matrix, and postmortems | A second maintainer, partner requirement, or material incident |
| Second-person restore drill | A co-maintainer becomes available; the owner still performs and records the Phase 0 restore |
| Broad frontend/CSS/library decomposition | A concrete change is materially slowed by the boundary |
| Telegram/reminder/health-context decomposition beyond security | Reliability or product work requires those boundaries |
| Full documentation taxonomy and archive cleanup | Active guidance becomes ambiguous or a second engineer joins |
| Extracting `claude-monitor` | Before accepting external contributions, or earlier if inventory finds coupling |
| Additional critical journeys | Beta evidence or a larger user base identifies them |

Security defects, privacy failures, missing recovery, and active abuse are never
deferred because the user count is small.

## 8. Verification contract

Every PR runs focused tests and all affected repository gates. The complete
Phase 0 gate is:

```bash
npm test
npm run build
npm run lint:ceiling
npm run check:functions
npm run test:scripts
npm run test:readme
npm run test:e2e
```

Additional evidence:

- PR 0: deployed version plus denied and legitimate black-box calls;
- PR 1: effective ruleset, disposable failing PR, and deployment receipt;
- PR 2: isolated-project negative authorization matrix;
- PR 3: internal-secret migration, CORS, and rate-limit integration tests;
- PR 4: provider-call spy proving zero egress without current consent;
- PR 5: received redacted event and active notification;
- PR 6: full-user deletion fixture and revoked-token test;
- PR 7: dated scratch restore and private rotation checklist;
- PR 8: mobile and desktop Playwright artifacts.

Ratchets may only move down. No PR may raise a lint, Deno, security, or test
baseline to pass.

## 9. Rollout and rollback rules

- Deploy security boundary changes from callees to callers, verifying each
  intermediate state.
- Additive migrations precede code that depends on them.
- Destructive cleanup follows successful read/write verification and backup.
- Consent defaults to denied; rollback may disable AI functionality but may not
  silently bypass consent.
- Failed observability integration is disabled rather than sending unredacted
  events.
- Rollback never restores partial credential validation, permissive user-data
  access, or an exposed credential.
- Every deployment receipt identifies the safe previous version or an explicit
  forward-fix procedure.

## 10. Phase 0 definition of done

- [x] PR 0 is deployed and the vulnerable authorization path is rejected.
- [ ] `main` is protected and stable checks block merge.
- [ ] Scanning and dependency security controls are active where supported.
- [ ] Deployment evidence ties Edge Function changes to reviewed commits.
- [ ] The authorization matrix covers every classified data surface.
- [ ] Internal calls use a dedicated secret and minimum abuse controls pass.
- [ ] Every Gemini egress is protected by durable, revocable server-side
  consent.
- [ ] No critical/high security or privacy finding remains open.
- [ ] Production errors are redacted, release-linked, and actively notified.
- [ ] Account export/deletion pass their integration contract.
- [ ] One scratch restore succeeds and historical rotation status is confirmed.
- [ ] Both critical journeys pass on mobile and desktop.
- [ ] No external invitation is sent before every item above is verified.

Completion of this checklist permits the five-user beta. It does not claim that
the five-user validation has already succeeded.

## 11. Relationship to the parent program

```text
Phase 0: protect first users
  -> five-user validation
  -> evidence-based product fixes
  -> selected senior-readiness roadmap items
```

The parent specification remains the source for long-term observability,
reliability, architecture, release governance, data lifecycle, and
supportability. No additional umbrella design should be created; implementation
continues through focused plans for PR 0–8.
