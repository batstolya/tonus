// Env for both vitest projects (node + jsdom). Replaces the former
// import.meta.env injection in vitest.config.ts: src/lib reads env only
// through the env module now. demo:false — tests must never run in demo
// mode (the demo stub would replace mocked network calls).
import { initEnv } from './src/lib/env'
import './src/lib/platform.web'
import { initPlatform, createInMemoryStorage } from './src/lib/platform'

initEnv({
  supabaseUrl: 'http://localhost:54321',
  supabaseAnonKey: 'test-anon-key',
  demo: false,
  googleClientId: undefined,
})

// jsdom keeps the real web wiring (imported above) so component tests can
// seed localStorage directly. The node project has no Web Storage, and
// Node 24 ships a real navigator.language that would make language
// detection machine-dependent — pin an in-memory/en-GB platform instead.
if (typeof localStorage === 'undefined') {
  initPlatform({
    persistentStorage: createInMemoryStorage(),
    ephemeralStorage: createInMemoryStorage(),
    getDeviceLocale: () => 'en-GB',
  })
}
