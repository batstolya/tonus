import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Root-level lint for repo tooling that stays outside the web workspace:
// `tests/` (repo-meta vitest), `e2e/` + `playwright.config.ts` (Playwright), and
// `packages/**` (shared TS). `apps/**` self-lints with its own flat config, so it
// is ignored here to avoid double-linting and TSConfigRootDir conflicts (same
// reason `.claude/**` is ignored — nested worktrees carry their own tsconfig).
export default defineConfig([
  globalIgnores([
    'apps/**',
    'dist',
    '**/dist/**',
    '.claude/**',
    'node_modules',
    'claude-monitor/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
])
