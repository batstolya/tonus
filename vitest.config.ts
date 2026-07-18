import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// dummy env: src/lib/supabase.ts calls createClient(url, key) at module load;
// empty values make it throw "supabaseUrl is required".
const env = {
  VITE_SUPABASE_URL: 'http://localhost:54321',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  // A developer's .env.local may set VITE_DEMO=1; tests must never run in
  // demo mode (the demo stub replaces mocked network calls).
  VITE_DEMO: '',
}
// scripts/*.test.mjs are node:test suites (run via `npm run test:scripts`), not Vitest.
const exclude = ['**/node_modules/**', 'e2e/**', 'scripts/**']

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['**/*.test.ts'], exclude, env },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude,
          env,
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
})
