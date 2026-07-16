// Single Telegram Bot API send path with a deadline. Empty token is a no-op
// (test environments run without the bot configured).

import { fetchWithTimeout } from './http.ts'

export interface SendTelegramOptions {
  payload?: Record<string, unknown>
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
  opts: SendTelegramOptions = {},
): Promise<Response | null> {
  if (!token) return null
  return fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...opts.payload }),
    timeoutMs: opts.timeoutMs,
    fetchImpl: opts.fetchImpl,
  })
}
