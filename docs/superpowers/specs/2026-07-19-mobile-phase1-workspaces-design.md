# Phase 1 — npm Workspaces Skeleton (web → apps/web, packages/shared)

**Date:** 2026-07-19
**Parent:** `2026-07-18-mobile-monorepo-design.md` (mobile monorepo roadmap)
**Depends on:** Phase 0a and 0b merged. **Blocks:** Phase 2 (mobile skeleton).
**Size:** one PR, possibly split into "move" + "seed shared" — but the Vercel
root-directory switch must land in the same sitting as the move.

## Context (self-contained)

Tonus is currently a single-package React+Vite app at the repo root, with
Supabase migrations/functions in `supabase/` and repo-level tooling in
`scripts/`, `security/`, `e2e/`. A React Native (Expo) app will be added in
`apps/mobile` (Phase 2). This phase creates the workspace skeleton without
any mobile code and without any user-visible change.

Deploy topology (must keep working): push to `main` → GitHub Actions CI
(tests, build, e2e, lint `--max-warnings 0`, deno-check, security
inventory) → green CI triggers a Vercel deploy hook; Vercel auto-deploy is
OFF (`vercel.json`). Edge functions deploy separately via supabase CLI and
are NOT part of this phase.

## Target structure

```
tonus/
├── package.json          # root: "workspaces": ["apps/*", "packages/*"], repo-level scripts
├── apps/web/             # the entire current Vite app: src/, index.html, public/,
│                         # vite.config.ts, vitest.config.ts + vitest.setup.ts,
│                         # eslint.config.js, tsconfig*.json, vercel.json, package.json
├── packages/shared/      # @tonus/shared — first inhabitant: database.types.ts
├── supabase/             # unchanged
├── scripts/, security/   # stay at root (repo-level)
├── e2e/ + playwright.config.ts   # stay at root, drive the web build
└── docs/
```

## Requirements

1. **Move with `git mv`** (preserves follow-history). Web app becomes the
   `tonus-web` workspace in `apps/web`; root `package.json` keeps repo-level
   scripts (`check:functions`, `security:*`, `test:scripts`, `media:*`) and
   delegates app scripts (`npm run -w tonus-web dev/build/test/lint` or root
   aliases).
2. **`packages/shared`** (`@tonus/shared`): plain TS package, its own tiny
   node vitest project, first content is `database.types.ts` moved from
   `src/lib`. `gen:types` and `gen:types:check` (`scripts/check-db-types.mjs`)
   point at the new path. Web imports the types via a re-export facade at
   `apps/web/src/lib/database.types.ts` so existing imports do not churn.
3. **CI (`.github/workflows/`)**: jobs get `working-directory: apps/web` or
   updated paths; `npm ci` at root installs all workspaces. Deno-check and
   the security inventory keep working (verify their path assumptions in
   `scripts/*.mjs` — grep for hardcoded `src/`, `dist/`, `supabase/`).
4. **Vercel**: root directory → `apps/web` (dashboard setting — coordinate
   with the repo owner; `vercel.json` moves with the app). Deploy hook and
   "red CI = no deploy" rule unchanged.
5. **E2E**: playwright config stays at root; update its paths to build/serve
   `apps/web` (`webServer` command, `outputDir`).
6. **Out-of-repo references**: check that launchd backup jobs and
   `claude-monitor/` do not reference moved paths (they should only touch
   `supabase/` and the DB — verify, do not assume).

## Risks

- The Vercel root-directory switch is the riskiest step: do the dashboard
  change and the merge in one sitting; the deploy hook allows manual
  retries. Verify prod visually after deploy.
- Metro/Expo workspace quirks are NOT a concern yet (no mobile app).

## Non-goals

No mobile app, no Expo config, no moving of logic beyond
`database.types.ts`, no pnpm/turborepo, no CI path-filtering yet (comes with
Phase 2 when mobile jobs appear).

## Exit criteria

CI fully green (tests, e2e, lint 0, deno-check 0, security inventory);
Vercel production deployed from `apps/web` and functionally identical;
`gen:types` writes into `packages/shared` and the web build consumes types
from there; `git log --follow` still shows history for moved files.
