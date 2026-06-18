import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function tgSend(chatId: string, text: string, replyMarkup?: unknown): Promise<number | null> {
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: replyMarkup }),
  })
  const data = await res.json()
  return data?.result?.message_id ?? null
}

// Текущее локальное время в указанной таймзоне → { hhmm, weekday(1=Пн..7=Вс), dateStr }
function localNow(tz: string) {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    hhmm: `${parts.hour}:${parts.minute}`,
    weekday: wdMap[parts.weekday] ?? 1,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const nowMs = Date.now()

  // ── 1. Создать события для наступивших доз ──────────────────────────────────
  const { data: settings } = await supabase
    .from('reminder_settings')
    .select('user_id, supplement_id, times, weekdays, timezone, quiet_until, enabled, supplements(name, default_dose, unit)')
    .eq('enabled', true)

  let created = 0
  for (const s of settings ?? []) {
    const { hhmm, weekday, dateStr } = localNow(s.timezone || 'Europe/Kyiv')
    if (!s.weekdays?.includes(weekday)) continue
    // тихие часы: если сейчас позже quiet_until — не создавать
    if (s.quiet_until && hhmm > s.quiet_until) continue

    for (const t of s.times ?? []) {
      // совпадение с точностью до минуты (cron тикает каждые 5 мин — допускаем окно)
      if (!timeDue(t, hhmm)) continue
      // due_at = сегодняшняя дата + время в этой tz → UTC. Для уникальности используем dateStr+t.
      const dueKey = new Date(`${dateStr}T${t}:00`).toISOString()
      const { error } = await supabase.from('reminder_events').insert({
        user_id: s.user_id,
        supplement_id: s.supplement_id,
        due_at: dueKey,
        status: 'pending',
      })
      if (!error) created++
    }
  }

  // ── 2. Отправить pending + наступившие snooze ───────────────────────────────
  const { data: due } = await supabase
    .from('reminder_events')
    .select('id, user_id, supplement_id, status, snooze_until, supplements(name, default_dose, unit)')
    .in('status', ['pending', 'snoozed'])
    .limit(100)

  let sent = 0
  for (const ev of due ?? []) {
    if (ev.status === 'snoozed' && ev.snooze_until && new Date(ev.snooze_until).getTime() > nowMs) continue

    // уже отмечен на сайте сегодня? → пропустить (двусторонняя синхронизация частично)
    const today = new Date().toISOString().slice(0, 10)
    const { data: log } = await supabase
      .from('supplement_logs')
      .select('taken')
      .eq('user_id', ev.user_id)
      .eq('supplement_id', ev.supplement_id)
      .eq('date', today)
      .maybeSingle()
    if (log?.taken) {
      await supabase.from('reminder_events').update({ status: 'taken', responded_at: new Date().toISOString() }).eq('id', ev.id)
      continue
    }

    // привязанный telegram-чат
    const { data: link } = await supabase
      .from('telegram_links')
      .select('telegram_chat_id')
      .eq('user_id', ev.user_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!link?.telegram_chat_id) continue

    const sup: any = ev.supplements
    const dose = sup?.default_dose ? ` ${sup.default_dose}${sup.unit ? ' ' + sup.unit : ''}` : ''
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
    const msgId = await tgSend(
      link.telegram_chat_id,
      `💊 Пора принять <b>${sup?.name ?? 'препарат'}</b>${dose}`,
      keyboard
    )
    await supabase.from('reminder_events')
      .update({ status: 'sent', tg_message_id: msgId })
      .eq('id', ev.id)
    sent++
  }

  // ── 3. Пометить просроченные как missed (sent > 3ч без ответа) ───────────────
  const staleBefore = new Date(nowMs - 3 * 3600 * 1000).toISOString()
  await supabase.from('reminder_events')
    .update({ status: 'missed' })
    .eq('status', 'sent')
    .lt('due_at', staleBefore)

  // ── 4. Вечерний вопрос «как прошёл день» (SPEC-DAILY-NOTE) ───────────────────
  const EVENING_QUESTIONS = [
    'Как прошёл твой день? 🌙',
    'Что было сегодня? Расскажи в двух словах.',
    'Как ты сегодня? Спорт, еда, кофе, настроение, события — что было?',
    'Чем запомнился день? 📝',
  ]
  const { data: noteSettings } = await supabase
    .from('daily_note_settings')
    .select('user_id, time, timezone, last_sent_date')
    .eq('enabled', true)

  let notesSent = 0
  for (const ns of noteSettings ?? []) {
    const { hhmm, dateStr } = localNow(ns.timezone || 'Europe/Kyiv')
    if (!timeDue(ns.time, hhmm)) continue
    if (ns.last_sent_date === dateStr) continue // уже отправляли сегодня

    const { data: link } = await supabase
      .from('telegram_links')
      .select('telegram_chat_id')
      .eq('user_id', ns.user_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!link?.telegram_chat_id) continue

    const q = EVENING_QUESTIONS[Math.floor(Math.random() * EVENING_QUESTIONS.length)]
    await tgSend(link.telegram_chat_id, q)
    // следующий свободный ответ → заметка дня за сегодня (N4)
    await supabase.from('telegram_links')
      .update({ awaiting_note_date: dateStr })
      .eq('user_id', ns.user_id)
    await supabase.from('daily_note_settings')
      .update({ last_sent_date: dateStr })
      .eq('user_id', ns.user_id)
    notesSent++
  }

  return new Response(JSON.stringify({ created, sent, notesSent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// время дозы наступило в текущем 5-минутном окне cron
function timeDue(target: string, nowHHMM: string): boolean {
  const [th, tm] = target.split(':').map(Number)
  const [nh, nm] = nowHHMM.split(':').map(Number)
  const tMin = th * 60 + tm
  const nMin = nh * 60 + nm
  // окно [target, target+5) — cron тикает каждые 5 мин
  return nMin >= tMin && nMin < tMin + 5
}
