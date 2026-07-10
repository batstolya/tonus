// Доставка medication reminders: чистая логика без Deno-глобалов → vitest.
// Спека: architecture-hardening/2026-07-09-automation-reliability-design.md §2.2–2.3.
//
// Ключевое решение (§8 вопрос 1): Telegram Bot API не поддерживает idempotency
// key у sendMessage. Поэтому network-ошибка ПОСЛЕ отправки запроса — это
// «неизвестный исход» (сообщение могло дойти): терминальный delivery_unknown,
// без автоматического ретрая. HTTP-ответ с ok:false — подтверждённый неуспех,
// его можно ретраить до max attempts.

export type SendOutcome =
  | { kind: 'sent'; messageId: number | null }
  | { kind: 'confirmed_failure'; error: string } // Telegram ответил и НЕ принял
  | { kind: 'unknown'; error: string }           // network throw: мог принять

export interface ClaimedReminder {
  id: string
  user_id: string
  supplement_id: string | null
  due_at: string
  claim_token: string
  attempt_count: number
  telegram_chat_id: string | null
  supplement_name: string | null
  default_dose: string | null
  unit: string | null
  timezone: string | null
}

// Абстракция над fetch к Telegram sendMessage (мокается в тестах).
export type TelegramTransport = (body: Record<string, unknown>) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

// Текст и клавиатура напоминания (та же разметка, что раньше в send-reminders).
export function reminderMessage(ev: ClaimedReminder): { text: string; keyboard: unknown } {
  const dose = ev.default_dose ? ` ${ev.default_dose}${ev.unit ? ' ' + ev.unit : ''}` : ''
  const text = `💊 Пора принять <b>${ev.supplement_name ?? 'препарат'}</b>${dose}`
  const keyboard = {
    inline_keyboard: [
      [{ text: '✅ Принял', callback_data: `rem_take_${ev.id}` }],
      [
        { text: '⏰ +1 час', callback_data: `rem_snz_${ev.id}_60` },
        { text: '⏰ +2 часа', callback_data: `rem_snz_${ev.id}_120` },
      ],
      [{ text: '⏭ Пропустить', callback_data: `rem_skip_${ev.id}` }],
    ],
  }
  return { text, keyboard }
}

// Одна попытка доставки. Не бросает: любой исход выражен в SendOutcome.
export async function deliverReminder(
  transport: TelegramTransport,
  ev: ClaimedReminder,
): Promise<SendOutcome> {
  const { text, keyboard } = reminderMessage(ev)
  let res: Awaited<ReturnType<TelegramTransport>>
  try {
    res = await transport({
      chat_id: ev.telegram_chat_id,
      text,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
  } catch (e) {
    // Запрос мог быть принят Telegram до обрыва — исход неизвестен.
    return { kind: 'unknown', error: String(e).slice(0, 500) }
  }
  let data: { ok?: boolean; result?: { message_id?: number }; description?: string } | null = null
  try {
    data = (await res.json()) as typeof data
  } catch {
    data = null
  }
  if (data?.ok) return { kind: 'sent', messageId: data.result?.message_id ?? null }
  // Ответ получен, Telegram НЕ принял → подтверждённый неуспех (ретраится).
  return {
    kind: 'confirmed_failure',
    error: (data?.description ?? `HTTP ${res.status}`).slice(0, 500),
  }
}

// Политика после неуспеха. ЗЕРКАЛО fail_reminder_delivery в миграции
// 20260710150000_reminder_delivery_state.sql — менять синхронно!
export function nextActionOnFailure(
  attemptCount: number,
  unknown: boolean,
  maxAttempts = 3,
): 'retry' | 'failed' | 'delivery_unknown' {
  if (unknown) return 'delivery_unknown'
  return attemptCount >= maxAttempts ? 'failed' : 'retry'
}
