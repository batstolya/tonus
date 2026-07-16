# Service-Role Authorization Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the active service-to-service authorization bypass in production, prove that public and user credentials cannot select an arbitrary user, and publish the minimal reviewed fix only after the secure deployment is verified.

**Execution status:** Production deployment and synthetic black-box verification completed for reviewed SHA `a611fbe422fce2e33c499fa12f17acb2288d01b8`; draft PR #63 is open with green CI/Vercel and intentionally awaits owner review before merge.

**Architecture:** The three affected Edge Functions delegate internal-call authentication to one pure shared helper. That helper accepts only a syntactically valid Bearer credential and compares the complete credential through the existing fail-closed constant-time matcher; rejected credentials continue through ordinary Supabase user authentication and never receive the caller-controlled `x-user-id`. Deployment is performed from a clean detached worktree at the exact reviewed commit, followed by black-box checks using synthetic users and no real health data.

**Tech Stack:** TypeScript, Vitest, Deno, Supabase Edge Functions, Supabase CLI 2.109.1, Node.js 24.16.0, curl, Git, GitHub pull requests.

## Global Constraints

- This plan implements only PR 0 of `docs/superpowers/specs/2026-07-14-beta-safety-minimum-design.md`; do not add product behavior, migrations, dedicated internal secrets, CORS changes, rate limits, or unrelated refactors.
- Do not publish a commit, branch, issue, pull request, deployment receipt, or public prose describing the vulnerable authorization path before the production deployment and denied black-box checks succeed.
- All new repository content, code comments, commit messages, PR text, and documentation must be English.
- Missing runtime configuration, missing credentials, malformed Authorization headers, public anon keys, and user access tokens must fail closed on the internal-call path.
- Ordinary authenticated user calls and the existing trusted callers in `telegram-bot` and `send-reminders` must keep working.
- Never print or persist the Supabase service-role key, anon key, user access tokens, passwords, Telegram identifiers, or response bodies containing user data.
- Use only synthetic production fixtures created for this verification; do not read, modify, log, or send real user health data.
- Ratchets may only move down. Do not raise `.lint-ceiling` or `.deno-check-ceiling`.
- Rollback must never restore partial token comparison. If a trusted caller fails, keep the secure callees deployed, disable that workflow if necessary, and forward-fix the caller.
- The current feature branch is `fix/service-role-auth-bypass`; never implement or commit this hotfix directly on `main`.

---

### Task 1: Isolate and harden the internal-call boundary

**Files:**
- Create: `supabase/functions/_shared/serviceRoleAuth.ts`
- Create: `supabase/functions/_shared/serviceRoleAuth.test.ts`
- Restore unchanged from `origin/main`: `supabase/functions/_shared/auth.ts`
- Restore unchanged from `origin/main`: `supabase/functions/_shared/auth.test.ts`
- Modify import only: `supabase/functions/coach-profile/index.ts:4`
- Modify import only: `supabase/functions/biweekly-report/index.ts:6`
- Modify import only: `supabase/functions/suggest-experiments/index.ts:4`
- Modify runtime-mode declarations only: `supabase/config.toml`
- Verify: `supabase/functions/telegram-bot/index.ts:118-127`
- Verify: `supabase/functions/telegram-bot/index.ts:644-653`
- Verify: `supabase/functions/send-reminders/index.ts:297-306`

**Interfaces:**
- Consumes: `secretMatches(provided: string | null | undefined, expected: string | null | undefined): boolean` from the unchanged `supabase/functions/_shared/auth.ts`.
- Produces: `isServiceRoleCall(req: Request, expected: string | undefined): boolean` from `serviceRoleAuth.ts`, which accepts exactly one Bearer token and returns `true` only for a full credential match.

- [ ] **Step 1: Create the isolated failing regression test first**

