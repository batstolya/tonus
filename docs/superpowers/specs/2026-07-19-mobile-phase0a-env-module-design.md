# Phase 0a — Centralize Environment Access (env module)

**Date:** 2026-07-19
**Parent:** `2026-07-18-mobile-monorepo-design.md` (mobile monorepo roadmap)
**Depends on:** nothing. **Blocks:** Phase 0b (shares files), Phase 1.
**Size:** one small PR.

## Context (self-contained)

Tonus is a React+Vite web app; a React Native (Expo) iOS app will be added
to this repo later. Vite's `import.meta.env` does not exist under Metro
(Expo uses `process.env.EXPO_PUBLIC_*`), so any shared-candidate module that
reads `import.meta.env` directly is not portable. Today six files in
`src/lib` do:

- `src/lib/supabase.ts` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `src/lib/edgeFunctions.ts` — `VITE_SUPABASE_URL`
- `src/lib/chat.ts` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `src/lib/demo.ts` — `VITE_DEMO`
- `src/lib/autosync.ts` — `VITE_SUPABASE_URL`
- `src/lib/googleCalendar.ts` — `VITE_GOOGLE_CLIENT_ID`

## Requirements

1. Introduce a single config module `src/lib/env.ts` exposing the values
   above through a typed accessor (e.g. an `env` object or getters).
2. Platform wiring populates it: the web entry (`src/main.tsx`) initializes
   the module from `import.meta.env` before rendering. After this PR,
   `import.meta.env` appears nowhere in `src/lib` — only in the web wiring
   (entry point or a dedicated `env.web.ts` initializer).
3. Accessing an uninitialized value fails fast with a clear error message
   (misconfiguration must not surface as `undefined` deep in a request).
4. All six files above switch to the env module. No behavior change.
5. Tests: the node vitest project must keep passing; initialize the env
   module in `vitest.setup.ts` (it already mocks supabase and fetch) or in
   the module's test-friendly default. Add a small unit test for the
   fail-fast behavior.

## Non-goals

- No file moves, no workspaces (that is Phase 1).
- Do not touch storage/localStorage usage (that is Phase 0b).
- Do not change what the values are or how Vercel/CI provide them.

## Exit criteria

`grep -rn 'import\.meta' src/lib` returns only the env module's web wiring
(or nothing, if wiring lives in `src/main.tsx`); `npm test`, `npm run
build`, `npm run lint` are green; prod behavior identical.
