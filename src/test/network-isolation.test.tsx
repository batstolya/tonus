import { describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'

// Contract for the jsdom-only network isolation layer in vitest.setup.ts.
// Component tests must never reach the network; this test locks that in.

type ChainResult = { data: unknown; error: unknown; count: unknown }
type Chain = PromiseLike<ChainResult> & { [method: string]: (...args: unknown[]) => Chain }
const sb = supabase as unknown as {
  from(table: string): Chain
  rpc(fn: string): Chain
  auth: { getSession(): Promise<{ data: { session: unknown }; error: unknown }> }
}

describe('jsdom network isolation', () => {
  it('stubs global fetch with an inert mock', async () => {
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true)
    const res = await fetch('http://example.invalid/anything')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('resolves any supabase query chain to the inert shape', async () => {
    const result = await sb.from('anything').select('*').eq('user_id', 'x').order('day')
    expect(result).toEqual({ data: null, error: null, count: null })
  })

  it('resolves rpc calls to the inert shape', async () => {
    expect(await sb.rpc('whatever')).toEqual({ data: null, error: null, count: null })
  })

  it('resolves a null session without throwing', async () => {
    const { data } = await sb.auth.getSession()
    expect(data.session).toBeNull()
  })
})
