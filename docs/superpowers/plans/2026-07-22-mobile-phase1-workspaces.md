# Mobile Phase 1 — npm Workspaces Skeleton Implementation Plan

> **For agentic workers:** structural migration executed inline by the implementing agent.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the entire web app into `apps/web` (workspace `tonus-web`), seed
`packages/shared` (`@tonus/shared`) with `database.types.ts` behind a re-export
facade, and update all repo-level tooling / CI / e2e so prod stays deployable.

**Architecture:** npm workspaces (`apps/*`, `packages/*`). Web app is self-contained
in `apps/web` with its own vite/vitest/eslint/tsconfig. `packages/shared` is a
plain TS package consumed via the `@tonus/shared` exports map. Repo-level tooling
(`scripts/`, `security/`, `e2e/`, `tests/`, `playwright.config.ts`) stays at root
and runs from repo-root cwd. Root `package.json` delegates app scripts to the
workspace and keeps repo-level scripts.

**Tech Stack:** Node 24, npm workspaces, Vite 8, Vitest 3, ESLint 10 (flat, non-typed),
Playwright, Deno (edge check), Supabase CLI (gen:types).

---

## File Structure (decisions locked here)

New database.types path: `packages/shared/src/database.types.ts` (gen:types target).
Web facade kept at `apps/web/src/lib/database.types.ts` (re-exports `@tonus/shared/database.types`).

Moves into `apps/web/` (via `git mv`): `src/`, `index.html`, `public/`,
`vite.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `vitest.env-setup.ts`,
`eslint.config.js`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`,
`vercel.json`.

Stays at root: `scripts/`, `security/`, `supabase/`, `e2e/`,
`playwright.config.ts`, `tests/`, `docs/`, `claude-monitor/`, README, CI.

New root files: root `eslint.config.js` (lints `tests/`, `e2e/`, `packages/**`),
root `vitest.config.ts` (repo-meta `tests/**`), `packages/shared/{package.json,
tsconfig.json,vitest.config.ts,src/index.ts,src/shared.test.ts}`,
`apps/web/package.json` (`tonus-web`).

Out-of-repo audit (VERIFIED, no action): backup + healthcheck launchd plists point at
`/Users/anatolii/tonus/scripts/...` (scripts stays); healthcheck reads `claude-monitor/.env`
(stays); `claude-monitor/` has no `src/`/`dist/`/app refs.

---

## Task 1: Create workspace skeleton and move the web app

**Files:** create `apps/web/`, `packages/shared/`; `git mv` the web files; rewrite root `package.json`.

- [ ] Create `apps/web` and `packages/shared/src` dirs.
- [ ] `git mv` each web file/dir into `apps/web/` (preserves follow-history).
- [ ] `git mv apps/web/src/lib/database.types.ts packages/shared/src/database.types.ts`.
- [ ] Write `apps/web/package.json` = `tonus-web` with app deps/devDeps + `dev/build/lint/preview/test` scripts.
- [ ] Write facade `apps/web/src/lib/database.types.ts` re-exporting `@tonus/shared/database.types`.
- [ ] Write `packages/shared/package.json` (`@tonus/shared`, exports map, `test` script, vitest devDep).
- [ ] Write `packages/shared/src/index.ts`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`, `packages/shared/src/shared.test.ts`.
- [ ] Rewrite root `package.json`: add `workspaces`, delegate app scripts, keep repo scripts, add root devDeps, point `gen:types` at new path.
- [ ] Write root `eslint.config.js` (ignores `apps/**`,`dist`,`.claude`,`node_modules`,`claude-monitor`; lints tests/e2e/packages).
- [ ] Write root `vitest.config.ts` (node project, `include: ['tests/**/*.test.ts']`).

## Task 2: Repoint repo-level tooling paths

**Files:** scripts + tests + README.

- [ ] `scripts/check-db-types.mjs`: `COMMITTED` → `packages/shared/src/database.types.ts`.
- [ ] `scripts/generate-security-inventory.mjs`: read path → `packages/shared/src/database.types.ts`.
- [ ] `scripts/security-inventory-lib.mjs`: `sources[0]` → `packages/shared/src/database.types.ts`.
- [ ] `scripts/security/account-deletion-verify.mjs`: read path → `packages/shared/src/database.types.ts`.
- [ ] `scripts/components-db-guard.test.mjs`: grep target `src/components` → `apps/web/src/components`.
- [ ] `tests/observability-inventory.test.ts`: `src/lib/edgeFunctions.ts` → `apps/web/src/lib/edgeFunctions.ts`.
- [ ] `tests/vitest-discovery.test.ts`: `vitest.config.ts` → `apps/web/vitest.config.ts`.
- [ ] `README.md` + `README.uk.md`: repository-map link `](src/)` → `](apps/web/src/)`.

## Task 3: E2E + Vercel config

**Files:** `playwright.config.ts`, `apps/web/vercel.json`.

- [ ] `playwright.config.ts`: webServer command builds/serves `apps/web` (`npm run -w tonus-web build && npm run -w tonus-web preview -- --port 4173 --strictPort`).
- [ ] `apps/web/vercel.json` unchanged content (moved in Task 1).

## Task 4: Install + regenerate + verify

- [ ] `npm install` at root (creates workspace symlinks, updates lockfile).
- [ ] `npm run security:inventory:generate` (updates `security/inventory.generated.json` with new sources path) — only if reachable; else hand-edit the one string and verify with the check.
- [ ] Run exit-criteria commands, paste output.

## Task 5: CI workflow

**Files:** `.github/workflows/ci.yml`.

- [ ] Keep `npm ci` at root (installs all workspaces). Root `npm test`/`build`/`lint` already delegate, so most steps need no path change. Verify each step resolves from root. Add explicit notes where needed.

---

## Exit criteria (run all)
- `npm test`, `npm run build`, `npm run lint`, `npm run check:functions` green from root.
- `npm run test:scripts`, `npm run security:inventory:check`, `npm run test:readme` green.
- `gen:types` target is `packages/shared/src/database.types.ts`; web consumes via facade.
- `git log --follow --oneline apps/web/src/App.tsx` shows history.
- e2e config points at apps/web (run if feasible).
