import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  fetch: vi.fn(),
  detectLang: vi.fn(),
}))
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}))
vi.mock('./demo', () => ({ isDemoActive: () => false }))
vi.mock('./translate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./translate')>()),
  detectLang: mocks.detectLang,
}))

import { callFunction } from './edgeFunctions'

function sentBody(): Record<string, unknown> | undefined {
  const init = mocks.fetch.mock.calls[0]?.[1] as RequestInit | undefined
  return init?.body ? JSON.parse(init.body as string) : undefined
}

describe('callFunction reply language', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  function stubOk() {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
    mocks.fetch.mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', mocks.fetch)
  }

  // Every AI function used to answer in Russian because no caller sent a
  // language. The single call site is the only place that cannot be forgotten.
  it('adds the UI language to an object body', async () => {
    mocks.detectLang.mockReturnValue('uk')
    stubOk()

    await callFunction('analyze-health', { digest: 'x' })

    expect(sentBody()).toEqual({ digest: 'x', lang: 'uk' })
  })

  it('adds the language even when the caller sends no body', async () => {
    mocks.detectLang.mockReturnValue('uk')
    stubOk()

    await callFunction('coach-weekly')

    expect(sentBody()).toEqual({ lang: 'uk' })
  })

  it('keeps an explicit language from the caller', async () => {
    mocks.detectLang.mockReturnValue('uk')
    stubOk()

    await callFunction('chat-health', { message: 'hi', lang: 'en' })

    expect(sentBody()).toMatchObject({ lang: 'en' })
  })

  it('leaves non-object bodies untouched', async () => {
    mocks.detectLang.mockReturnValue('uk')
    stubOk()

    await callFunction('some-fn', ['a', 'b'])

    expect(sentBody()).toEqual(['a', 'b'])
  })
})
