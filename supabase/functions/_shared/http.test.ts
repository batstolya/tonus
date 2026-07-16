import { describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout } from './http.ts'

const okResponse = () => new Response('ok', { status: 200 })

describe('fetchWithTimeout', () => {
  it('passes url, init and an abort signal to the underlying fetch', async () => {
    const impl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(init?.method).toBe('POST')
      return okResponse()
    })
    const res = await fetchWithTimeout('https://x.test/api', { method: 'POST', timeoutMs: 5000, fetchImpl: impl })
    expect(res.status).toBe(200)
    expect(impl).toHaveBeenCalledTimes(1)
  })

  it('rejects when the deadline fires', async () => {
    const impl = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    await expect(
      fetchWithTimeout('https://x.test/slow', { timeoutMs: 20, fetchImpl: impl }),
    ).rejects.toThrow(/timed out|timeout/i)
  })

  it('retries a GET once on 5xx and returns the second response', async () => {
    const impl = vi.fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(okResponse())
    const res = await fetchWithTimeout('https://x.test/api', { retryOn5xx: true, fetchImpl: impl })
    expect(res.status).toBe(200)
    expect(impl).toHaveBeenCalledTimes(2)
  })

  it('retries a GET once on network error', async () => {
    const impl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse())
    const res = await fetchWithTimeout('https://x.test/api', { retryOn5xx: true, fetchImpl: impl })
    expect(res.status).toBe(200)
    expect(impl).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-GET methods even with retryOn5xx', async () => {
    const impl = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }))
    const res = await fetchWithTimeout('https://x.test/api', { method: 'POST', retryOn5xx: true, fetchImpl: impl })
    expect(res.status).toBe(503)
    expect(impl).toHaveBeenCalledTimes(1)
  })

  it('does not retry by default', async () => {
    const impl = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }))
    const res = await fetchWithTimeout('https://x.test/api', { fetchImpl: impl })
    expect(res.status).toBe(503)
    expect(impl).toHaveBeenCalledTimes(1)
  })
})
