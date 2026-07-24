# Mobile Phase 2 — Expo Skeleton (bare scaffold)

**Date:** 2026-07-24 (revised 2026-07-25 after re-verification against the repo,
the npm registry and the Vercel build logs — see "Verified facts")
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
- **Target: iOS Simulator.** No signing or provisioning needed. Running on the
  physical iPhone via Xcode free provisioning is a separate manual step later.
  See "Toolchain precondition" — full Xcode is **not** installed on the dev
  machine today, which changes what this PR can prove and when.
- **Runtime: dev-client / `expo run:ios`,** not Expo Go. Matches the parent
  design (managed workflow + `expo-dev-client`) and exercises the native
  prebuild/Xcode pipeline early — the same pipeline the HealthKit config
  plugin will need in Phase 3.
- **Managed workflow with CNG:** the native `ios/` project is generated on
  demand and gitignored, not committed; `app.json` is the source of truth.
- **Shared smoke import: yes.** The placeholder screen renders a value
  exported by `@tonus/shared`, proving runtime (not just type-level)
  resolution of the workspace package under Metro.
- **CI: typecheck + lint + a Metro export smoke** as cheap steps in the
  existing `ci` job. No native build in CI.

## Target structure

```
apps/mobile/
├── app.json                # Expo config: name, slug, ios.bundleIdentifier
├── package.json            # name "tonus-mobile"; NO "type": "module" (see gotcha)
├── tsconfig.json           # extends expo/tsconfig.base; strict
├── metro.config.js         # getDefaultConfig + monorepo watchFolders/nodeModulesPaths
├── eslint.config.js        # eslint-config-expo (flat)
├── .gitignore              # from the template: .expo/, ios/, android/, dist/
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
The template's own `apps/mobile/.gitignore` already covers `ios/`, `android/`,
`.expo/` and `dist/` — verify it does and extend it there rather than at the
repo root (keeps the app self-contained).

`expo-dev-client` is installed now, not later: adding it after the fact forces
another prebuild + pod install, and Phase 3 (HealthKit config plugin) needs it
anyway. `expo run:ios` itself works without it.

## Verified facts (checked 2026-07-25)

Everything below was confirmed against the live npm registry and this repo, so
the plan can pin versions without guessing:

| Fact | Value |
| --- | --- |
| `expo` latest / `sdk-57` dist-tag | `57.0.8` |
| `expo-template-blank-typescript@57.0.10` deps | `expo ~57.0.8`, `react 19.2.3`, `react-native 0.86.0`, `expo-status-bar ~57.0.1` |
| …its devDeps | `typescript ~6.0.3`, `@types/react ~19.2.2` |
| `react-native@0.86.0` peer | `react ^19.2.3`, `@types/react ^19.1.1` |
| `expo-dev-client` latest | `57.0.9` |
| `eslint-config-expo` latest | `57.0.0`, peer `eslint >=8.10` |
| repo eslint (hoisted) | `10.5.0` — inside the open-ended peer range, no ERESOLVE |
| web react / TS / @types/react | `^19.2.6` / `~6.0.2` / `^19.2.14` |

Consequences:

- **React stays single-hoisted.** Web's `^19.2.6` satisfies RN 0.86's
  `react ^19.2.3`, so `apps/mobile` declares `react: ^19.2.6` and npm hoists
  one copy for the whole workspace. No nohoist tricks.
- **TypeScript stays single-hoisted.** `~6.0.2` (root/web) allows 6.0.3, which
  is what the template wants; mobile declares the same `~6.0.2`.
- **`expo-doctor` will warn** that react/typescript deviate from the SDK's
  exact pins (19.2.3 / ~6.0.3). That warning is accepted deliberately — one
  hoisted copy of react across web and mobile is worth more than matching the
  SDK's pin to the patch. Do not "fix" it with `expo install --fix`.
- `eslint-config-expo` pulls its own `globals@^16` while the repo has `^17`;
  npm nests it, which is harmless.

## Shared smoke contract

`@tonus/shared` currently exports only DB types plus the generated
`Constants` object. Add one tiny pure module:

- `packages/shared/src/appMeta.ts` — exports `APP_NAME = 'Tonus'` (a plain
  string constant), re-exported from `index.ts`.
- `App.tsx` imports `APP_NAME` from `@tonus/shared` and renders it.
- `packages/shared/src/shared.test.ts` gains a one-line assertion for it, so
  the constant is covered by root `npm test` like `Constants` already is.

This establishes the pattern "shared owns cross-client constants" with the
smallest possible surface. Web is untouched (it may adopt `APP_NAME` later;
not part of this phase).

`APP_NAME` is client-only, so it is born directly in `packages/shared`. Logic
with an edge-function caller (scores, forecast, …) stays in
`supabase/functions/_shared/` and gets a re-export facade here instead — see
"Shared code boundary" in the parent design. Nothing in Phase 2 needs that
facade yet; the mobile `tsconfig` will need `allowImportingTsExtensions` when
the first one arrives.

## Integration points (where monorepo + Metro usually breaks)

- **Metro config:** extend `expo/metro-config`'s `getDefaultConfig` with
  `watchFolders = [repo root]` and `nodeModulesPaths` covering both
  `apps/mobile/node_modules` and the hoisted root `node_modules`. Recent
  Expo SDKs detect workspaces, but the config is explicit so behavior does
  not depend on detection heuristics.
- **`"type": "module"` gotcha:** the repo root, `tonus-web` and `@tonus/shared`
  all set `"type": "module"`. `apps/mobile/package.json` must **not** —
  `metro.config.js` and `babel.config.js` are CommonJS, and ESM mode breaks
  them. The template omits it; keep it omitted.
- **TypeScript source sharing:** `@tonus/shared` ships raw `.ts` (no build
  step) behind an `exports` map. Metro transpiles it via the workspace
  symlink; the mobile `tsconfig` resolves it through the same map. No `paths`
  aliases needed unless resolution fails in practice.
- **`expo-env.d.ts`:** generated, and gitignored by the template. If
  `tsc --noEmit` turns out to need it, either generate it before the typecheck
  step or un-ignore and commit it — decide in the plan when the failure (or
  its absence) is observable, not now.

## Repo tooling that must learn about the new workspace

The Phase 1 layout wired tooling to `apps/web` by name in two places. Both
need updating, otherwise mobile code is silently unlinted:

- **Root lint script.** `eslint.config.js` globally ignores `apps/**` (each app
  self-lints to avoid TSConfigRootDir conflicts), and root `lint` is
  `npm run -w tonus-web lint && eslint . --max-warnings 0`. Adding
  `apps/mobile/eslint.config.js` alone therefore lints **nothing** — the root
  script must gain `npm run -w tonus-mobile lint`, mirroring the web pattern.
  (This corrects the first draft of this spec, which claimed the root
  `eslint .` would pick mobile up.)
- **`scripts/lint-diff.mjs`.** Line 28 hardcodes
  `file.startsWith('apps/web/') ? 'apps/web' : '.'`, so changed files under
  `apps/mobile/` would be linted from the repo root, where they are ignored —
  the PR gate would pass on unlinted mobile code. Generalize it to derive the
  workspace directory from an `apps/<name>/` prefix. Extract that mapping into
  `scripts/lint-diff-lib.mjs` and cover it in
  `scripts/lint-diff-lib.test.mjs` (run by `npm run test:scripts` in CI),
  matching how the rest of that script's logic is tested.

Root `npm test` and the root vitest project need no change: the repo-meta
project already excludes `apps/**`, and Phase 2 ships no mobile tests.

## CI

Three cheap additions to the existing single `ci` job (ubuntu, Node 24 —
`npm ci` already installs `apps/mobile` as a workspace):

- `npm run -w tonus-mobile typecheck` → `tsc --noEmit`.
- Lint: covered once the root `lint` script delegates to the mobile workspace
  (see above).
- **Metro export smoke:** `npx expo export --platform ios` from `apps/mobile`.
  This is pure JS bundling — no Xcode, no macOS runner — and it is the only
  CI step that actually exercises the thing this phase de-risks: Metro
  resolving `@tonus/shared` through the workspace symlink. A typecheck alone
  would stay green while runtime resolution is broken. If the export turns out
  to be slow or flaky on the runner, drop it and keep typecheck + lint.

No native iOS build in CI: it needs macOS runners and buys nothing for a
scaffold. This deliberately deviates from the parent design's "mobile CI
jobs with path filters" sketch — path-filtered jobs make sense when mobile
CI is expensive (native builds, its own test suite); a typecheck plus a JS
bundle does not justify the yml complexity. Revisit when Phase 3 adds real
mobile code.

The `ios/` directory is excluded from lint/format tooling (generated code).

## Toolchain precondition (blocks simulator verification)

**Full Xcode is not installed on the dev machine.** `xcode-select -p` points at
`/Library/Developer/CommandLineTools`, there is no `/Applications/Xcode.app`,
and `xcrun simctl list devices` returns nothing. `expo run:ios` needs full
Xcode, an iOS platform/simulator runtime and CocoaPods, so today it cannot run
at all — this is a machine-state gap, not a design flaw, and it is the one
thing standing between this spec and its stated goal.

Two paths, and the plan must state which one it is executing under:

1. **User installs Xcode** (App Store, ~10–15 GB, plus
   `sudo xcode-select -s /Applications/Xcode.app` and one simulator runtime).
   Then Phase 2 delivers its full promise: build, launch, screenshot.
2. **Ship without the simulator run.** Everything except the native build is
   still verifiable: typecheck, lint, and `expo export --platform ios` proving
   Metro resolves the shared import. The simulator launch then becomes the
   first task of Phase 3, and this spec's headline claim ("runs in the iOS
   Simulator") is explicitly deferred rather than quietly assumed.

Path 1 is preferable — the whole point of Phase 2 is de-risking the native
pipeline before HealthKit depends on it — but it is the user's call, and it
requires their password, so it is not something the agent can do.

## Verification

- **Native (path 1 only):** `npx expo run:ios` from `apps/mobile` builds and
  launches in the iOS Simulator; screenshot shows the placeholder screen with
  the shared value.
- **No-Xcode equivalent (always):** `npx expo export --platform ios` succeeds
  and the emitted bundle contains the shared string — the runtime half of the
  monorepo chain, proven without native tooling.
- `npm run -w tonus-mobile typecheck` clean.
- Root `npm test`, `npm run lint`, `npm run build` stay green (web and
  shared unaffected; shared gains the trivial `appMeta` export and its test).
- `npm run test:scripts` green after the `lint-diff` change.
- CI green on the PR; the PR's Vercel **preview** deploy succeeds (branch
  previews are enabled; only `main` auto-deploy is off) — that preview is also
  where the install-cost risk below gets measured.

## Risks

- **Vercel installs mobile deps on every web deploy.** Confirmed from the
  latest production build log: with Root Directory `apps/web`, Vercel runs the
  install at the workspace root ("Installing dependencies… up to date"), so
  Expo + React Native land in every web build once `apps/mobile` exists. The
  build cache hides this on warm builds; a cold cache gets slower. If it
  regresses noticeably, pin an `installCommand` in `apps/web/vercel.json`:
  `npm ci -w tonus-web -w @tonus/shared --include-workspace-root` (npm 11
  supports `-w` with `ci`). Do not add it pre-emptively — measure on the PR
  preview first.
- **CI install grows** for the same reason; `actions/setup-node`'s npm cache
  absorbs most of it.
- **Hoisting surprises:** npm workspaces hoist RN/Expo packages to the root
  `node_modules`; Metro must find them there (covered by `nodeModulesPaths`).
  If a specific package misbehaves when hoisted, pin it in
  `apps/mobile/node_modules` via `overrides` as a targeted fix.
- **First-run prebuild cost:** with `ios/` gitignored, a fresh checkout's
  first `expo run:ios` runs prebuild + `pod install` before building (slower
  cold start). Accepted trade-off for declarative native config; the
  recovery path for a corrupted native dir is `expo prebuild --clean`.
- **Xcode/CocoaPods local state:** `expo run:ios` depends on the local Xcode
  toolchain; failures there block the native verification but not CI (CI has
  no native build).

## Out of scope

Auth, navigation/tabs, i18n extraction to shared, demo mode, HealthKit,
physical-device provisioning, push notifications, TestFlight, Android.
