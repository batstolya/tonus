import { describe, it, expect, vi } from 'vitest'

// Regression: in the production bundle the supabase chunk can evaluate
// BEFORE the entry chunk runs initEnv() (Rollup hoists chunk imports), so
// importing this module must never read env at module load — a fail-fast
// throw here blanks the whole app (broke e2e on PR #130).
describe('supabase module', () => {
  it('can be imported before env is initialized', async () => {
    vi.resetModules()
    await expect(import('./supabase')).resolves.toBeDefined()
  })

  it('creates the client lazily on first property access', async () => {
    vi.resetModules()
    const { initEnv } = await import('./env')
    const { supabase } = await import('./supabase')
    initEnv({ supabaseUrl: 'http://localhost:54321', supabaseAnonKey: 'test-anon-key', demo: false, googleClientId: undefined })
    expect(supabase.auth).toBeDefined()
  })
})
