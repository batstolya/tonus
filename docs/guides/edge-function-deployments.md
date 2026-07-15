# Edge Function Deployment Guide

Supabase Edge Functions are released separately from the frontend. Production
deployments are manual, use an exact reviewed commit, and must leave a
sanitized receipt. The Vercel workflow never deploys Edge Functions.

This is the canonical deployment procedure. Historical migration comments,
old specifications, and raw `supabase functions deploy` examples are context,
not release instructions.

## Safety invariants

- Deploy from a clean checkout of the exact reviewed SHA.
- Name every target explicitly. Deploy-all and parallel deployment are not
  allowed.
- Use the checked-in JWT mode for every function and verify the live mode after
  deployment.
- Use the repository wrapper, which pins Supabase CLI `2.109.1`; do not add
  `--no-verify-jwt`, `--prune`, or `--jobs` manually.
- Stop after the first failed deploy or metadata check.
- Run a change-specific production smoke check before marking a deployment
  complete.
- Reserve and atomically update a local receipt before any Supabase request.
- Deploy from an immutable archive materialized from the reviewed Git object,
  never from mutable worktree bytes.
- Recursively validate every literal module import reachable from each selected
  `index.ts`; npm specifiers must use exact versions, and remote modules must use
  an allowlisted host plus an exact semantic version or immutable GitHub
  commit. Resolve the selected entrypoints against the checked-in `deno.lock`
  with Deno's frozen mode before any Supabase request. A lockfile that was not
  validated against the complete transitive graph is not deployment proof.
- Reject non-literal dynamic imports, custom entrypoints, Deno/import-map
  manifests, and package manifests until the wrapper has reviewed resolver
  support and adversarial tests for them.
- Never put production Supabase credentials in GitHub Actions for this manual
  workflow.
- Never retain credentials, authorization headers, response bodies, real user
  identifiers, or health data in a receipt, terminal transcript, PR, or issue.

`supabase/config.toml` is a complete manifest: every local function has one
explicit `verify_jwt` value. The wrapper refuses missing, duplicate, or stale
entries. A successful CLI exit is not sufficient. For an existing function the
wrapper requires exactly one new version, a well-formed live bundle hash, the
declared JWT mode, a stable post-deploy metadata tuple, and a byte-for-byte
match between downloaded live source and source blobs in the reviewed commit.

Supabase does not expose the reviewed Git commit in live function metadata,
and remote URL imports can affect server-side bundling. The receipt therefore
proves the exact reviewed source upload plus a stable observed bundle hash; it
does not claim a cryptographic Git-commit-to-ESZip mapping that the platform
does not expose.

## 1. Define the reviewed release

Before deployment, record in the pull request or private change record:

- the reviewed commit SHA and tree;
- the exact function list;
- why each function is included;
- the reviewer and verification commands;
- the function-specific smoke plan;
- an explicit forward-fix record ID containing the recovery owner and steps;
- whether a target is a reviewed first deployment or an intentional
  source-identical policy-only redeploy.

When a changed `_shared` module has importers, include every affected importer.
Find them from the reviewed checkout instead of trusting a hand-maintained
list:

```bash
rg -l "_shared/<module>" supabase/functions --glob 'index.ts'
```

The only emergency exception is a dependency-specifier or type-only import
change with no executable shared-module behavior change. A partial security
release may then name only the vulnerable functions when the selected graphs
pass the frozen-lock preflight, the exact shared diff and excluded importers
are recorded in the release review, and a separate full importer rollout is
already tracked. This exception never applies to constants, queries, branches,
error handling, or any other runtime logic.

A normal product deployment should follow merge. A reviewed security fix may
be deployed before merge only when its private release record, rollback or
forward-fix decision, and production verification are explicit.

## 2. Run the complete local gate

Use Node 24 and Deno 2, then run the checks required by the change. The full
pre-release gate is:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.deno/bin:$PATH"

npm ci
npm test
npm run test:scripts
npm run test:readme
npm run lint:ceiling
npm run lint:diff -- <merge-base>
npm run check:functions
npm run check:edge-lock
npm run gen:types:check
VITE_SUPABASE_URL=http://localhost:54321 \
  VITE_SUPABASE_ANON_KEY=test-anon-key \
  npm run build
