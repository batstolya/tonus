# Repository Governance and Edge Function Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
> Implement production behavior test-first and stop at every deployment gate.

**Goal:** Complete PR 1 of the beta-safety program: protect `main`, enable the
supported GitHub security controls, and make every manual Supabase Edge
Function deployment reproducible, fail-closed, and attributable to a reviewed
commit.

**Source spec:**
`docs/superpowers/specs/2026-07-14-beta-safety-minimum-design.md`, PR 1.

**Branch strategy:** Implement as a stacked branch on the reviewed PR 0 head
until PR 0 is merged. The eventual PR 1 base is `main` after PR 0. Never merge
or deploy unreviewed PR 1 code merely to simplify the stack.

**Architecture:** `supabase/config.toml` is the complete checked-in JWT-mode
manifest for all Edge Functions. A small pure Node library validates the
manifest, CLI arguments, clean-review state, sanitized metadata, and receipt
state transitions. A thin CLI runs pinned Supabase commands sequentially,
verifies the live function after each deploy, and writes an ignored receipt
that remains incomplete until a change-specific smoke result is recorded.
GitHub governance is applied through repository settings, not production
credentials in CI.

**Verified baseline (2026-07-15):**

- `main` has no branch protection or ruleset.
- The stable PR status check is `ci`; `deploy` runs only after a push to
  `main` and must not be required on pull requests.
- Dependabot alerts/security updates, repository secret scanning, push
  protection, CodeQL default setup, and private vulnerability reporting are
  disabled or not configured.
- Production has 22 active Edge Functions. Twenty-one match the intended JWT
  mode. `chat-health` v39 is live with `verify_jwt=false` even though its
  intended mode is `true`.
- Supabase CLI deployment has already demonstrated that an omitted
  `verify_jwt=true` can preserve an older remote `false` value. Defaults are
  therefore not a deploy contract.

## Task 1 — Lock the deployment contracts with failing tests

**Files:**

- Create: `scripts/edge-function-deploy-lib.test.mjs`
- Create later: `scripts/edge-function-deploy-lib.mjs`

- [ ] Add tests that reject an empty target list, comma-separated deploy-all
  shorthand, unknown functions, duplicates, and stale config entries.
- [ ] Add a repository-inventory test proving every function directory except
  `_shared` has exactly one explicit boolean `verify_jwt` entry and every
  config entry has a matching directory.
- [ ] Add tests that reject a dirty checkout, a reviewed SHA different from
  `HEAD`, a project ref different from the checked-in project, and a receipt
  path that is not ignored or outside the repository.
- [ ] Add command-planning tests proving there is exactly one sequential
  deployment per named function, the CLI is pinned to `2.109.1`, and no
  operator-controlled `--prune`, `--jobs`, or JWT-mode override can enter the
  command.
- [ ] Add verification tests for non-`ACTIVE` status, unchanged version, or a
  live JWT-mode mismatch.
- [ ] Add stop-on-first-failure and dry-run tests proving a later deployment
  never starts and dry-run performs no network call.
- [ ] Add receipt allowlist/redaction tests with sentinel credentials, email,
  response body, and arbitrary CLI output.
- [ ] Add receipt state tests: deployment creates `smoke.status=pending`; only
  an exact-SHA, exact-function `complete` action with a passing result and a
  sanitized evidence summary may finalize it.
- [ ] Run the focused test and confirm it fails because the library does not
  yet exist.

## Task 2 — Make the JWT-mode manifest complete

**Files:**

- Modify: `supabase/config.toml`
- Implement: `scripts/edge-function-deploy-lib.mjs`

- [ ] Replace the stale default-based comment with an English invariant: all
  function modes are explicit and deployment must verify the remote value.
- [ ] Declare `verify_jwt=false` for the eleven custom-auth endpoints:
  `coach-profile`, `coach-weekly`, `fetch-environment`, `ingest-health`,
  `register-webhook`, `send-football-reminders`, `send-reminders`, `sync-cal`,
  `sync-football-fixtures`, `telegram-bot`, and `widget-data`.
- [ ] Declare `verify_jwt=true` for the eleven platform-auth endpoints:
  `analyze-health`, `biweekly-report`, `chat-health`, `classify-meal`,
  `deep-research`, `extract-lab`, `fetch-cal`, `fetch-ics`,
  `generate-recommendations`, `suggest-experiments`, and
  `supplement-schedule`.
- [ ] Implement only the pure parsing, validation, deploy-plan, metadata
  allowlist, and receipt-transition logic required by Task 1.
- [ ] Run the focused test until it passes.

## Task 3 — Add the fail-closed deployment CLI

**Files:**

- Create: `scripts/deploy-edge-functions.mjs`
- Modify: `package.json`

- [ ] Add `npm run deploy:functions` pointing to the thin CLI.
- [ ] Implement the `deploy` action with repeated `--function`, explicit
  `--project-ref`, exact `--reviewed-sha`, `--operator`, and an ignored
  `--receipt` path.
- [ ] Before any Supabase call, require a clean tracked and untracked checkout,
  exact `HEAD`/reviewed SHA equality, the expected tree, the checked-in project
  ref, a complete JWT manifest, and an explicit nonempty function list.
- [ ] Print only the exact SHA/tree and safe target summary.
- [ ] Run `npx --yes supabase@2.109.1 functions list` and one named deployment
  at a time. Never deploy all functions, use `--prune`, or run jobs in
  parallel.
- [ ] Read the mode from the checked-in manifest. The CLI interface must not
  accept an operator JWT-mode flag.
- [ ] After each deployment, allowlist only function name, status, version,
  `verify_jwt`, update time, and artifact hash; require `ACTIVE`, a higher
  version, and the exact expected mode. Stop after the first failure.
