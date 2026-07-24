# Mobile App (React Native) — Monorepo Architecture & Roadmap

**Date:** 2026-07-18 (revised 2026-07-25: shared-code boundary settled, mobile
v1 scope narrowed, mobile platform decisions recorded)
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
- **Shared-code boundary (added 2026-07-25):** `supabase/functions/_shared/`
  stays the home of dual-runtime pure logic; `packages/shared` is a thin
  client-facing facade over it. See "Shared code boundary" below — this was
  the one question the original draft left open, and Phase 4 would have hit
  it head-on.
- **Mobile v1 is sync + Today, not parity (added 2026-07-25).** Full feature
  parity is no longer an assumed goal; see "Mobile v1 scope".

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

## Shared code boundary (decided 2026-07-25)

The original draft said pure logic "moves to `packages/shared`" but never said
what happens to `supabase/functions/_shared/`, which already holds 30+ pure
modules and is declared the single source of the score formulas. That left
three competing homes for cross-client logic — `_shared/`, `apps/web/src/lib/`,
and the new `packages/shared` — and the first mobile screen that needs
`scores` would have had to pick one under pressure.

**The rule:** logic that runs in **both** an edge function and a client keeps
living in `supabase/functions/_shared/`. `packages/shared` is the client-facing
facade over it: a one-line re-export module per subject, which web and mobile
import as `@tonus/shared`. Logic that is client-only (no edge-function caller)
is born directly in `packages/shared`.

Why this way and not the reverse: moving the modules into `packages/shared` and
having Deno import upward is conceptually cleaner, but it depends on
`supabase functions deploy` bundling files outside `supabase/` — unverified,
and a wrong guess breaks every function deploy. Keeping `_shared` as the home
costs nothing at deploy time and can still be inverted later if that bundling
turns out to work.

Mechanics the mobile app must respect:

- `_shared` modules are Deno-flavored (explicit `.ts` import extensions), so
  `packages/shared/tsconfig.json` needs `allowImportingTsExtensions` — exactly
  what `apps/web/tsconfig.app.json` already does for
  `apps/web/src/lib/scores.ts`. The mobile `tsconfig` needs the same, because
  `expo/tsconfig.base` does not set it.
- Metro reaches files outside `apps/mobile` through `watchFolders = [repo
  root]`, which the Phase 2 config sets anyway.
- Clients import `@tonus/shared`, never a `../../../../supabase/...` path.
  The existing web facade at `apps/web/src/lib/scores.ts` migrates behind
  `@tonus/shared` when mobile needs scores (Phase 3/4), not before.

**Debt this exposes:** three web modules are hand-maintained copies of their
`_shared` twins and say so in their headers — `workoutPlan.ts`, `geoStorm.ts`,
`forecast.ts` ("ЗЕРКАЛО … менять синхронно"). They are drift bugs waiting to
happen regardless of mobile, and they are precisely the modules a Today screen
wants. Route them through the same facade in their own PR; do not let the
mobile work depend on that cleanup.

## Mobile v1 scope (decided 2026-07-25)

**v1 is auth + HealthKit sync + one Today screen.** Everything else stays on
web. The app's stated first value — replacing Health Auto Export — needs no
screens beyond sign-in and a sync status; full parity would mean rewriting 23
component directories (~11k lines, none of it reusable from react-dom) solo,
during which the mobile app trails every new web screen.

Parity is not cancelled, it is *unscheduled*: the question reopens once
HealthKit sync has proven itself in real use, with evidence about how much the
phone actually gets used for reading rather than syncing.

## Mobile platform decisions (recorded 2026-07-25)

Consequences of Phase 0b's design that were implied but never written down,
plus the plumbing no phase had claimed:

- **Storage is MMKV, and that forecloses Expo Go.** `KeyValueStorage` in
  `platform.ts` is synchronous (`get(key): string | null`); AsyncStorage cannot
  satisfy it, so mobile wires `react-native-mmkv` — a native module. This is
  consistent with the dev-client decision, and it is now a constraint, not a
  preference.
- **Supabase session on RN** needs `detectSessionInUrl: false`, MMKV (or
  SecureStore for the token) as the auth storage, and `autoRefreshToken` tied
  to `AppState` — without the AppState wiring the token silently goes stale
  while the app is backgrounded. The Phase 0b factory already accepts these
  options; the mobile entry point supplies them.
- **Auth deep links.** Password reset and Google sign-in rely on browser
  redirects on web. Mobile needs a URL scheme in `app.json` plus `Linking`
  handling. This lands with the auth phase, not with HealthKit.
- **Env on mobile** comes from `EXPO_PUBLIC_*` variables inlined at bundle
  time (there is no `.env` in the repo; web reads its keys from Vercel). The
  mobile entry populates the Phase 0a `env` module from them.
- **Testing:** mobile logic is tested where it lives — `packages/shared` and
  `_shared` under vitest, as today. RN component tests are deferred; do not
  bolt a second component-test stack onto the repo for v1.

## Phases

Each phase is its own spec → plan → PR cycle and ends with green main and a
working production deploy. Phases 2–4 are roadmap entries here and get their
own specs later (each still has open questions to brainstorm first).

Delegable child specs (each is self-contained, with dependencies stated):

- `2026-07-19-mobile-phase0a-env-module-design.md` — env module (no deps)
- `2026-07-19-mobile-phase0b-storage-adapter-design.md` — storage adapter +
  supabase factory (after 0a)
- `2026-07-19-mobile-phase1-workspaces-design.md` — workspace skeleton
  (after 0a+0b)

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

### Phase 2 — Expo skeleton (specced)

Narrowed on 2026-07-24 to a bare scaffold — see
`2026-07-24-mobile-phase2-expo-skeleton-design.md`. One placeholder screen
rendering a value from `@tonus/shared`, proving the workspace → Metro →
TypeScript chain in the iOS Simulator. Auth, tabs, i18n and demo mode moved
out of this phase; CI gets typecheck + lint + a Metro export smoke instead of
the path-filtered mobile jobs sketched here (a scaffold does not justify the
yml complexity).

### Phase 2b — Auth (roadmap)

Supabase sign-in on RN: the session/`AppState`/MMKV wiring and the deep-link
scheme from "Mobile platform decisions", plus demo mode on fixtures as a
backend-free workbench. This is the first phase that needs
`EXPO_PUBLIC_SUPABASE_*` on the device.

### Phase 3 — HealthKit sync (roadmap)

Read HealthKit metrics matching the current HAE payload, map to the
`ingest-health` format, sync on open + background delivery. HAE runs in
parallel until reliability is confirmed. This is the app's reason to exist;
it needs no screens beyond a status view.

### Phase 4 — Today screen (roadmap, ends v1)

One dashboard screen on RN primitives, reading scores through `@tonus/shared`
(which is where the `_shared` facade work lands). Shipping this closes mobile
v1 as scoped above.

### Beyond v1 — parity, if it earns it (roadmap)

Streak → charts → experiments → AI chat → settings, one or two screens per PR,
each screen's logic moving behind `@tonus/shared` exactly when mobile needs
it. Deliberately unscheduled: revisit after HealthKit sync has run in real use
(see "Mobile v1 scope").

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
