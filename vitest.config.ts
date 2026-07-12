import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Node's built-in test runner owns the README media encoder test; Vitest
    // discovers *.test.mjs by default but cannot treat node:test suites as its own.
    exclude: ['**/node_modules/**', 'e2e/**', 'scripts/readme-media-lib.test.mjs'],
    // dummy env: src/lib/supabase.ts вызывает createClient(url, key) на загрузке модуля;
    // с пустыми значениями он бросает «supabaseUrl is required».
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
