import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}))
vi.mock('./demo', () => ({ isDemoActive: () => false }))

import { callFunction, EdgeFunctionError } from './edgeFunctions'

describe('callFunction AI consent error', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('keeps the machine code while showing a safe Settings explanation', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      error: 'ai_consent_required',
      message: 'AI processing consent is required. Open Settings to grant it.',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', mocks.fetch)

    const error = await callFunction('analyze-health', {}).catch(value => value)

    expect(error).toBeInstanceOf(EdgeFunctionError)
    expect(error).toMatchObject({
      status: 403,
      code: 'ai_consent_required',
      message: 'AI processing consent is required. Open Settings to grant it.',
    })
  })
})
