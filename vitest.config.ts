import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // dummy env: src/lib/supabase.ts вызывает createClient(url, key) на загрузке модуля;
    // с пустыми значениями он бросает «supabaseUrl is required».
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
