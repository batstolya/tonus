# Tonus Tech-Debt Reduction — Historical Status

- **Original program date:** 2026-07-13
- **Status:** Core program completed; remaining readiness work moved to
  `2026-07-14-senior-production-readiness-design.md`
- **Purpose:** Evidence of completed work, not an active requirements source

## Outcome

The initial debt-reduction program established durable quality gates and
removed the highest-risk type and structure debt:

- lint ceiling reduced from 292 to the current tracked baseline of 16;
- Deno-check debt placed under a ratchet, current tracked baseline 16;
- explicit `any` removed from the client and non-test Edge Function code;
- Supabase client and generated database types made explicit and drift-checked;
- Vitest split into Node and jsdom projects with real component behavior tests;
- changed-line lint protection added to CI;
- scoring formulas moved to one source of truth;
- translations split by domain;
- `SettingsScreen` split into focused sections.

The ratchets may only move downward. Remaining lint/Deno debt and current
architecture hotspots are governed by the canonical senior-readiness program.

## Delivered pull requests

| PR | Result |
|---:|---|
| [#43](https://github.com/batstolya/tonus/pull/43) | Lint ratchet, changed-line guard, and jsdom harness |
| [#44](https://github.com/batstolya/tonus/pull/44) | Typed Supabase client and regenerated database types |
| [#45](https://github.com/batstolya/tonus/pull/45) | Removed client data-layer `any` |
| [#46](https://github.com/batstolya/tonus/pull/46) | Removed component `any` |
| [#47](https://github.com/batstolya/tonus/pull/47) | Behavior tests for five components |
| [#48](https://github.com/batstolya/tonus/pull/48) | Recharts typing and lint configuration cleanup |
| [#49](https://github.com/batstolya/tonus/pull/49) | Typed Edge Function catch clauses |
| [#50](https://github.com/batstolya/tonus/pull/50) | Mechanical lint cleanup |
| [#51](https://github.com/batstolya/tonus/pull/51) | Deno-check ratchet in CI |
| [#52](https://github.com/batstolya/tonus/pull/52) | Typed AI Edge Function handlers |
| [#53](https://github.com/batstolya/tonus/pull/53) | Typed eight additional Edge Functions |
| [#54](https://github.com/batstolya/tonus/pull/54) | Typed shared helpers and reminders |
| [#55](https://github.com/batstolya/tonus/pull/55) | Typed Telegram bot |
| [#56](https://github.com/batstolya/tonus/pull/56) | Removed the duplicate scores implementation |
| [#57](https://github.com/batstolya/tonus/pull/57) | Split translations by domain |
| [#58](https://github.com/batstolya/tonus/pull/58) | Decomposed `SettingsScreen` by section |
| [#59](https://github.com/batstolya/tonus/pull/59) | Reduced React hook lint debt |

## Durable infrastructure

- `.lint-ceiling` and `scripts/lint-ceiling.mjs` prevent baseline growth.
- `scripts/lint-diff.mjs` blocks new changed-line lint errors in pull requests.
- `.deno-check-ceiling` and `scripts/deno-check-ceiling.mjs` protect Edge
  Function type quality.
- `vitest.config.ts`, `vitest.setup.ts`, and `src/test/utils.tsx` provide Node
  and jsdom testing environments.
- `npm run gen:types` and `npm run gen:types:check` protect generated database
  type freshness.
- `_shared/scores.ts` is the single source of scoring formulas.

## Historical lessons retained

- `ReturnType<typeof createClient>` can instantiate unusable default generics;
  use the exported `SupabaseClient` type with explicit schema types.
- A type query on an already narrowed value can unexpectedly produce `never`.
- PostgREST builders are not standard promises and do not expose every Promise
  method; error paths require explicit verification.
- Characterization tests must precede decomposition of behavior-heavy files.
- Generated files are excluded from file-size architecture targets.

No new task should be added to this status file. Add focused implementation
plans under `docs/superpowers/plans/` and link their results from the canonical
senior-readiness specification or its execution tracker.