Create `supabase/functions/_shared/serviceRoleAuth.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isServiceRoleCall } from './serviceRoleAuth.ts'

const reqWith = (headers: Record<string, string>) =>
  new Request('https://x/', { method: 'POST', headers })

// Regression for the authorization bypass: prefix comparison accepted any
// Supabase JWT because the first 20 characters encode the shared HS256 header.
describe('isServiceRoleCall', () => {
  const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.SERVICE_SIGNATURE'
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.ANON_SIGNATURE'

  it('accepts our own service-role call', () => {
    expect(isServiceRoleCall(reqWith({ Authorization: `Bearer ${SERVICE_KEY}` }), SERVICE_KEY)).toBe(true)
  })

  it('accepts a case-insensitive Bearer scheme', () => {
    expect(isServiceRoleCall(reqWith({ Authorization: `bearer ${SERVICE_KEY}` }), SERVICE_KEY)).toBe(true)
  })

  it('rejects the public anon key, which shares the JWT header prefix', () => {
    expect(ANON_KEY.slice(0, 20)).toBe(SERVICE_KEY.slice(0, 20))
    expect(isServiceRoleCall(reqWith({ Authorization: `Bearer ${ANON_KEY}` }), SERVICE_KEY)).toBe(false)
  })

  it("rejects a user's access token", () => {
    const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIn0.USER_SIGNATURE'
    expect(isServiceRoleCall(reqWith({ Authorization: `Bearer ${userToken}` }), SERVICE_KEY)).toBe(false)
  })

  it('rejects malformed authorization headers', () => {
    expect(isServiceRoleCall(reqWith({ Authorization: SERVICE_KEY }), SERVICE_KEY)).toBe(false)
    expect(isServiceRoleCall(reqWith({ Authorization: `Basic ${SERVICE_KEY}` }), SERVICE_KEY)).toBe(false)
    expect(isServiceRoleCall(reqWith({ Authorization: `Bearer  ${SERVICE_KEY}` }), SERVICE_KEY)).toBe(false)
    expect(isServiceRoleCall(reqWith({ Authorization: `Bearer ${SERVICE_KEY} extra` }), SERVICE_KEY)).toBe(false)
  })

  it('fails closed when the service key is not configured', () => {
    expect(isServiceRoleCall(reqWith({ Authorization: 'Bearer whatever' }), '')).toBe(false)
    expect(isServiceRoleCall(reqWith({ Authorization: 'Bearer ' }), undefined)).toBe(false)
  })

  it('rejects a missing Authorization header', () => {
    expect(isServiceRoleCall(reqWith({}), SERVICE_KEY)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the new test and verify RED**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test -- supabase/functions/_shared/serviceRoleAuth.test.ts
```

Expected: the test file fails to resolve `./serviceRoleAuth.ts` because the isolated helper does not exist yet.

- [ ] **Step 3: Implement the minimal isolated helper**

Create `supabase/functions/_shared/serviceRoleAuth.ts`:

```ts
import { secretMatches } from './auth.ts'

// Trusted infrastructure calls authenticate with the service-role credential
// in Authorization plus the target user's x-user-id. Accept that user ID only
// after a complete, well-formed Bearer credential match.
export function isServiceRoleCall(req: Request, expected: string | undefined): boolean {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.get('Authorization') ?? '')
  return secretMatches(match?.[1], expected)
}
```

- [ ] **Step 4: Wire only the three affected callees and remove the intermediate shared-file edits**

Change the three imports to:

```ts
import { isServiceRoleCall } from '../_shared/serviceRoleAuth.ts'
```

Remove `isServiceRoleCall` and its added test block from `auth.ts` and `auth.test.ts`, leaving both files byte-identical to `origin/main`.

- [ ] **Step 5: Run focused and full tests**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test -- \
  supabase/functions/_shared/auth.test.ts \
  supabase/functions/_shared/serviceRoleAuth.test.ts
npm test
```

Expected: 15 focused tests pass across two files and the complete Vitest suite passes.

- [ ] **Step 6: Verify the exact blast radius and trusted callers**

Run:

```bash
git diff --exit-code origin/main...HEAD -- \
  supabase/functions/_shared/auth.ts \
  supabase/functions/_shared/auth.test.ts