npm run test:e2e
git diff --check <merge-base>...HEAD
```

Resolve every failure before deployment. Existing ratchet debt may remain at
its recorded ceiling; new errors may not be added.

## 3. Create a clean reviewed checkout

Do not deploy from the implementation worktree. Create a temporary worktree or
detached clone at the reviewed SHA, then prove it is exact and clean:

```bash
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
git status --porcelain=v1 --untracked-files=all
```

The status output must be empty. Ignored files under `supabase/functions/` are
also rejected. Receipt files belong under the ignored
`.superpowers/deployments/` directory or outside the repository. An external
receipt parent directory must already exist.

## 4. Run a network-free preflight

The same production command supports `--dry-run`. It validates the checkout,
project, full function manifest, target list, tracked Deno lockfile, complete
selected dependency graph in frozen mode, and receipt path without calling
Supabase:

```bash
npm run deploy:functions -- deploy \
  --project-ref mxnmubakfzqoosgsqmhh \
  --reviewed-sha <40-character-reviewed-SHA> \
  --operator <operator-ID> \
  --forward-fix-id <reviewed-recovery-record-ID> \
  --smoke-check-id <allowlisted-machine-smoke-ID> \
  --receipt .superpowers/deployments/<date>-<change>.json \
  --function <function-name> \
  --dry-run
```

Repeat `--function` in the required deployment order. Comma-separated names
are rejected. The wrapper builds an isolated `git archive` during this
preflight and deletes it afterward; no Supabase command runs in dry-run mode.
The smoke check ID is required before any production request and must be
allowlisted for the exact ordered target list, so a deployment cannot mutate
production first and choose its behavioral verification later.

Use `--allow-create <function-name>` only when live pre-deploy metadata is
expected to be absent and the first-deployment recovery is reviewed. Use
`--allow-unchanged-bundle <function-name>` only for a reviewed policy-only
change, such as changing `verify_jwt` while the function source is intentionally
unchanged. Both flags are explicit per target and are recorded in the receipt.

## 5. Deploy only the reviewed functions

After the preflight and reviewer approval, run the same command without
`--dry-run`:

```bash
npm run deploy:functions -- deploy \
  --project-ref mxnmubakfzqoosgsqmhh \
  --reviewed-sha <40-character-reviewed-SHA> \
  --operator <operator-ID> \
  --forward-fix-id <reviewed-recovery-record-ID> \
  --smoke-check-id <allowlisted-machine-smoke-ID> \
  --receipt .superpowers/deployments/<date>-<change>.json \
  --function <first-function> \
  --function <second-function>
```

Before its first Supabase read, the wrapper reserves a mode-`0600` receipt with
`status: "deployment_in_progress"`. It atomically persists the target's safe
pre-state, `deploying`, `deployed_unverified`, and verified transitions. A
crash, signal, or failed post-deploy query therefore leaves durable
`in_progress`, `failed`, or uncertain evidence instead of silently losing the
production mutation.

The wrapper deploys one function at a time from the immutable archive, checks
sanitized metadata before and after, downloads the live source for comparison
with reviewed Git blobs, and re-queries the exact version/hash/JWT tuple. It
stops on the first failure. A fully verified deployment transitions to
`status: "smoke_pending"`; that status is not a release success.

If a function or metadata check fails, do not continue with later functions.
Do not paste raw CLI output into a public record. Inspect the failure privately,
re-review any fix, and restart from a clean exact checkout.

## 6. Run an allowlisted production smoke check

Design the smoke before deployment. Use only synthetic fixtures and the
minimum necessary calls. Depending on the function, verify:

- missing, malformed, and inappropriate credentials are denied;
- an ordinary synthetic user remains scoped to itself;
- a trusted webhook, cron, or internal caller still passes its documented
  boundary;
- expected side effects occur once and unexpected side effects do not occur;
- synthetic records, users, tokens, and scheduled work are removed afterward;
- no real health data, credential value, response body, or personal identifier
  is retained.

Metadata-only checks are not a substitute for the behavioral smoke. The
canonical completion command executes checked-in, allowlisted machine smoke
code; it does not accept a human-supplied `passed` value. A new function family
requires its reviewed harness and tests before its receipt can become
`complete`.

The `chat-health-jwt-boundary` harness requires `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the operator's private
environment. It creates and signs in a synthetic user, proves missing and
malformed credentials are denied, and proves the signed production caller
header shape reaches the handler with an empty body. It also creates a second
synthetic owner and a chat session, then proves the signed attacker receives a
404 before budget, Gemini, or health-data access. An attacker-owned session with
oversized synthetic input must reach the handler's `413` safe stop, proving the
positive path without entering budget, health-data, message-write, tool, or
Gemini code. Both users and their cascading rows are deleted and verified
afterward. Credential values, response bodies, user IDs, session IDs, emails,
and fixture values are never written to the receipt.

