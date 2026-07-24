# Mobile Phase 2 — Expo Skeleton (bare scaffold)

**Date:** 2026-07-24
**Status:** Approved in discussion; this document is the written record.
**Parent:** `2026-07-18-mobile-monorepo-design.md` (Phase 2 roadmap entry)
**Depends on:** Phases 0a (#130), 0b (#135), 1 (#136) — all merged and deployed.

## Goal

A bare Expo app in `apps/mobile` that builds and runs in the **iOS Simulator**
via `expo run:ios` (dev-client, native prebuild) and renders one value
imported from `@tonus/shared`. That import is the whole point: it proves the
monorepo chain end to end — npm workspace symlink → Metro resolution →
TypeScript source sharing — before any real mobile feature exists.

Deliberately descoped from the parent design's Phase 2 sketch (moved to later
phases): Supabase auth, tab navigation, i18n in shared, demo mode. This PR is
the smallest thing that de-risks the toolchain.

## Decisions (settled during brainstorming)

- **Scope: bare scaffold.** One placeholder screen, no auth, no tabs, no
  backend. Each later capability gets its own spec → plan → PR cycle.
- **Target: iOS Simulator.** Verifiable in this environment (build, launch,
  screenshot) with no signing or provisioning. Running on the physical
  iPhone via Xcode free provisioning is a separate manual step later.
- **Runtime: dev-client / `expo run:ios`,** not Expo Go. Matches the parent
  design (managed workflow + `expo-dev-client`) and exercises the native
  prebuild/Xcode pipeline early — the same pipeline the HealthKit config
  plugin will need in Phase 3.
- **Managed workflow with CNG:** the native `ios/` project is generated on
  demand and gitignored, not committed; `app.json` is the source of truth.
- **Shared smoke import: yes.** The placeholder screen renders a value
  exported by `@tonus/shared`, proving runtime (not just type-level)
  resolution of the workspace package under Metro.
- **CI: typecheck + lint now,** as cheap steps in the existing `ci` job.

## Target structure

```
apps/mobile/
├── app.json                # Expo config: name, slug, ios.bundleIdentifier
├── package.json            # name "tonus-mobile"; expo ~57, react-native 0.86, react ^19.2.6 (aligned with web)
├── tsconfig.json           # extends expo/tsconfig.base; strict
├── metro.config.js         # getDefaultConfig + monorepo watchFolders/nodeModulesPaths
├── eslint.config.js        # eslint-config-expo (flat) so root `eslint .` stays green
├── index.ts                # registerRootComponent(App)
└── App.tsx                 # single placeholder screen rendering the shared value
```

Scaffold from `create-expo-app --template blank-typescript` (Expo SDK 57).
No `expo-router` — navigation arrives with the first real screens.

**Native project (`ios/`) is not committed.** Managed workflow with
Continuous Native Generation: `app.json` (plus config plugins later) is the
source of truth, and `expo run:ios` / `expo prebuild` generate `ios/` on
demand into a gitignored directory. This matches the parent design's
"managed workflow + expo-dev-client" decision, keeps native config
declarative, and avoids the large committed folder drifting from `app.json`.
Add `apps/mobile/ios/` (and `android/`) to `.gitignore`.

## Shared smoke contract

`@tonus/shared` currently exports only DB types plus the generated
`Constants` object. Add one tiny pure module:

- `packages/shared/src/appMeta.ts` — exports `APP_NAME = 'Tonus'` (a plain
  string constant), re-exported from `index.ts`.
- `App.tsx` imports `APP_NAME` from `@tonus/shared` and renders it.

This establishes the pattern "shared owns cross-client constants" with the
smallest possible surface. Web is untouched (it may adopt `APP_NAME` later;
not part of this phase).

## Integration points (where monorepo + Metro usually breaks)

- **Metro config:** extend `expo/metro-config`'s `getDefaultConfig` with
  `watchFolders = [repo root]` and `nodeModulesPaths` covering both
  `apps/mobile/node_modules` and the hoisted root `node_modules`. Recent
  Expo SDKs detect workspaces, but the config is explicit so behavior does
  not depend on detection heuristics.
- **TypeScript source sharing:** `@tonus/shared` ships raw `.ts` (no build
  step). Metro transpiles it via the workspace symlink; the mobile
  `tsconfig` resolves it through the package `exports` map. No `paths`
  aliases needed unless resolution fails in practice.
- **React deduplication:** verified 2026-07-24 — Expo SDK 57's template pins
  react 19.2.3 / RN 0.86.0; web uses react ^19.2.6. Same 19.2.x minor, so
  the mobile `package.json` sets `react: ^19.2.6` and npm hoists a single
  react for the whole workspace. No nohoist tricks. (If a future SDK bump
  diverges majors, that bump's PR deals with it.)
- **TypeScript version:** template wants ~6.0.3, web has ~6.0.2 — compatible;
  mobile uses the same ~6.0.x range.

## CI

Two cheap additions to the existing single `ci` job (ubuntu, Node 24 —
`npm ci` already installs `apps/mobile` as a workspace):

- `npm run -w tonus-mobile typecheck` → `tsc --noEmit`.
- Lint: covered by the existing root `npm run lint` (`eslint .`
  `--max-warnings 0`) once `apps/mobile/eslint.config.js` is in place.

No native iOS build in CI: it needs macOS runners and buys nothing for a
scaffold. This deliberately deviates from the parent design's "mobile CI
jobs with path filters" sketch — path-filtered jobs make sense when mobile
CI is expensive (native builds, its own test suite); a typecheck does not
justify the yml complexity. Revisit when Phase 3 adds real mobile code.

The `ios/` directory is excluded from lint/format tooling (generated code).

## Verification

- `npx expo run:ios` from `apps/mobile` builds and launches in the iOS
  Simulator; screenshot shows the placeholder screen with the shared value.
- Root `npm test`, `npm run lint`, `npm run build` stay green (web and
  shared unaffected; shared gains the trivial `appMeta` export).
- CI green on the PR; Vercel production deploy unaffected (`apps/web` is not
  touched; the only shared change is the additive `appMeta` export).

## Risks

- **Hoisting surprises:** npm workspaces hoist RN/Expo packages to the root
  `node_modules`; Metro must find them there (covered by `nodeModulesPaths`).
  If a specific package misbehaves when hoisted, pin it in
  `apps/mobile/node_modules` via `overrides` as a targeted fix.
- **First-run prebuild cost:** with `ios/` gitignored, a fresh checkout's
  first `expo run:ios` runs prebuild + `pod install` before building (slower
  cold start). Accepted trade-off for declarative native config; the
  recovery path for a corrupted native dir is `expo prebuild --clean`.
- **Xcode/CocoaPods local state:** `expo run:ios` depends on the local Xcode
  toolchain; failures there block verification but not CI (CI has no native
  build).

## Out of scope

Auth, navigation/tabs, i18n extraction to shared, demo mode, HealthKit,
physical-device provisioning, push notifications, TestFlight, Android.
