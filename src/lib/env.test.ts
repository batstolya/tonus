import { describe, it, expect, beforeEach, vi } from 'vitest'

// The shared vitest setup initializes the env store for all other suites.
// Here we test the uninitialized state, so we need a fresh module instance.
async function freshEnv() {
  vi.resetModules()
  return await import('./env')
}

describe('env module', () => {
  beforeEach(() => { vi.resetModules() })

  it('fails fast when read before initialization', async () => {
    const { getEnv } = await freshEnv()
    expect(() => getEnv()).toThrow(/initEnv/)
  })

  it('returns the initialized values', async () => {
    const { initEnv, getEnv } = await freshEnv()
    initEnv({ supabaseUrl: 'http://x', supabaseAnonKey: 'k', demo: true, googleClientId: undefined })
    expect(getEnv().supabaseUrl).toBe('http://x')
    expect(getEnv().demo).toBe(true)
  })
})
