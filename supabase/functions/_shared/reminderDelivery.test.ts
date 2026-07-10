import { describe, it, expect } from 'vitest'
import {
  deliverReminder, nextActionOnFailure, reminderMessage,
  type ClaimedReminder, type TelegramTransport,
} from './reminderDelivery.ts'
import { localDate } from './time.ts'

const ev: ClaimedReminder = {
  id: 'ev-1', user_id: 'u-1', supplement_id: 'sup-1',
  due_at: '2026-07-10T06:00:00Z', claim_token: 'tok-1', attempt_count: 1,
  telegram_chat_id: '42', supplement_name: 'Магний', default_dose: '400', unit: 'мг',
  timezone: 'Europe/Kyiv',
}

const okTransport: TelegramTransport = async () => ({
  ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 777 } }),
})

describe('deliverReminder', () => {
  it('telegram ok:true → sent with message id', async () => {
    const out = await deliverReminder(okTransport, ev)
    expect(out).toEqual({ kind: 'sent', messageId: 777 })
  })

  it('telegram ok:false → confirmed_failure with description', async () => {
    const t: TelegramTransport = async () => ({
      ok: false, status: 400, json: async () => ({ ok: false, description: 'Bad Request: chat not found' }),
    })
    const out = await deliverReminder(t, ev)
    expect(out.kind).toBe('confirmed_failure')
    if (out.kind === 'confirmed_failure') expect(out.error).toContain('chat not found')
  })

  it('HTTP 500 без json → confirmed_failure (Telegram не принял)', async () => {
    const t: TelegramTransport = async () => ({
      ok: false, status: 500, json: async () => { throw new Error('not json') },
    })
    const out = await deliverReminder(t, ev)
    expect(out.kind).toBe('confirmed_failure')
  })

  it('network throw → unknown (запрос мог дойти, авторетрай запрещён)', async () => {
    const t: TelegramTransport = async () => { throw new Error('fetch timeout') }
    const out = await deliverReminder(t, ev)
    expect(out.kind).toBe('unknown')
    if (out.kind === 'unknown') expect(out.error).toContain('timeout')
  })

  it('шлёт chat_id и текст с названием и дозой', async () => {
    let sentBody: Record<string, unknown> | null = null
    const t: TelegramTransport = async (body) => { sentBody = body; return okTransport(body) }
    await deliverReminder(t, ev)
    expect(sentBody!.chat_id).toBe('42')
    expect(String(sentBody!.text)).toContain('Магний')
    expect(String(sentBody!.text)).toContain('400 мг')
  })
})

describe('nextActionOnFailure (зеркало fail_reminder_delivery в SQL)', () => {
  it('подтверждённый неуспех до лимита → retry', () => {
    expect(nextActionOnFailure(1, false)).toBe('retry')
    expect(nextActionOnFailure(2, false)).toBe('retry')
  })
  it('подтверждённый неуспех на лимите → failed', () => {
    expect(nextActionOnFailure(3, false)).toBe('failed')
    expect(nextActionOnFailure(4, false)).toBe('failed')
  })
  it('неизвестный исход → delivery_unknown независимо от попыток', () => {
    expect(nextActionOnFailure(1, true)).toBe('delivery_unknown')
    expect(nextActionOnFailure(3, true)).toBe('delivery_unknown')
  })
})

describe('reminderMessage', () => {
  it('текст содержит препарат и дозу, клавиатура — 4 действия по id события', () => {
    const { text, keyboard } = reminderMessage(ev)
    expect(text).toContain('Магний')
    expect(text).toContain('400 мг')
    const flat = (keyboard as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard.flat()
    expect(flat.map(b => b.callback_data)).toEqual([
      'rem_take_ev-1', 'rem_snz_ev-1_60', 'rem_snz_ev-1_120', 'rem_skip_ev-1',
    ])
  })
  it('без дозы — просто название', () => {
    const { text } = reminderMessage({ ...ev, default_dose: null, unit: null })
    expect(text).toContain('Магний')
    expect(text).not.toContain('null')
  })
})

describe('локальная дата события для supplement_logs (§2.4)', () => {
  it('поздний вечер Киева: UTC уже завтра, локально ещё сегодня', () => {
    // 21:30 UTC = 2026-07-11T00:30 Kyiv (UTC+3 летом) → киевская дата уже 11-е
    expect(localDate('Europe/Kyiv', new Date('2026-07-10T21:30:00Z'))).toBe('2026-07-11')
    // а 20:30 UTC = 23:30 Kyiv → ещё 10-е
    expect(localDate('Europe/Kyiv', new Date('2026-07-10T20:30:00Z'))).toBe('2026-07-10')
  })
  it('Berlin и UTC у границы полуночи', () => {
    expect(localDate('Europe/Berlin', new Date('2026-07-10T22:30:00Z'))).toBe('2026-07-11')
    expect(localDate('UTC', new Date('2026-07-10T22:30:00Z'))).toBe('2026-07-10')
  })
})