The `telegram-chat-ownership` harness additionally requires the private
`TELEGRAM_WEBHOOK_SECRET`. It creates a victim session, stores that foreign ID
on an attacker-owned Telegram link, and sends a normal webhook update with an
impossible synthetic chat ID and oversized input. The function must replace the
foreign session with an attacker-owned session before reaching the same safe
stop, leave the victim session and message unchanged, and create no attacker
chat messages or AI usage. Cleanup verifies that both Auth users and all
related synthetic rows are absent. The harness never contacts a real Telegram
recipient and never retains the webhook secret or fixture identifiers.

## 7. Complete and attach the receipt

Run the allowlisted smoke action against the same receipt. The SHA and ordered
function list must match, and the wrapper re-queries every live artifact both
before and after the smoke:

```bash
npm run deploy:functions -- smoke \
  --receipt .superpowers/deployments/<date>-<change>.json \
  --reviewed-sha <40-character-reviewed-SHA> \
  --function <first-function> \
  --function <second-function> \
  --check-id <allowlisted-machine-smoke-ID>
```

A passing machine smoke whose check ID matches the one bound into the deploy
receipt, with unchanged live metadata, transitions the receipt to `complete`.
A failed or substituted smoke is durably recorded as `smoke_failed` together
with sanitized assertion IDs/statuses and the original forward-fix record; it
can never become complete through a self-asserted result.

Attach the sanitized completed receipt to the corresponding PR, release, or
private emergency change record. Do not commit the local receipt. A reviewer
must be able to map the reviewed SHA, function order, before/after metadata,
operator, timestamps, and smoke result without seeing credentials or data.

## Rollback and forward-fix policy

- Never roll back to a known authorization, privacy, or data-integrity defect.
- Prefer a reviewed forward fix when the deployed security boundary is safer
  than the previous version.
- If a workflow is broken by a security fix, disable that workflow while its
  caller is repaired; do not reopen the unsafe boundary.
- Redeploy an older version only when its exact source and security properties
  are known and the rollback has its own review and receipt.
- Database migrations and external side effects may make code-only rollback
  unsafe. Document those constraints before deploying.

## Stop conditions

Do not deploy, or stop immediately, when any of these is true:

- the checkout is dirty or `HEAD` differs from the reviewed SHA;
- a target is implicit, duplicated, unknown, or not represented in the JWT
  manifest;
- the project reference differs from the checked-in production project;
- a required local gate or review is missing;
- Supabase reports a non-`ACTIVE` function, unchanged version, or wrong JWT
  mode;
- an existing target skips more than one version, its bundle hash is malformed,
  or a source-identical bundle was not explicitly approved;
- downloaded live source differs from the reviewed Git blobs, or the live
  version/hash/JWT tuple changes during verification or smoke;
- a selected function or shared module uses a floating dependency or cannot be
  resolved from the checked-in lockfile in frozen mode;
- a selected module graph uses a non-literal import, bare alias, custom
  entrypoint, or unsupported dependency manifest;
- a smoke check cannot use synthetic data or cannot clean up safely;
- the receipt would contain a credential, response body, personal identifier,
  or health information;
- the safe rollback or forward-fix path is unknown for a high-risk change.