rg -l "from '../_shared/serviceRoleAuth.ts'" supabase/functions/*/index.ts | sort

rg -n -U "Authorization.*Bearer.*SUPABASE_SERVICE_KEY[\\s\\S]{0,120}x-user-id" \
  supabase/functions/telegram-bot/index.ts \
  supabase/functions/send-reminders/index.ts

git diff --unified=0 origin/main...HEAD | rg '^\+.*[А-Яа-яЁё]'
```

Expected: the shared auth files have no branch diff; only the three target callees import `serviceRoleAuth.ts`; the three trusted call sites send `Bearer ${SUPABASE_SERVICE_KEY}` with `x-user-id`; the final command returns exit code 1 with no output because no added line contains Cyrillic.

- [ ] **Step 7: Commit the isolated boundary**

```bash
git add \
  supabase/functions/_shared/auth.ts \
  supabase/functions/_shared/auth.test.ts \
  supabase/functions/_shared/serviceRoleAuth.ts \
  supabase/functions/_shared/serviceRoleAuth.test.ts \
  supabase/functions/coach-profile/index.ts \
  supabase/functions/biweekly-report/index.ts \
  supabase/functions/suggest-experiments/index.ts
git commit -m "refactor(security): isolate service-role authentication"
```

Expected: one new commit on `fix/service-role-auth-bypass`; the untracked Phase 0 spec and this plan are not staged; the final diff contains two new shared files and three handler changes only.

- [x] **Step 8: Pin the two security-sensitive true JWT modes after the live drift gate**

The first `biweekly-report` deployment proved that an omitted config value can preserve the remote mode. Add explicit `verify_jwt = true` sections for `biweekly-report` and `suggest-experiments`, run the focused tests and changed-line gates, and commit:

```bash
git add supabase/config.toml
git commit -m "fix(security): pin edge JWT verification modes"
```

Expected: final reviewed SHA `a611fbe422fce2e33c499fa12f17acb2288d01b8`; the cumulative branch diff contains six files and no unrelated configuration change.

### Task 2: Prove the reviewed commit from a clean checkout

**Files:**
- Create locally but never commit: `.superpowers/deployments/2026-07-15-pr0-service-auth.md`
- Verify: `package.json`
- Verify: `.lint-ceiling`
- Verify: `.deno-check-ceiling`

**Interfaces:**
- Consumes: the exact feature-branch `HEAD` produced by Task 1.
- Produces: an independently reviewed Git SHA/tree, a clean detached deployment worktree, complete local gate evidence, and a private receipt shell with no credentials.

- [ ] **Step 1: Complete the exact-SHA security review before deployment**

Generate a whole-branch review package from `git merge-base origin/main HEAD` to `HEAD`. The reviewer must check the final six-file diff against PR 0 scope and acceptance, including exact full-token comparison, strict Bearer syntax, missing configuration, ordinary-JWT fallback, caller compatibility, isolated three-function blast radius, explicit runtime modes, English-only additions, test quality, and absence of unrelated behavior. Resolve every Critical or Important finding before continuing.

Record:

```bash
reviewed_sha="$(git rev-parse HEAD)"
reviewed_tree="$(git rev-parse HEAD^{tree})"
merge_base="$(git merge-base origin/main HEAD)"
printf 'reviewed_sha=%s\nreviewed_tree=%s\nmerge_base=%s\n' \
  "$reviewed_sha" "$reviewed_tree" "$merge_base"
```

Expected: the reviewer approves the exact `reviewed_sha`; any subsequent code/config change invalidates approval and restarts this step.

- [ ] **Step 2: Create the private receipt and capture non-secret release metadata**

Create `.superpowers/deployments/2026-07-15-pr0-service-auth.md` with this structure, substituting command outputs only where marked:

```markdown
# PR 0 deployment receipt

- Project ref: `mxnmubakfzqoosgsqmhh`
- Reviewed SHA: `<git rev-parse HEAD>`
- Reviewed tree: `<git rev-parse HEAD^{tree}>`
- Merge base: `<git merge-base origin/main HEAD>`
- Reviewer: `<review agent/task and verdict>`
- Branch: `fix/service-role-auth-bypass`
- Operator: `Anatolii / Codex`
- Supabase CLI: `2.109.1` invoked as `npx --yes supabase@2.109.1`
- Node: `v24.16.0`
- Deno: `<deno --version first line>`
- Deployment start (UTC): `<date -u +%Y-%m-%dT%H:%M:%SZ>`
- Functions: `coach-profile`, `biweekly-report`, `suggest-experiments`
- Clean-checkout assertions: pending
- Local gates by command/time/exit/count: pending
- Pre/post metadata per function (`version`, `status`, `verify_jwt`, `updated_at`, `ezbr_sha256`): pending
- Denied black-box matrix: pending
- Ordinary-user black-box matrix: pending
- Trusted-service black-box matrix: pending
- Caller-header evidence: pending
- Synthetic fixture cleanup: pending
- Secrets redacted: true
- Response bodies retained: false
- Safe previous version: none known
- Rollback eligible: false
- Recovery: keep secured callees deployed and forward-fix; never redeploy partial credential validation
```

Do not include any credential, user identifier, email, password, Telegram identifier, request body, or response body.

- [ ] **Step 3: Create a clean detached worktree at the reviewed SHA**

Run from `/Users/anatolii/tonus`:

```bash
reviewed_sha="$(git rev-parse HEAD)"
deploy_tree="/Users/anatolii/Documents/Codex/2026-07-14/new-chat/work/tonus-pr0-${reviewed_sha:0:12}"
mkdir -p "$(dirname "$deploy_tree")"
git worktree add --detach "$deploy_tree" "$reviewed_sha"
test -z "$(git -C "$deploy_tree" status --porcelain --untracked-files=all)"
test "$(git -C "$deploy_tree" rev-parse HEAD)" = "$reviewed_sha"
test "$(git -C "$deploy_tree" rev-parse HEAD^{tree})" = "$reviewed_tree"
```

Expected: the worktree is detached at the exact SHA recorded in the receipt and `status --porcelain` is empty.

- [ ] **Step 4: Install from the lockfile in the clean worktree**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.deno/bin:$PATH"
npm ci
npx --yes supabase@2.109.1 --version
```

Expected: `npm ci` exits 0 without changing tracked files and the pinned CLI reports exactly `2.109.1`.

- [ ] **Step 5: Run the complete Phase 0 repository gate**

Run each command separately from the clean worktree:

```bash
npm test
VITE_SUPABASE_URL=http://localhost:54321 \
  VITE_SUPABASE_ANON_KEY=test-anon-key \
  npm run build
npm run lint:ceiling
npm run check:functions
npm run test:scripts
npm run test:readme
npx playwright install chromium
npm run test:e2e
git diff --check "$merge_base"...HEAD
npm run lint:diff -- "$merge_base"
```

Expected: every command exits 0; Vitest reports the current complete passing count; lint and Deno error counts do not exceed their checked-in ceilings; Playwright passes on its configured projects. Record only command, timestamp, exit code, and non-sensitive pass counts in the private receipt.

- [ ] **Step 6: Reconfirm clean reviewed state and runtime secret names immediately before deployment**

```bash
test -z "$(git status --porcelain --untracked-files=all)"
test "$(git rev-parse HEAD)" = "$reviewed_sha"
test "$(git rev-parse HEAD^{tree})" = "$reviewed_tree"
npx --yes supabase@2.109.1 secrets list \
  --project-ref mxnmubakfzqoosgsqmhh --output json \
  | jq -e '([.[].name]) as $n |
      ($n | index("SUPABASE_URL") != null) and
      ($n | index("SUPABASE_SERVICE_ROLE_KEY") != null) and
      ($n | index("GEMINI_API_KEY") != null)'
```

Expected: clean checkout, identical SHA/tree, an authenticated pinned Supabase CLI session through the explicit project reference, and the required runtime secret names present. The command reveals names only, never values; the clean worktree intentionally has no ignored local link metadata.

### Task 3: Deploy the three secure Supabase Edge Functions

**Files:**
- Read from the clean worktree: `supabase/functions/_shared/serviceRoleAuth.ts`
- Deploy from the clean worktree: `supabase/functions/coach-profile/index.ts`
- Deploy from the clean worktree: `supabase/functions/biweekly-report/index.ts`
- Deploy from the clean worktree: `supabase/functions/suggest-experiments/index.ts`
- Update locally but never commit: `/Users/anatolii/tonus/.superpowers/deployments/2026-07-15-pr0-service-auth.md`

**Interfaces:**
- Consumes: the clean, fully verified SHA from Task 2 and the Supabase project `mxnmubakfzqoosgsqmhh`.
- Produces: three deployed function versions containing the same reviewed `serviceRoleAuth.ts`, plus sanitized deployed metadata and authentication-mode postconditions.

- [ ] **Step 1: Capture pre-deployment function metadata without secrets**

```bash
npx --yes supabase@2.109.1 functions list \
  --project-ref mxnmubakfzqoosgsqmhh --output json \
  | jq '[.[] | select(.name == "coach-profile" or .name == "biweekly-report" or .name == "suggest-experiments") | {name, version, status, verify_jwt, updated_at, ezbr_sha256}]'
```

Expected: metadata for exactly the three target functions. Copy only the selected non-secret fields to the private receipt. The audited baseline is coach-profile v10/`verify_jwt=false`, biweekly-report v32/`verify_jwt=false` (configuration drift), and suggest-experiments v10/`verify_jwt=true`.

- [ ] **Step 2: Deploy each affected callee from the clean reviewed worktree**

Run separately and stop on the first failure. After each command, capture that function's metadata and require a higher version, `ACTIVE` status, and the expected JWT mode before deploying the next function:

```bash
npx --yes supabase@2.109.1 functions deploy coach-profile \
  --project-ref mxnmubakfzqoosgsqmhh --no-verify-jwt

npx --yes supabase@2.109.1 functions deploy biweekly-report \
  --project-ref mxnmubakfzqoosgsqmhh

npx --yes supabase@2.109.1 functions deploy suggest-experiments \
  --project-ref mxnmubakfzqoosgsqmhh
```

Expected: each command exits 0. `coach-profile` remains `verify_jwt=false`; explicit config changes `biweekly-report` to `verify_jwt=true`; `suggest-experiments` remains `verify_jwt=true`. Never use multiple function names, `--jobs`, `--prune`, or `--no-verify-jwt` for the latter two functions.

- [ ] **Step 3: Capture post-deployment metadata and tie it to the reviewed SHA**

Repeat the filtered `functions list` command from Step 1 and require:

```bash
npx --yes supabase@2.109.1 functions list \
  --project-ref mxnmubakfzqoosgsqmhh --output json \
  | jq -e '
      def f($n): map(select(.name == $n))[0];
      (f("coach-profile") | .status == "ACTIVE" and .verify_jwt == false and .version > 10) and
      (f("biweekly-report") | .status == "ACTIVE" and .verify_jwt == true and .version > 33) and
      (f("suggest-experiments") | .status == "ACTIVE" and .verify_jwt == true and .version > 10)'
```

Expected: the hard metadata gate returns `true`. Record the reviewed SHA/tree, command timestamps, per-function exit code, and filtered metadata in the receipt. Supabase does not embed the Git SHA, so the clean-checkout command log plus receipt is the binding evidence.

- [ ] **Step 4: If any deployment fails, preserve the secure intermediate state**

Do not redeploy an older vulnerable version. Record which functions succeeded, stop the affected internal workflow if it is broken, inspect the failed bundle/logs, fix forward on the feature branch with tests, produce a new reviewed SHA, and repeat Tasks 2–3 for the remaining functions.

### Task 4: Black-box verify production without real user data

**Files:**
- Create locally but never commit: `/Users/anatolii/tonus/.superpowers/deployments/pr0-smoke.mjs`
- Update locally but never commit: `/Users/anatolii/tonus/.superpowers/deployments/2026-07-15-pr0-service-auth.md`

**Interfaces:**
- Consumes: the deployed functions from Task 3, legacy anon/service credentials for synthetic Auth/REST setup, and the project's new default secret credential for the actual trusted-service boundary.
- Produces: denied-path evidence, deterministic ordinary-user isolation evidence, trusted-service compatibility evidence, and independently verified deletion of every synthetic fixture.

- [ ] **Step 1: Review and self-test the fail-closed smoke harness before loading credentials**

The ignored local Node harness must hard-code the reviewed SHA/tree and project URL/ref, require a clean detached checkout, accept only exact `--execute`, validate the legacy anon/service JWT claims and the new secret-key format without printing them, and emit only static error codes plus an allowlisted phase. It must refuse network execution by default. Run only the offline checks first:

```bash
node --check /Users/anatolii/tonus/.superpowers/deployments/pr0-smoke.mjs
node /Users/anatolii/tonus/.superpowers/deployments/pr0-smoke.mjs --self-test
```

Expected: syntax passes; the self-test records zero network calls, validates success/failure output redaction and JWT contracts, and proves that default execution is refused. An independent reviewer must approve the exact harness before `--execute` is used.

- [ ] **Step 2: Load API credentials into process-only environment variables without printing them**

Use `npx --yes supabase@2.109.1 projects api-keys --project-ref mxnmubakfzqoosgsqmhh --reveal --output json` only inside command substitution; never run it bare, never enable shell tracing, and never persist its output. Select legacy entries named exactly `anon` and `service_role` for synthetic Auth/REST setup, plus the `default` entry whose type is `secret` for the trusted-service probe. Export them only for the harness process and unset every credential plus the temporary JSON immediately after it exits. Also export the pinned `SUPABASE_URL` and `PR0_REVIEWED_SHA`.

- [ ] **Step 3: Execute the complete synthetic production matrix once**

Run the approved harness from the clean detached worktree:

```bash
node /Users/anatolii/tonus/.superpowers/deployments/pr0-smoke.mjs --execute
```

The harness must:

- Pre-register two random `@example.invalid` emails before either Admin Auth create request so ambiguous responses remain recoverable.
- Create fresh A/B `coach_profile` canaries and five B-only synthetic HRV rows; no real row is queried.
- Set B's AI budget to `$0.01` and insert a synthetic current-month usage row large enough to force status 402. This deterministic sentinel proves that a valid A token plus B's `x-user-id` still resolves to A: the redirected vulnerable path would return B's 402, while the correct A path returns the no-data 200 response.
- Require missing Authorization, the public anon JWT, and a service credential without the Bearer scheme to return 401 for all three functions.
- Require ordinary A-token calls with B's `x-user-id` to return A's coach canary/A's report owner and the A no-data suggestions response.
- Require exact trusted-service calls to return B's coach canary, B's deterministic budget 402, and successful synthetic report generation for A.
- Prove which non-public API-key class matches the Edge Runtime service credential without exposing either value; the final production run must record only the static class `secret`.
- Permit exactly two synthetic empty-data Gemini report requests and no Telegram send; response bodies are parsed only for boolean/ID assertions and never printed or retained.
- In `finally`, recover ambiguous Auth creates first by the known synthetic password and then by paginated exact-email Admin lookup. Delete direct table rows and Auth users, then prove absence by table queries, Auth ID lookup, exact email lookup, and failed credential grants.

Expected: one sanitized JSON summary with all 9 denied statuses at 401, all ordinary/trusted scope booleans true, deterministic service target sentinel 402, two synthetic users, two intentional synthetic Gemini calls, zero Telegram messages, and `cleanup_verified: true`. A failure prints only `smoke_failed`, an allowlisted phase, and cleanup booleans.

- [ ] **Step 4: Unset credentials and close the private receipt**

Capture the harness exit code before unsetting `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_URL`, `PR0_REVIEWED_SHA`, and the temporary API-key JSON. Record only the sanitized summary, UTC completion time, post-deployment metadata, and cleanup result in the private receipt. If cleanup is not verified, stop publication and use the synthetic-email recovery path until every fixture is absent.

### Task 5: Review and publish only after production is safe

**Files:**
- Review: all files in `git diff origin/main...HEAD`
- Keep untracked from PR 0: `docs/superpowers/specs/2026-07-14-beta-safety-minimum-design.md`
- Keep untracked from PR 0: `docs/superpowers/plans/2026-07-15-service-role-auth-bypass.md`
- Read for PR evidence only: `.superpowers/deployments/2026-07-15-pr0-service-auth.md`

**Interfaces:**
- Consumes: reviewed code, complete local gates, successful Supabase deployment, passing denied/legitimate smoke checks, and verified fixture cleanup.
- Produces: a public feature branch and focused GitHub pull request whose sanitized description links the reviewed SHA to deployment evidence.

- [ ] **Step 1: Run final verification from the exact branch HEAD**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.deno/bin:$PATH"
git status --short
git diff --check origin/main...HEAD
npm test -- \
  supabase/functions/_shared/auth.test.ts \
  supabase/functions/_shared/serviceRoleAuth.test.ts
npm run lint:diff
git diff --unified=0 origin/main...HEAD | rg '^\+.*[А-Яа-яЁё]'
```

Expected: only the local spec and plan are untracked; `diff --check`, focused tests, and diff lint pass; the Cyrillic scan returns no output.

- [ ] **Step 2: Perform a security-focused whole-branch review**

Review the complete diff against PR 0 acceptance, including malformed headers, missing configuration, exact comparison, fallback to user authentication, caller compatibility, no unrelated behavior, English-only additions, and production receipt. Resolve every Critical or Important finding with a tested forward fix and repeat Tasks 2–4 for a new SHA if code changes.

- [ ] **Step 3: Push the feature branch only now**

```bash
git push -u origin fix/service-role-auth-bypass
```

Expected: the public branch contains only the six implementation/test/config files in the approved cumulative diff; the local spec, plan, smoke harness, and private receipt are not pushed.

- [ ] **Step 4: Open a focused pull request**

Use an English title such as `fix(security): close service-role authorization bypass`. The description must summarize full fail-closed matching, list the three deployed functions, include the exact reviewed/deployed SHA, sanitized test counts, deployment time, denied/legitimate smoke results, fixture cleanup, and forward-fix rollback policy. Never include keys, tokens, synthetic identifiers, response bodies, exploit payloads, or private receipt paths.

- [ ] **Step 5: Merge only after GitHub checks and review are green**

Confirm required CI results against the PR HEAD. If the public PR changes code, do not merge it until the changed SHA is rerun through clean-checkout verification, Supabase deployment, and black-box checks. After merge, confirm `main` contains the deployed code and then start the separate PR 1 plan for repository governance and reproducible deployment evidence.

## Self-Review Record

- Spec coverage: PR 0 scope, acceptance, production-before-public rule, complete local verification, deployment evidence, trusted callers, missing/malformed credentials, English-only additions, and forward-fix rollback are each mapped to a task.
- Scope boundary: PR 1–8 work is intentionally excluded because each is an independent testable subsystem with its own plan.
- Placeholder scan: no TODO/TBD or unspecified implementation step remains; runtime evidence fields are explicitly populated from commands.
- Type consistency: the plan uses the existing `secretMatches` signature and preserves the existing `isServiceRoleCall(req, expected): boolean` interface at all three call sites.
- Security caveat: the `biweekly-report` ordinary-user end-to-end check would necessarily perform AI egress, so production smoke uses a synthetic trusted-service request with no health data and relies on the identical post-auth user object path plus review for ordinary-user scoping.
