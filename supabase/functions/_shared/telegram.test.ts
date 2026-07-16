import { describe, expect, it, vi } from 'vitest'
import { sendTelegram } from './telegram.ts'

describe('sendTelegram', () => {
  it('posts sendMessage with chat_id and text and a deadline', async () => {
    const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.telegram.org/botTOKEN/sendMessage')
      expect(init?.method).toBe('POST')
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(JSON.parse(String(init?.body))).toEqual({ chat_id: '42', text: 'hi' })
      return new Response('{"ok":true}', { status: 200 })
    })
    const res = await sendTelegram('TOKEN', '42', 'hi', { fetchImpl: impl })
    expect(res?.status).toBe(200)
  })

  it('returns null without calling fetch when the token is empty', async () => {
    const impl = vi.fn()
    const res = await sendTelegram('', '42', 'hi', { fetchImpl: impl })
    expect(res).toBeNull()
    expect(impl).not.toHaveBeenCalled()
  })

  it('merges extra payload fields (parse_mode, reply_markup)', async () => {
    const impl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).parse_mode).toBe('HTML')
      return new Response('{"ok":true}', { status: 200 })
    })
    await sendTelegram('TOKEN', '42', 'hi', { payload: { parse_mode: 'HTML' }, fetchImpl: impl })
  })
})