- [ ] Write an ignored sanitized JSON receipt with project ref, SHA/tree,
  operator, pinned CLI version, timestamps, target order, and pre/post
  metadata. Leave smoke pending.
- [ ] Implement the `complete` action. It must re-check SHA/function identity
  and accept only a passing, one-line, credential-free smoke summary before
  marking the receipt complete.
- [ ] Ensure interrupt/error paths preserve a failed or pending receipt and
  never print raw command output, environment variables, headers, response
  bodies, or identifiers.
- [ ] Run `npm run test:scripts`.

## Task 4 — Publish one canonical contributor and security workflow

**Files:**

- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `docs/guides/edge-function-deployments.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `.claude/skills/deploying-tonus/SKILL.md`
- Modify: `docs/guides/security-secrets-runbook.md`
- Modify: `.github/workflows/ci.yml`

- [ ] Document GitHub private vulnerability reporting as the preferred private
  channel; prohibit public issues containing credentials, health data, or
  exploit details.
- [ ] Keep `CONTRIBUTING.md` concise and map Node 24, install, Vitest,
  script tests, build, Playwright, ESLint/Deno ratchets, frontend release, and
  Edge Function release to their real commands.
- [ ] In the canonical deployment guide, document review, clean checkout,
  explicit targets, deploy receipt, live metadata verification, mandatory
  function-specific smoke, receipt completion, attachment to the PR/change
  record, stop conditions, and forward-fix/rollback rules.
- [ ] Replace every operational raw/multi-function deployment instruction with
  the wrapper. Keep explanatory historical text only where it cannot be
  mistaken for a command.
- [ ] Add README links to contributing, security, and deployment guidance.
- [ ] Add top-level `permissions: contents: read` to CI without renaming the
  required `ci` job.
- [ ] Ensure every newly committed line is English.

## Task 5 — Verify the branch before changing external settings

- [ ] Run Node 24 and Deno prerequisites.
- [ ] Run `node --test scripts/edge-function-deploy-lib.test.mjs`.
- [ ] Run `npm run test:scripts` sequentially.
- [ ] Run `npm test`.
- [ ] Run `npm run lint:ceiling`.
- [ ] Run `npm run lint:diff -- origin/main`.
- [ ] Run `npm run check:functions`.
- [ ] Run the production build with dummy public Supabase values.
- [ ] Run `npm run test:e2e`.
- [ ] Run `git diff --check` and a Cyrillic scan of newly added/touched lines.
- [ ] From a temporary detached clean checkout of the reviewed SHA, run the
  wrapper dry-run and all pre-network assertions.
- [ ] Request independent code review and resolve Critical/Important findings
  before any PR 1 production deployment.

## Task 6 — Enable and verify GitHub governance

**External settings; no repository file is the source of truth for this task.**

- [ ] Enable Dependabot alerts and security updates.
- [ ] Enable repository secret scanning and push protection.
- [ ] Enable CodeQL default setup for JavaScript/TypeScript. Leave its check
  advisory until one successful analysis establishes the exact check name.
- [ ] Enable private vulnerability reporting.
- [ ] Create an active `Protect main` ruleset targeting the default branch with
  deletion and non-fast-forward changes blocked, pull requests required,
  review threads resolved, zero approvals for the solo owner, strict/up-to-date
  `ci` required, and no permanent bypass actor.
- [ ] Do not require the post-merge `deploy` job.
- [ ] Verify settings through fresh GitHub API reads and the connected GitHub
  app where supported.
- [ ] Confirm a failing `ci` check makes a test PR unmergeable without merging
  the test.
- [ ] Use GitHub's safe dummy-secret exercise in a disposable change, confirm
  the change is blocked or detected, never bypass it, and leave no secret or
  disposable branch behind.
- [ ] After the first successful CodeQL cycle, add the observed CodeQL check to
  the ruleset in a separate reviewed settings update.

## Task 7 — Correct and verify the live `chat-health` drift

- [ ] Do not deploy from the dirty implementation worktree.
- [ ] After PR 1 code review, create a detached clean checkout of the exact
  reviewed SHA and run all wrapper preconditions.
- [ ] Deploy only `chat-health` through the wrapper.
- [ ] Require post-deploy live metadata: `ACTIVE`, version greater than 39, and
  `verify_jwt=true`.
- [ ] Run a synthetic black-box smoke: missing/malformed credentials are denied,
  a normal test user remains scoped to itself, and no real health data or
  response body is retained.
- [ ] Complete the sanitized receipt and attach it to the PR/change record.
- [ ] If the function breaks, do not restore a public gateway without review;
  inspect caller credentials and forward-fix or redeploy a previously secure
  reviewed version.

## Task 8 — Publish the stacked draft PR

- [ ] Commit only the PR 1 file set; keep the Phase 0 spec and this execution
  plan local until their publication is explicitly safe and intentional.
- [ ] Push the branch and open a draft PR targeting the PR 0 branch while PR 0
  remains unmerged; retarget to `main` after PR 0 merges.
- [ ] Include the exact verification evidence, GitHub-setting receipt, Supabase
  receipt, and the advisory CodeQL follow-up in the PR description.
- [ ] Do not merge PR 0 or PR 1 without owner review.

## Completion gate

PR 1 is complete only when the reviewed files are green, the live GitHub
settings match the required rules, the dummy-secret and failing-check tests
have evidence, `chat-health` is active with `verify_jwt=true`, and a sanitized
receipt ties its deployment and smoke to the exact reviewed commit. CodeQL may
remain advisory only until its first successful run identifies the stable check
name; that follow-up remains an explicit release gate.
