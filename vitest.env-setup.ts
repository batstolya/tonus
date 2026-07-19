// Env for both vitest projects (node + jsdom). Replaces the former
// import.meta.env injection in vitest.config.ts: src/lib reads env only
// through the env module now. demo:false — tests must never run in demo
// mode (the demo stub would replace mocked network calls).
import { initEnv } from './src/lib/env'

initEnv({
  supabaseUrl: 'http://localhost:54321',
  supabaseAnonKey: 'test-anon-key',
  demo: false,
  googleClientId: undefined,
})
