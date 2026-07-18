import { localDate } from '../_shared/time.ts'
import {
  deliverReminder, nextActionOnFailure, type ClaimedReminder,
} from '../_shared/reminderDelivery.ts'
import { makeTransport } from './tg.ts'
import type { Ctx } from './ctx.ts'

export type DeliveryCounters = {
  claimed: number; sent: number; skipped: number; retried: number
  failed: number; deliveryUnknown: number; remaining: number
}
export type DeliveryResult =
  | ({ ok: true } & DeliveryCounters)
  | { ok: false; error: string }

// ── 2. Доставка due-событий через атомарный claim (спека automation §2.2–2.3) ─
// Claim RPC (FOR UPDATE SKIP LOCKED) исключает дубли при overlapping cron.
// Каждый переход подтверждается claim_token; ошибка одной строки не
// прерывает batch (§4.1).
export async function runDelivery({ supabase }: Ctx): Promise<DeliveryResult> {
  const { data: claimedRows, error: claimErr } = await supabase
    .rpc('claim_due_reminder_events', { p_limit: 20 })
  if (claimErr) {
    return { ok: false, error: `claim failed: ${claimErr.message}` }
  }
  const claimed = (claimedRows ?? []) as ClaimedReminder[]
  const transport = makeTransport()

  let sent = 0, skipped = 0, retried = 0, failed = 0, deliveryUnknown = 0
  for (const ev of claimed) {
    try {
      // §2.4: локальная дата события в его timezone (не UTC-дата сервера) —
      // доза, принятая поздно вечером по Киеву, не «уезжает» на завтра.
      const localDay = localDate(ev.timezone || 'Europe/Kyiv', new Date(ev.due_at))
      const { data: log } = await supabase
        .from('supplement_logs')
        .select('taken')
        .eq('user_id', ev.user_id)
        .eq('supplement_id', ev.supplement_id)
        .eq('date', localDay)
        .maybeSingle()
      if (log?.taken) {
        await supabase.rpc('complete_reminder_delivery', {
          p_event_id: ev.id, p_claim_token: ev.claim_token, p_status: 'taken',
        })
        skipped++
        continue
      }

      if (!ev.telegram_chat_id) {
        // подтверждённый неуспех: ретрай по policy, после лимита — failed
        await supabase.rpc('fail_reminder_delivery', {
          p_event_id: ev.id, p_claim_token: ev.claim_token,
          p_error: 'no active telegram link', p_unknown: false,
        })
        if (nextActionOnFailure(ev.attempt_count, false) === 'retry') retried++
        else failed++
        continue
      }

      const outcome = await deliverReminder(transport, ev)
      if (outcome.kind === 'sent') {
        await supabase.rpc('complete_reminder_delivery', {
          p_event_id: ev.id, p_claim_token: ev.claim_token,
          p_telegram_message_id: outcome.messageId,
        })
        sent++
      } else {
        const unknown = outcome.kind === 'unknown'
        await supabase.rpc('fail_reminder_delivery', {
          p_event_id: ev.id, p_claim_token: ev.claim_token,
          p_error: outcome.error, p_unknown: unknown,
        })
        const action = nextActionOnFailure(ev.attempt_count, unknown)
        if (action === 'retry') retried++
        else if (action === 'delivery_unknown') deliveryUnknown++
        else failed++
      }
    } catch (e) {
      // Неожиданная ошибка строки — фиксируем и продолжаем batch (§4.1).
      // try/catch, а не .catch(): у PostgrestBuilder нет метода catch —
      // вызов в этом error-path падал бы TypeError.
      try {
        await supabase.rpc('fail_reminder_delivery', {
          p_event_id: ev.id, p_claim_token: ev.claim_token,
          p_error: String(e).slice(0, 500), p_unknown: false,
        })
      } catch { /* фиксация не удалась — batch продолжаем */ }
      failed++
    }
  }

  // backlog против SLO (§4.2): сколько due-событий осталось после этого тика
  const { count: remaining } = await supabase
    .from('reminder_events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return { ok: true, claimed: claimed.length, sent, skipped, retried, failed, deliveryUnknown, remaining: remaining ?? 0 }
}

// ── 3. Пометить просроченные как missed (sent > 3ч без ответа) ───────────────
export async function runMarkMissed({ supabase, nowMs }: Ctx): Promise<void> {
  const staleBefore = new Date(nowMs - 3 * 3600 * 1000).toISOString()
  await supabase.from('reminder_events')
    .update({ status: 'missed' })
    .eq('status', 'sent')
    .lt('due_at', staleBefore)
}
