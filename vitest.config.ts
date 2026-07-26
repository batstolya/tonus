import { defineConfig } from 'vitest/config'

// Two root-level projects, both run from the repo root:
//
// - `repo` — repo-meta tests in tests/**, whose file reads are root-relative
//   (`supabase/**`, `playwright.config.ts`, `apps/web/**`, git ls-files).
// - `functions` — the edge functions' pure modules in supabase/functions/**.
//   Deno never runs these (`deno check` skips *.test.ts); vitest does.
//
// The `functions` project exists because the Phase 1 workspace move silently
// orphaned those 28 test files: apps/web's vitest only looks inside apps/web,
// packages/shared only inside its own src, and `repo` only in tests/. Nothing
// matched supabase/functions/**, so the suite stopped running on 2026-07-23
// without anything turning red.
//
// The web app tests live in apps/web and @tonus/shared has its own project —
// root `npm test` runs them all in sequence.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'repo',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'apps/**', 'packages/**', '.claude/**'],
        },
      },
      {
        test: {
          name: 'functions',
          environment: 'node',
          include: ['supabase/functions/**/*.test.ts'],
          exclude: ['**/node_modules/**', '.claude/**'],
        },
      },
    ],
  },
})
