import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), isDemoActive: vi.fn(() => false) }))
vi.mock('./supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('./demo', () => ({ isDemoActive: mocks.isDemoActive }))

import {
  AI_CONSENT_POLICY_VERSION,
  grantAiConsent,
  loadAiConsent,
  revokeAiConsent,
} from './aiConsent'

function loadQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.maybeSingle = vi.fn().mockResolvedValue(result)
  return query
}

describe('durable AI consent data layer', () => {
  beforeEach(() => {
    mocks.from.mockReset()
    mocks.isDemoActive.mockReset()
    mocks.isDemoActive.mockReturnValue(false)
  })

  it('treats demo mode as granted without touching Supabase', async () => {
    mocks.isDemoActive.mockReturnValue(true)

    await expect(loadAiConsent('demo-user')).resolves.toEqual({ granted: true, grantedAt: null })
    await expect(grantAiConsent('demo-user')).resolves.toBeUndefined()
    await expect(revokeAiConsent('demo-user')).resolves.toBeUndefined()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('loads only the current, non-revoked account consent as granted', async () => {
    const query = loadQuery({
      data: { policy_version: AI_CONSENT_POLICY_VERSION, revoked_at: null, granted_at: '2026-07-16T00:00:00Z' },
      error: null,
    })
    mocks.from.mockReturnValue(query)

    await expect(loadAiConsent('user-1')).resolves.toMatchObject({ granted: true })
    expect(query.eq).toHaveBeenCalledWith('policy_version', AI_CONSENT_POLICY_VERSION)
  })

  it.each([
    ['missing', null],
    ['revoked', { policy_version: AI_CONSENT_POLICY_VERSION, revoked_at: '2026-07-16T01:00:00Z', granted_at: '2026-07-16T00:00:00Z' }],
    ['stale', { policy_version: 'old', revoked_at: null, granted_at: '2026-07-16T00:00:00Z' }],
  ])('treats %s durable consent as denied', async (_label, data) => {
    mocks.from.mockReturnValue(loadQuery({ data, error: null }))
    await expect(loadAiConsent('user-1')).resolves.toMatchObject({ granted: false })
  })

  it('fails closed when durable consent cannot be loaded', async () => {
    mocks.from.mockReturnValue(loadQuery({ data: null, error: { message: 'offline' } }))
    await expect(loadAiConsent('user-1')).rejects.toThrow('Failed to load AI consent')
  })

  it('grants the current provider, purpose and policy for the account', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mocks.from.mockReturnValue({ upsert })

    await grantAiConsent('user-1')

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      provider: 'google_gemini',
      purpose: 'health_ai_processing',
      policy_version: AI_CONSENT_POLICY_VERSION,
      revoked_at: null,
    }), { onConflict: 'user_id,provider,purpose,policy_version' })
  })

  it('revokes the account consent durably', async () => {
    const match = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ match }))
    mocks.from.mockReturnValue({ update })

    await revokeAiConsent('user-1')

    expect(update).toHaveBeenCalledWith({ revoked_at: expect.any(String) })
    expect(match).toHaveBeenCalledWith({
      user_id: 'user-1',
      provider: 'google_gemini',
      purpose: 'health_ai_processing',
      policy_version: AI_CONSENT_POLICY_VERSION,
    })
  })
})
