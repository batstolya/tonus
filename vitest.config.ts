import { defineConfig } from 'vitest/config'

// Repo-meta test project. These run from the repo root (their file reads are
// root-relative: `supabase/**`, `playwright.config.ts`, `apps/web/**`, git
// ls-files). The web app tests live in apps/web and @tonus/shared has its own
// project — root `npm test` runs all three in sequence.
export default defineConfig({
  test: {
    name: 'repo',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/**', 'packages/**', '.claude/**'],
  },
})
