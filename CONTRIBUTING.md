# Contributing to Tonus

Thank you for helping improve Tonus. Keep changes focused, explain the user or
engineering outcome, and never use real credentials or personal health data in
code, tests, fixtures, screenshots, logs, or pull requests. Report
vulnerabilities through [SECURITY.md](SECURITY.md), not a public issue.

## Local setup

Node.js 24 is required. Install the exact lockfile dependencies:

```bash
nvm use 24
npm ci
```

For local UI work, create a gitignored `.env.local` with non-production values:

```dotenv
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key
```

Run `npm run dev` and use the built-in demo when a live Supabase project is not
required.

## Required checks

Run the checks relevant to the change before opening a pull request. The GitHub
Actions `ci` job is the final merge gate.

```bash
npm test
npm run test:scripts
VITE_SUPABASE_URL=http://localhost:54321 \
  VITE_SUPABASE_ANON_KEY=test-anon-key \
  npm run build

npx playwright install --with-deps chromium  # first local run
npm run test:e2e

npm run lint:ceiling
npm run lint:diff
npm run check:functions
npm run gen:types:check
```

- `lint:ceiling` is a ratchet for existing ESLint debt; the ceiling may stay
  unchanged or decrease, but must not increase.
- `lint:diff` rejects new lint errors on changed lines and needs the target
  branch history to be available locally.
- `check:functions` is the equivalent Deno type-check ratchet for Edge
  Functions and requires Deno 2.
- `check:edge-lock` resolves every Edge Function entrypoint with a frozen
  `deno.lock`; direct and transitive dependency drift fails before deployment.
- `gen:types:check` verifies generated database types when Supabase credentials
  are available; without them it reports that the live drift check was skipped.
- Run `npm run test:readme` when changing either README or its media.

Do not replace `npm ci` with a lockfile-changing install unless dependency
changes are part of the pull request.

## Pull requests

- Branch from the current `main` and keep one concern per pull request.
- Write repository documentation, code comments, branch names, commits, and PR
  text in English.
- Describe what changed, why it changed, the checks run, and any production
  migration or deployment work still required.
- Add screenshots or recordings for visible UI changes, using synthetic data.
- Update tests with behavior changes and preserve existing security boundaries,
  Row Level Security assumptions, and authentication modes.

## Deployment boundaries

Opening a pull request does not authorize a production deployment. A named
operator performs any production release as a separate reviewed step with its
own verification evidence.

The frontend is released only after a merge or push to `main`: GitHub Actions
runs tests, scripts, the build, Playwright, and ratchet checks; the subsequent
`deploy` job triggers the Vercel production Deploy Hook. Vercel's direct Git
deployment is disabled, so a red CI run does not update production.

Supabase Edge Functions are not deployed by the frontend pipeline. They are
deployed separately and manually after review. An Edge Function PR must list
every affected function, including importers of changed `_shared` modules, and
must preserve the function's configured JWT verification mode. Follow the
[Edge Function deployment guide](docs/guides/edge-function-deployments.md) for
the exact preflight, deployment, smoke-test, and rollback procedure.
