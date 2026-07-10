import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { localToIso } from '../_shared/time.ts'
import { isValidCronSecret } from '../_shared/auth.ts'

const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('CRON_SECRET') ?? ''

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

serve(async (req) => {
  // Fail closed: без корректного cron-секрета не читаем таблицы и не шлём (спека §3.2).
  if (!isValidCronSecret(req, CRON_SECRET)) return new Response('unauthorized', { status: 401 })
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
      // due_at = сегодняшняя дата + время в этой tz → UTC (через таймзонный хелпер,
      // иначе момент трактуется в UTC рантайма и due_at уезжает на смещение tz).
      const dueKey = localToIso(s.timezone || 'Europe/Kyiv', t, dateStr)
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
    const wbKeyboard = { inline_keyboard: [[1, 2, 3, 4, 5].map(n => ({ text: String(n), callback_data: `wb:${dateStr}:${n}` }))] }
    await tgSend(link.telegram_chat_id, `${q}\n\nОцени самочувствие 1–5:`, wbKeyboard)
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

  // ── 7. Проактивные алерты (раз в день ~10:00, дедуп 3 дня) ───────────────────
  let alertsSent = 0
  {
    const { hhmm } = localNow('Europe/Kyiv')
    if (timeDue('10:00', hhmm)) {
      const { data: links } = await supabase
        .from('telegram_links').select('user_id, telegram_chat_id').eq('status', 'active')
      const since = new Date(nowMs - 21 * 86400000).toISOString().slice(0, 10)

      for (const l of links ?? []) {
        const { data: rows } = await supabase
          .from('daily_metrics')
          .select('date, resting_heart_rate, hrv, sleep_hours')
          .eq('user_id', l.user_id).gte('date', since).order('date', { ascending: true })
        if (!rows || rows.length < 10) continue
        const recent = rows.slice(-3)
        const col = (rs: any[], k: string) => rs.map(r => r[k]).filter((v: any) => v != null)

        // hrv_drop и rhr_rise удалены: их покрывает страж здоровья
        // (_shared/anomaly.ts в ingest-health, z-score против личной нормы) —
        // иначе пользователь получал бы двойные алерты об одном и том же.
        const checks: { type: string; cond: boolean; msg: string }[] = []
        const lastSleep = col(recent, 'sleep_hours')
        if (lastSleep.length >= 3 && lastSleep.every((v: number) => v < 6))
          checks.push({ type: 'sleep_short', cond: true, msg: `😴 <b>Мало сна</b>\n3 ночи подряд меньше 6 часов. Накопленный недосып бьёт по восстановлению — постарайся лечь раньше.` })

        for (const c of checks) {
          if (!c.cond) continue
          const { data: recentAlert } = await supabase
            .from('health_alerts')
            .select('created_at').eq('user_id', l.user_id).eq('type', c.type)
            .gte('created_at', new Date(nowMs - 3 * 86400000).toISOString())
            .limit(1).maybeSingle()
          if (recentAlert) continue
          await tgSend(l.telegram_chat_id, c.msg)
          await supabase.from('health_alerts').insert({ user_id: l.user_id, type: c.type })
          alertsSent++
        }
      }
    }
  }

  // ── 8. Контекстные nudges коуча (раз в день ~13:00, дедуп 4 дня) ─────────────
  // Связывают поведение (события) с результатом по личным данным пользователя.
  let nudgesSent = 0
  {
    const { hhmm } = localNow('Europe/Kyiv')
    if (timeDue('13:00', hhmm)) {
      const { data: links } = await supabase
        .from('telegram_links').select('user_id, telegram_chat_id').eq('status', 'active')
      const avgF = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
      const sinceM = new Date(nowMs - 21 * 86400000).toISOString().slice(0, 10)
      const sinceE = new Date(nowMs - 7 * 86400000).toISOString()
      const kyivHour = (iso: string) => (new Date(iso).getUTCHours() + 3) % 24

      for (const l of links ?? []) {
        const { data: rs } = await supabase.from('report_settings').select('paused').eq('user_id', l.user_id).maybeSingle()
        if (rs?.paused) continue

        const [{ data: rows }, { data: ev }, { data: score }] = await Promise.all([
          supabase.from('daily_metrics').select('date, hrv, sleep_hours').eq('user_id', l.user_id).gte('date', sinceM).order('date', { ascending: true }),
          supabase.from('intake_events').select('ts, type').eq('user_id', l.user_id).gte('ts', sinceE).order('ts', { ascending: false }),
          supabase.from('daily_scores').select('hrv_baseline, sleep_baseline').eq('user_id', l.user_id).order('date', { ascending: false }).limit(1).maybeSingle(),
        ])
        if (!rows || rows.length < 10) continue
        const col = (rs2: any[], k: string) => rs2.map((r: any) => r[k]).filter((v: any) => v != null)
        const recent = rows.slice(-3)
        const hrvBase = score?.hrv_baseline ?? avgF(col(rows.slice(-17, -3), 'hrv'))
        const sleepBase = score?.sleep_baseline ?? avgF(col(rows.slice(-17, -3), 'sleep_hours'))
        const rHrv = avgF(col(recent, 'hrv'))
        const rSleep = avgF(col(recent, 'sleep_hours'))
        const events = ev ?? []

        // дни (YYYY-MM-DD) с поздним кофе (после 18:00 по Киеву)
        const lateCoffeeDays = new Set(events.filter((e: any) => e.type === 'coffee' && kyivHour(e.ts) >= 18).map((e: any) => e.ts.slice(0, 10)))
        const last3 = [0, 1, 2].map(d => new Date(nowMs - d * 86400000).toISOString().slice(0, 10))
        const alcoholRecent = events.find((e: any) => e.type === 'alcohol' && (nowMs - new Date(e.ts).getTime()) < 2 * 86400000)
        const workoutCount = new Set(events.filter((e: any) => e.type === 'workout').map((e: any) => e.ts.slice(0, 10))).size
        const stressRecent = events.find((e: any) => e.type === 'stress' && (nowMs - new Date(e.ts).getTime()) < 2 * 86400000)

        // выбираем ОДИН наиболее уместный nudge
        let nudge: { type: string; msg: string } | null = null
        if (alcoholRecent && rHrv != null && hrvBase && rHrv < hrvBase * 0.85) {
          nudge = { type: 'alcohol_hrv', msg: `🍷→💚 Заметил: после алкоголя на днях твой HRV ${rHrv.toFixed(0)} мс — ниже твоей нормы ${Math.round(hrvBase)} мс. У тебя восстановление обычно проседает после выпивки. Пара дней без — и увидишь, как отзовётся.` }
        } else if (last3.filter(d => lateCoffeeDays.has(d)).length >= 2 && rSleep != null && sleepBase && rSleep < sleepBase - 0.5) {
          nudge = { type: 'late_coffee', msg: `☕🌙 Кофе после 18:00 уже несколько дней подряд, и сон стал короче (${rSleep.toFixed(1)}ч против нормы ${sleepBase.toFixed(1)}ч). Попробуй последнюю чашку до обеда — часто это заметно улучшает сон.` }
        } else if (stressRecent && rHrv != null && hrvBase && rHrv < hrvBase * 0.9) {
          nudge = { type: 'stress_hrv', msg: `😰→💚 Ты отмечал стресс на днях, и HRV сейчас ниже нормы. Тело реагирует. Короткая прогулка, дыхание или ранний отбой сегодня помогут восстановиться.` }
        } else if (workoutCount >= 3 && rHrv != null && hrvBase && rHrv >= hrvBase) {
          nudge = { type: 'workout_good', msg: `🏋️✨ ${workoutCount} тренировки за неделю — и восстановление держится на уровне нормы. Хороший баланс нагрузки и отдыха, так держать!` }
        }

        if (nudge) {
          const { data: dup } = await supabase
            .from('coach_events').select('created_at')
            .eq('user_id', l.user_id).eq('type', 'nudge')
            .gte('created_at', new Date(nowMs - 4 * 86400000).toISOString())
            .limit(1).maybeSingle()
          if (!dup) {
            // позитивное подкрепление не требует follow-up — без кнопок
            const markup = nudge.type === 'workout_good' ? undefined : {
              inline_keyboard: [[
                { text: '👍 Беру в работу', callback_data: `nudge_acc:${nudge.type}` },
                { text: 'Не сейчас', callback_data: 'nudge_no' },
              ]],
            }
            await tgSend(l.telegram_chat_id, nudge.msg, markup)
            await supabase.from('coach_events').insert({ user_id: l.user_id, type: 'nudge', payload: { subtype: nudge.type } })
            nudgesSent++
          }
        }
      }
    }
  }

  // ── 9. Резолвер follow-up: подвести итог принятого совета по сроку ───────────
  let followupsSent = 0
  {
    const { data: openFollowups } = await supabase
      .from('coach_events').select('id, user_id, payload')
      .eq('type', 'followup').eq('status', 'open')
    const due = (openFollowups ?? []).filter((f: any) => f.payload?.due && f.payload.due <= new Date(nowMs).toISOString())
    const avgF = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null

    for (const f of due ?? []) {
      const metric = f.payload?.metric === 'sleep_hours' ? 'sleep_hours' : 'hrv'
      const baseline = f.payload?.baseline as number | null
      const { data: link } = await supabase
        .from('telegram_links').select('telegram_chat_id').eq('user_id', f.user_id).eq('status', 'active').maybeSingle()
      const since = new Date(nowMs - 4 * 86400000).toISOString().slice(0, 10)
      const { data: rows } = await supabase
        .from('daily_metrics').select(`date, ${metric}`).eq('user_id', f.user_id).gte('date', since).order('date', { ascending: false }).limit(3)
      const cur = avgF((rows ?? []).map((r: any) => r[metric]).filter((v: any) => v != null))

      let msg: string
      const name = metric === 'sleep_hours' ? 'сон' : 'HRV'
      const unit = metric === 'sleep_hours' ? 'ч' : 'мс'
      if (cur != null && baseline) {
        const pct = Math.round(((cur - baseline) / baseline) * 100)
        const better = pct > 2
        msg = better
          ? `🎯 Помнишь совет пару дней назад? Сработало: ${name} сейчас ${cur.toFixed(metric === 'sleep_hours' ? 1 : 0)} ${unit} — это +${pct}% к твоей норме. Продолжай в том же духе!`
          : pct < -2
            ? `🎯 По следам совета: ${name} пока ${cur.toFixed(metric === 'sleep_hours' ? 1 : 0)} ${unit} (${pct}% к норме). Эффект не моментальный — дай ещё несколько дней.`
            : `🎯 По следам совета: ${name} держится около твоей нормы (${cur.toFixed(metric === 'sleep_hours' ? 1 : 0)} ${unit}). Стабильность — тоже хорошо.`
      } else {
        msg = `🎯 Хотел подвести итог совета, но пока мало свежих данных по «${name}». Загляну позже.`
      }

      if (link?.telegram_chat_id) { await tgSend(link.telegram_chat_id, msg); followupsSent++ }
      await supabase.from('coach_events').update({ status: 'done' }).eq('id', f.id)
    }
  }

  // ── 10. Обобщённые напоминания (фото волос, устаревшие анализы) ───────────────
  let generalRemindersSent = 0
  {
    const { hhmm } = localNow('Europe/Kyiv')
    // Шлём раз в день в 10:05 (не конфликтует с другими блоками)
    if (timeDue('10:05', hhmm)) {
      const { data: links } = await supabase
        .from('telegram_links').select('user_id, telegram_chat_id').eq('status', 'active')

      for (const l of links ?? []) {
        // Напоминание о фото волос — если последняя запись старше 28 дней
        const { data: lastHair } = await supabase
          .from('hair_entries').select('date').eq('user_id', l.user_id)
          .order('date', { ascending: false }).limit(1).maybeSingle()
        if (lastHair) {
          const daysSince = Math.floor((nowMs - new Date(lastHair.date).getTime()) / 86400000)
          if (daysSince >= 28) {
            const { data: dup } = await supabase.from('health_alerts').select('id')
              .eq('user_id', l.user_id).eq('type', 'hair_photo_reminder')
              .gte('created_at', new Date(nowMs - 25 * 86400000).toISOString()).maybeSingle()
            if (!dup) {
              await tgSend(l.telegram_chat_id, `📸 Прошло ${daysSince} дней с последнего фото волос. Самое время сделать снимок по стандартному протоколу (макушка, линия роста, виски) при хорошем свете — для осмысленного сравнения в динамике.`)
              await supabase.from('health_alerts').insert({ user_id: l.user_id, type: 'hair_photo_reminder' })
              generalRemindersSent++
            }
          }
        }

        // Напоминание об анализах — если последний файл старше 90 дней
        const { data: lastLab } = await supabase
          .from('lab_files').select('uploaded_at').eq('user_id', l.user_id)
          .order('uploaded_at', { ascending: false }).limit(1).maybeSingle()
        if (lastLab) {
          const daysSince = Math.floor((nowMs - new Date(lastLab.uploaded_at).getTime()) / 86400000)
          if (daysSince >= 90) {
            const { data: dup } = await supabase.from('health_alerts').select('id')
              .eq('user_id', l.user_id).eq('type', 'labs_outdated_reminder')
              .gte('created_at', new Date(nowMs - 85 * 86400000).toISOString()).maybeSingle()
            if (!dup) {
              await tgSend(l.telegram_chat_id, `🧪 Последние анализы загружены ${daysSince} дней назад. Если ты сдавал что-то свежее — загрузи в приложении, чтобы ИИ-чат и отчёты видели актуальные биомаркеры.`)
              await supabase.from('health_alerts').insert({ user_id: l.user_id, type: 'labs_outdated_reminder' })
              generalRemindersSent++
            }
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ created, sent, notesSent, reportsSent, morningsSent, alertsSent, nudgesSent, followupsSent, generalRemindersSent }), {
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
