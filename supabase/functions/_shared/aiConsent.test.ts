import { describe, expect, it, vi } from 'vitest'
import {
  fetchGeminiWithConsent,
  isAiConsentRequired,
  requireAiConsent,
  type AiConsentClient,
} from './aiConsent.ts'

type ConsentTable = ReturnType<AiConsentClient['from']>
type ConsentQuery = ReturnType<ConsentTable['select']>
type ConsentResult = Awaited<ReturnType<ConsentQuery['maybeSingle']>>

function client(result: ConsentResult): AiConsentClient {
  const maybeSingle = async () => result
  const query: ConsentQuery = {
    eq: () => query,
    is: () => query,
    maybeSingle,
  }
  return { from: () => ({ select: () => query }) }
}

describe('requireAiConsent', () => {
  it('accepts the current active Google Gemini consent', async () => {
    await expect(requireAiConsent(client({
      data: { policy_version: '2026-07-16', revoked_at: null },
      error: null,
    }), 'user-1')).resolves.toBeUndefined()
  })

  it.each([
    ['missing consent', { data: null, error: null }],
    ['revoked consent', { data: null, error: null }],
    ['stale consent', { data: null, error: null }],
    ['database failure', { data: null, error: { message: 'offline' } }],
  ])('fails closed for %s', async (_label, result) => {
    await expect(requireAiConsent(client(result), 'user-1')).rejects.toThrow('AI_CONSENT_REQUIRED')
  })

  it('fails closed without a user id', async () => {
    await expect(requireAiConsent(client({ data: null, error: null }), '')).rejects.toThrow('AI_CONSENT_REQUIRED')
  })

  it.each([
    ['missing consent', { data: null, error: null }],
    ['revoked consent', { data: { policy_version: '2026-07-16', revoked_at: '2026-07-16T01:00:00Z' }, error: null }],
    ['stale consent', { data: { policy_version: 'old', revoked_at: null }, error: null }],
    ['database failure', { data: null, error: { message: 'offline' } }],
  ])('does not call the provider for %s', async (_label, result) => {
    const providerFetch = vi.fn()

    await expect(fetchGeminiWithConsent(
      client(result),
      'user-1',
      'https://generativelanguage.googleapis.com/test',
      { method: 'POST' },
      providerFetch,
    )).rejects.toSatisfy(isAiConsentRequired)

    expect(providerFetch).not.toHaveBeenCalled()
  })

  it('calls the provider only after current consent is confirmed', async () => {
    const response = new Response('{}', { status: 200 })
    const providerFetch = vi.fn().mockResolvedValue(response)

    await expect(fetchGeminiWithConsent(
      client({ data: { policy_version: '2026-07-16', revoked_at: null }, error: null }),
      'user-1',
      'https://generativelanguage.googleapis.com/test',
      { method: 'POST' },
      providerFetch,
    )).resolves.toBe(response)

    expect(providerFetch).toHaveBeenCalledOnce()
  })

  it('applies an abort deadline to the provider call', async () => {
    let sawSignal: AbortSignal | undefined
    const providerFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sawSignal = init?.signal ?? undefined
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    await fetchGeminiWithConsent(
      client({ data: { policy_version: '2026-07-16', revoked_at: null }, error: null }),
      'user-1',
      'https://generativelanguage.googleapis.com/test',
      { method: 'POST' },
      providerFetch,
    )

    expect(sawSignal).toBeInstanceOf(AbortSignal)
  })
})
