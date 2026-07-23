import { defineConfig, devices } from '@playwright/test'

// E2E-смоук поверх прод-сборки (vite preview). Vitest эти тесты не видит
// (exclude в vitest.config.ts), гоняются отдельно: npm run test:e2e.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build and serve the web workspace (apps/web); playwright.config stays at
    // the repo root and drives the production build via the tonus-web workspace.
    command: 'npm run -w tonus-web build && npm run -w tonus-web preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // dummy: демо-режим работает без Supabase
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      // Must override a developer's local VITE_DEMO=1: landing smoke tests
      // start unauthenticated and activate demo mode explicitly.
      VITE_DEMO: '',
    },
  },
})
