# Mobile App (React Native) — Monorepo Architecture & Roadmap

**Date:** 2026-07-18
**Status:** Approved in discussion; this document is the written record.

## Goal

Add a native iOS app for Tonus. Long-term it reaches feature parity with the
web app; its first unique value is replacing Health Auto Export with native
HealthKit sync into the existing `ingest-health` edge function.

## Decisions (settled during brainstorming)

- **Same repository (monorepo).** One developer, one Supabase backend
  contract, and a large body of pure TS logic (scores facade, experiments,
  streak engine, i18n, generated DB types) that must stay identical across
  clients. A separate repo would recreate the formula-drift problem that the
  scores-mirror removal already fixed. If a dedicated mobile team ever
  appears, `apps/mobile` can be split out later via `git subtree split`.
- **npm workspaces, incremental migration (option B).** No pnpm, turborepo,
  or nx: build caching solves a problem this project does not have. The web
  app moves to `apps/web` as-is; shared code moves to `packages/shared`
  module by module, only when the mobile app actually needs it, behind
  re-export facades so web imports do not churn en masse.
- **Expo (current SDK), managed workflow + `expo-dev-client`.** HealthKit via
  a config plugin (library choice — `react-native-health` vs
  `@kingstinct/react-native-healthkit` — is a Phase 3 decision). Expo
  configures Metro for monorepos out of the box.
- **iOS first.** Android (Health Connect) is out of scope for now.
- **No paid Apple Developer account yet.** Local Xcode builds with a free
  personal team (7-day re-signing). HealthKit works on a free team; push
  notifications, TestFlight, and App Store distribution do not — they are
  deferred until the user buys the account.
- **Health sync model: background + on-open.** HealthKit background delivery
  as best-effort (iOS throttles it), plus a guaranteed full catch-up sync on
  every app open. Health Auto Export keeps running in parallel during the
  transition; `ingest-health` is idempotent, so duplicate deliveries are
  safe.
- **UI is not shared.** Web components depend on react-dom, recharts, and
  motion. Mobile screens are written on RN primitives (charts:
  victory-native / react-native-svg; animation: Reanimated). What is shared:
  pure logic, DB types, i18n, and the api layer. React hooks without DOM
  usage are shareable as-is.

## Target structure

```
tonus/
├── package.json          # root: workspaces, repo-level scripts
├── apps/
│   ├── web/              # the entire current Vite app (src, index.html, vite.config, vercel.json…)
│   └── mobile/           # Expo app (Phase 2)
├── packages/
│   └── shared/           # @tonus/shared: pure TS logic, no DOM
├── supabase/             # unchanged, does not move
├── scripts/, security/   # repo-level, stay at root
├── e2e/                  # stays at root (drives the web production build)
└── docs/                 # unchanged
```

## Phases

Each phase is its own spec → plan → PR cycle and ends with green main and a
working production deploy. Detailed specs exist only for Phases 0–1; Phases
2–4 are roadmap entries here and get their own specs later.

### Phase 0 — Portability prep (2 small PRs, current structure)

Audit result (2026-07-18): ~90% of `src/lib` is already platform-neutral and
proven DOM-free by the node vitest project. Real web coupling is narrow:

- **PR 0a — centralize env access.** Six files read `import.meta.env`
  directly (`supabase.ts`, `edgeFunctions.ts`, `chat.ts`, `demo.ts`,
  `autosync.ts`, `googleCalendar.ts`). Vite's `import.meta.env` does not
  exist under Metro (Expo uses `process.env.EXPO_PUBLIC_*`). Introduce a
  single config module (`env.ts`) holding the Supabase URL/key and other
  keys; each platform entry point populates it; all other logic reads only
  the module. After this PR, `import.meta` appears nowhere in `src/lib`
  except the config module's web wiring.
- **PR 0b — storage adapter + supabase factory.** Three files touch Web
  Storage: `demo.ts` (demo flag, localStorage), `privacy.ts` (PIN unlock,
  sessionStorage), `translate.ts` (language pref, localStorage +
  `navigator.language`). Introduce a minimal storage interface
  (get/set/remove); web provides localStorage/sessionStorage, mobile will
  provide AsyncStorage. Turn `src/lib/supabase.ts` into a factory that
  accepts storage/auth options, since supabase-js on RN requires
  AsyncStorage for session persistence anyway. Language detection gets a
  platform hook (web: `navigator.language`; mobile later:
  `expo-localization`).

Explicitly web-only modules that keep their browser APIs and simply stay in
`apps/web` (mobile builds its own equivalents when needed): `exportData.ts`
(DOM anchor download), `googleCalendar.ts` (GSI script injection),
`observability.ts` (window error handlers).

**Exit criteria:** no direct `import.meta.env` or Web Storage access in
shared-candidate lib modules; all tests green; zero behavior change on prod.

### Phase 1 — Workspaces skeleton

One PR (possibly two: "move" + "shared with types"). No mobile code yet.

- Enable npm workspaces at the root; move the web app into `apps/web` with
  `git mv` (preserves follow-history).
- Create `packages/shared` (`@tonus/shared`). Its first inhabitant is
  `database.types.ts`; `gen:types` starts writing there. This proves the
  workspace chain end to end without touching anything risky. Web imports it
  via a re-export facade in `apps/web/src/lib`.
- Vitest/eslint stay per-app configs inside `apps/web`; `packages/shared`
  gets its own tiny node vitest project.
- **CI:** existing jobs (tests, build, e2e, lint `--max-warnings 0`,
  deno-check, security inventory) get updated paths /
  `working-directory: apps/web`. Deno-check and edge-function deploys are
  untouched — `supabase/` does not move.
- **Vercel:** root directory → `apps/web` (dashboard setting; `vercel.json`
  moves with the app). Deploy hook and the "red CI = no deploy" rule are
  unchanged.

**Exit criteria:** CI fully green (tests, e2e, lint 0, deno-check 0); Vercel
production deployed from the new structure and functionally identical;
`gen:types` writes into shared and web imports types from there.

### Phase 2 — Mobile skeleton (roadmap)

Expo app in `apps/mobile`: Supabase auth, tab navigation, i18n from shared,
demo mode on fixtures as a backend-free workbench. Runs on the user's iPhone
via Xcode free provisioning. Mobile CI jobs appear with path filters
(`apps/mobile/**`, `packages/shared/**`) so web CI does not slow down.

### Phase 3 — HealthKit sync (roadmap)

Read HealthKit metrics matching the current HAE payload, map to the
`ingest-health` format, sync on open + background delivery. HAE runs in
parallel until reliability is confirmed.

### Phase 4+ — Screens to parity (roadmap)

One or two screens per PR: today/dashboard → streak → charts → experiments →
AI chat → settings. Each screen's logic moves into `packages/shared` exactly
when the mobile app needs it.

## Risks

- **Vercel root directory** is the riskiest single step: a wrong setting
  breaks the prod deploy. Mitigation: change the setting and merge the move
  in one sitting; the deploy hook allows manual retries.
- **Out-of-repo path references:** launchd backup jobs and `claude-monitor`
  may reference in-repo paths. Verify during Phase 1 planning that nothing
  depends on `src/` at the root; grep `scripts/` and workflows for stale
  paths.
- **Free-team signing:** the 7-day re-signing cycle is an accepted annoyance
  until the paid account exists.

## Out of scope

Android / Health Connect, push notifications, TestFlight / App Store
distribution, widgets, offline-first storage. Each returns as its own spec
when relevant.
