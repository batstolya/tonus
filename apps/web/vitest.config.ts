import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// scripts/*.test.mjs are node:test suites (run via `npm run test:scripts`), not Vitest.
// .claude/** keeps agent worktrees from duplicating the suite when run from the repo root.
const exclude = ['**/node_modules/**', 'e2e/**', 'scripts/**', '.claude/**']

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude,
          setupFiles: ['./vitest.env-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude,
          setupFiles: ['./vitest.env-setup.ts', './vitest.setup.ts'],
        },
      },
    ],
  },
})
