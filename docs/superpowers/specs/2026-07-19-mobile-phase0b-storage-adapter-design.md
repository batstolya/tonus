# Phase 0b — Storage Adapter and Supabase Client Factory

**Date:** 2026-07-19
**Parent:** `2026-07-18-mobile-monorepo-design.md` (mobile monorepo roadmap)
**Depends on:** Phase 0a (touches the same files: `demo.ts`, `supabase.ts`).
**Blocks:** Phase 1. **Size:** one small PR.

## Context (self-contained)

A React Native (Expo) iOS app will be added to this repo. RN has no
localStorage/sessionStorage/`navigator.language`. Three shared-candidate
modules in `src/lib` touch Web Storage:

- `src/lib/demo.ts` — demo-mode flag in `localStorage`
- `src/lib/privacy.ts` — PIN unlock flag in `sessionStorage`
  (unlock lives until the tab session ends)
- `src/lib/translate.ts` — language pref in `localStorage`, falls back to
  `navigator.language`; already guards for non-browser environments

`src/lib/supabase.ts` creates the client at module load with default auth
storage; supabase-js on RN needs explicit AsyncStorage-backed auth storage.

## Design decisions

1. **Synchronous key-value interface.** All current call sites are sync
   (`isDemoActive()`, privacy unlock checks, language detection at render
   time). Keep a sync interface `{ get(key), set(key, value), remove(key) }`.
   The mobile app will back it with `react-native-mmkv` (synchronous,
   Expo-dev-client compatible) — NOT AsyncStorage. This avoids an async
   refactor of every call site.
2. **Two scopes.** `persistentStorage` (web: localStorage) and
   `sessionStorage`-equivalent `ephemeralStorage` (web: sessionStorage;
   mobile later: in-memory object — "until app restart" replaces "until tab
   closes" for the PIN unlock, which is acceptable).
3. **Platform hooks module.** Alongside the env module from Phase 0a, expose
   `getDeviceLocale(): string` (web wiring: `navigator.language`; mobile
   later: `expo-localization`). `translate.ts` uses it instead of touching
   `navigator` directly.
4. **Supabase factory.** Replace the module-level singleton in
   `supabase.ts` with `createTonusClient(config)` accepting url/key (from
   the env module) and optional supabase auth options (auth storage,
   `detectSessionInUrl`, …). The web keeps a singleton with current
   behavior, constructed in web wiring; importing `supabase` from
   `src/lib/supabase.ts` must keep working for existing code (facade over
   the singleton), so the diff stays small.
5. Storage implementations must swallow storage exceptions the way
   `privacy.ts` already does (private-browsing mode etc.).

## Requirements

- `demo.ts`, `privacy.ts`, `translate.ts` no longer reference
  `localStorage` / `sessionStorage` / `navigator` directly — only the
  adapter/hooks, with web implementations injected from web wiring.
- No behavior change on web. Existing tests stay green; add unit tests for
  the adapter (in-memory impl) covering demo flag, PIN unlock, and language
  detection fallbacks.

## Non-goals

- No RN implementations yet (mmkv/expo-localization land with Phase 2).
- No file moves/workspaces. Web-only modules (`exportData.ts`,
  `googleCalendar.ts`, `observability.ts`) keep their browser APIs.

## Exit criteria

`grep -rnE '\b(localStorage|sessionStorage|navigator)\b' src/lib
--include='*.ts' | grep -v test | grep -v translations/` matches only the
web wiring implementations; `npm test`, `npm run build`, `npm run lint`
green; prod behavior identical.
