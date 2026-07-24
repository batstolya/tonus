import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Mirrors apps/web/eslint.config.js minus the Vite-only react-refresh rules.
//
// Not eslint-config-expo: it bundles eslint-plugin-react, which still calls the
// removed legacy context API and crashes on this repo's ESLint 10
// ("contextOrFilename.getFilename is not a function"). Revisit when the Expo
// config ships an ESLint 10 compatible plugin set.
//
// The file is .mjs so the config can use imports while the workspace itself
// stays CommonJS — package.json must not gain "type": "module" or
// metro.config.js breaks.
export default defineConfig([
  // Generated native projects and build output are not ours to lint.
  globalIgnores(['ios/**', 'android/**', '.expo/**', 'dist/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      // React Native exposes a browser-ish global surface (fetch, console,
      // timers, URL) but no DOM. Reaching for `document` is a type error, not a
      // lint error — TypeScript is what catches it.
      globals: { ...globals.browser, __DEV__: 'readonly' },
    },
    rules: {
      // `_`-prefixed names are intentionally unused (kept for signatures).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
])
