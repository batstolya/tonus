import { sendTelegram } from '../_shared/telegram.ts'
import { fetchWithTimeout } from '../_shared/http.ts'
import type { TelegramTransport } from '../_shared/reminderDelivery.ts'

const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!

export async function tgSend(chatId: string, text: string, replyMarkup?: unknown): Promise<number | null> {
  const res = await sendTelegram(TG_TOKEN, chatId, text, {
    payload: { parse_mode: 'HTML', reply_markup: replyMarkup },
  })
  if (!res) return null
  const data = await res.json()
  return data?.result?.message_id ?? null
}

export function makeTransport(): TelegramTransport {
  return (body) =>
    fetchWithTimeout(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
}
