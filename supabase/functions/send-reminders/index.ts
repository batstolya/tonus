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

  // ── 5. Автоматический двухнедельный отчёт (раз в 14 дней, утром ~09:00) ──────
  let reportsSent = 0
  {
    const { hhmm } = localNow('Europe/Kyiv')
    if (timeDue('09:00', hhmm)) {
      const { data: links } = await supabase
        .from('telegram_links')
        .select('user_id')
        .eq('status', 'active')
      for (const l of links ?? []) {
        // настройки отчёта (частота)
        const { data: rs } = await supabase
          .from('report_settings').select('paused, frequency_days').eq('user_id', l.user_id).maybeSingle()
        if (rs?.paused) continue
        const freqDays = rs?.frequency_days ?? 14
        // последний доставленный отчёт
        const { data: last } = await supabase
          .from('scheduled_reports')
          .select('delivered_at')
          .eq('user_id', l.user_id)
          .not('delivered_at', 'is', null)
          .order('delivered_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const daysSince = last?.delivered_at
          ? (nowMs - new Date(last.delivered_at).getTime()) / 86400000
          : 999
        if (daysSince < freqDays) continue
        // сгенерировать отчёт через biweekly-report (service-role + x-user-id)
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/biweekly-report`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'x-user-id': l.user_id,
            },
          })
          reportsSent++
        } catch (_e) { /* пропускаем сбойного юзера */ }
      }
    }
  }

  // ── 6. Утренняя сводка (B4) ─────────────────────────────────────────────────
  let morningsSent = 0
  {
    const { data: morn } = await supabase
      .from('report_settings')
      .select('user_id, morning_time, timezone, morning_last_sent')
      .eq('morning_summary', true)
    for (const m of morn ?? []) {
      const tz = m.timezone || 'Europe/Kyiv'
      const { hhmm, dateStr } = localNow(tz)
      if (!timeDue(m.morning_time || '09:00', hhmm)) continue
      if (m.morning_last_sent === dateStr) continue
      const { data: link } = await supabase
        .from('telegram_links').select('telegram_chat_id').eq('user_id', m.user_id).eq('status', 'active').maybeSingle()
      if (!link?.telegram_chat_id) continue

      // короткая сводка по последним 7 дням
      const since = new Date(nowMs - 7 * 86400000).toISOString().slice(0, 10)
      const { data: rows } = await supabase
        .from('daily_metrics')
        .select('resting_heart_rate, hrv, sleep_hours')
        .eq('user_id', m.user_id).gte('date', since)
      const avgF = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
      const rhr = (rows ?? []).map((r: any) => r.resting_heart_rate).filter(Boolean)
      const hrv = (rows ?? []).map((r: any) => r.hrv).filter(Boolean)
      const sl = (rows ?? []).map((r: any) => r.sleep_hours).filter(Boolean)
      const parts = ['☀️ <b>Доброе утро!</b> Сводка за неделю:']
      if (sl.length) parts.push(`😴 Сон: ${avgF(sl)!.toFixed(1)} ч/ночь`)
      if (rhr.length) parts.push(`❤️ ЧСС покоя: ${avgF(rhr)!.toFixed(0)} уд/мин`)
      if (hrv.length) parts.push(`💚 HRV: ${avgF(hrv)!.toFixed(0)} мс`)
      parts.push('\nХорошего дня! 💪')
      await tgSend(link.telegram_chat_id, parts.join('\n'))
      await supabase.from('report_settings').update({ morning_last_sent: dateStr }).eq('user_id', m.user_id)
      morningsSent++
    }
  }

  return new Response(JSON.stringify({ created, sent, notesSent, reportsSent, morningsSent }), {
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
