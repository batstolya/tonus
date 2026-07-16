import { describe, expect, it } from 'vitest'
import { consumeRateLimit, hashRateLimitSubject, rateLimitedResponse } from './rateLimit.ts'

function fakeClient(results: Array<{ data: boolean | null; error: { message: string } | null }>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      return Promise.resolve(results[calls.length - 1] ?? { data: null, error: { message: 'exhausted' } })
    },
  }
}

describe('consumeRateLimit', () => {
  it('allows traffic within the limit', async () => {
    const client = fakeClient([{ data: true, error: null }])
    await expect(consumeRateLimit(client, { bucket: 'chat:u1', limit: 40, windowSeconds: 3600 })).resolves.toBe(true)
    expect(client.calls[0]).toEqual({
      fn: 'consume_rate_limit',
      args: { p_bucket: 'chat:u1', p_limit: 40, p_window_seconds: 3600 },
    })
  })
  it('denies once the limit is exceeded', async () => {
    const client = fakeClient([{ data: false, error: null }])
    await expect(consumeRateLimit(client, { bucket: 'chat:u1', limit: 40, windowSeconds: 3600 })).resolves.toBe(false)
  })
  it('fails closed on database errors, null data, and thrown errors', async () => {
    await expect(consumeRateLimit(fakeClient([{ data: null, error: { message: 'boom' } }]), { bucket: 'b', limit: 1, windowSeconds: 60 })).resolves.toBe(false)
    await expect(consumeRateLimit(fakeClient([{ data: null, error: null }]), { bucket: 'b', limit: 1, windowSeconds: 60 })).resolves.toBe(false)
    const throwing = { rpc() { return Promise.reject(new Error('network')) } }
    await expect(consumeRateLimit(throwing, { bucket: 'b', limit: 1, windowSeconds: 60 })).resolves.toBe(false)
  })
  it('keeps subjects isolated via distinct buckets', async () => {
    const client = fakeClient([{ data: true, error: null }, { data: true, error: null }])
    await consumeRateLimit(client, { bucket: 'ingest:aaa', limit: 120, windowSeconds: 3600 })
    await consumeRateLimit(client, { bucket: 'ingest:bbb', limit: 120, windowSeconds: 3600 })
    expect(client.calls.map(c => c.args.p_bucket)).toEqual(['ingest:aaa', 'ingest:bbb'])
  })
})

describe('hashRateLimitSubject', () => {
  it('hashes tokens so raw values never key the store', async () => {
    const h = await hashRateLimitSubject('secret-token')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain('secret-token')
    await expect(hashRateLimitSubject('secret-token')).resolves.toBe(h)
    await expect(hashRateLimitSubject('other')).resolves.not.toBe(h)
  })
})

describe('rateLimitedResponse', () => {
  it('returns a 429 JSON body with the given headers', async () => {
    const res = rateLimitedResponse({ 'Access-Control-Allow-Origin': 'https://x' })
    expect(res.status).toBe(429)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://x')
    await expect(res.json()).resolves.toEqual({ error: 'rate_limited' })
  })
})
