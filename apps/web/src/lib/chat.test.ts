import { afterEach, describe, it, expect, vi } from 'vitest'
import { sendChatMessage, loadChatHistory, loadNotesSummary } from './chat'
import { supabase } from './supabase'

// Контекст ИИ теперь собирается на сервере (F2 smart-tonus) — его полноту
// фиксирует supabase/functions/_shared/healthContext.test.ts. Здесь — только
// что клиентская обвязка чата на месте.

describe('chat client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('exports the API surface', () => {
    expect(typeof sendChatMessage).toBe('function')
    expect(typeof loadChatHistory).toBe('function')
    expect(typeof loadNotesSummary).toBe('function')
  })

  it('authenticates with the user JWT only — no apikey header (the CORS allowlist rejects it)', async () => {
    // The _shared/cors allowlist permits authorization + content-type + x-request-id,
    // NOT apikey. Sending apikey makes the browser preflight fail ("Failed to fetch").
    // The user JWT in Authorization is sufficient auth, matching edgeFunctions.ts.
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'user-jwt' } },
      error: null,
    } as never)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      reply: 'ok',
      sessionId: 'session-id',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await sendChatMessage('hello', null, 'en')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:54321/functions/v1/chat-health',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer user-jwt',
        },
      }),
    )
  })

  it('preserves the structured AI consent error from chat-health', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'user-jwt' } },
      error: null,
    } as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'ai_consent_required',
      message: 'Open Settings',
    }), { status: 403, headers: { 'content-type': 'application/json' } })))

    const error = await sendChatMessage('hello', null, 'en').catch(value => value)
    expect(error).toMatchObject({ message: 'Open Settings', code: 'ai_consent_required' })
  })
})
