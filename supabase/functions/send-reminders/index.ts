import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { localToIso, localDate } from '../_shared/time.ts'
import { isValidCronSecret } from '../_shared/auth.ts'
import { fetchWithTimeout } from '../_shared/http.ts'
import { sendTelegram } from '../_shared/telegram.ts'
import {
  deliverReminder, nextActionOnFailure,
  type ClaimedReminder, type TelegramTransport,
} from '../_shared/reminderDelivery.ts'
import { shiftTime, workoutNotificationText, type DayEntry, type DayTimes } from '../_shared/workoutPlan.ts'
import { stormNotificationClause } from '../_shared/geoStorm.ts'
import { forecastReadiness } from '../_shared/forecast.ts'
import { forecastBlock } from '../_shared/forecastMessage.ts'
import { computeBaselineStart, computeResult, type ExpDaily, type ExperimentRow } from '../_shared/experiments.ts'
import { verdictMessage } from '../_shared/experimentVerdict.ts'
import { withObservability } from '../_shared/observability.ts'

const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const INTERNAL_SECRET = Deno.env.get('TONUS_INTERNAL_SECRET') ?? ''
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('CRON_SECRET') ?? ''

async function tgSend(chatId: string, text: string, replyMarkup?: unknown): Promise<number | null> {
  const res = await sendTelegram(TG_TOKEN, chatId, text, {
    payload: { parse_mode: 'HTML', reply_markup: replyMarkup },
  })
  if (!res) return null
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

// Прогноз readiness на завтра для вечернего сообщения (SPEC-READINESS-FORECAST §3.2).
// Любая ошибка данных → null: вечерний вопрос важнее прогноза.
// НЕ ReturnType<typeof createClient>: тот инстанцирует дефолтные генерики
// (schema=never) и не совместим с реальным клиентом.
async function buildForecastText(
  supabase: SupabaseClient,
  userId: string,
  tz: string,
): Promise<string | null> {
  try {
    const today = localDate(tz, new Date())
    const [scoresRes, sleepRes, exRes, evRes, envRes] = await Promise.all([
      supabase.from('daily_scores').select('date, readiness, sleep_baseline')
        .eq('user_id', userId).order('date', { ascending: false }).limit(3),
      supabase.from('daily_metrics').select('date, sleep_hours')
        .eq('user_id', userId).order('date', { ascending: false }).limit(3),
      supabase.from('metrics_daily').select('sum_val')
        .eq('user_id', userId).eq('metric', 'exerciseMinutes').eq('date', today).maybeSingle(),
      supabase.from('intake_events').select('ts, type')
        .eq('user_id', userId).gte('ts', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      supabase.from('environment_daily').select('kp_index')
        .eq('user_id', userId).eq('date', today).maybeSingle(),
    ])
    type ScoreRow = { date: string; readiness: number | null; sleep_baseline: number | null }
    type SleepRow = { date: string; sleep_hours: number | null }
    type EventRow = { ts: string; type: string }
    const scores = ((scoresRes.data ?? []) as ScoreRow[]).reverse() // хронологический порядок
    if (scores.length < 3) return null
    const sleepByDate = new Map(((sleepRes.data ?? []) as SleepRow[]).map(r => [r.date, r.sleep_hours]))
    const localHour = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', hour12: false,
    }).format(new Date(iso)))
    const todayEvents = ((evRes.data ?? []) as EventRow[]).filter(e => localDate(tz, new Date(e.ts)) === today)
    const forecast = forecastReadiness({
      readinessLast3: scores.map(s => s.readiness),
      sleepLast3: scores.map(s => sleepByDate.get(s.date) ?? null),
      sleepBaseline: scores[scores.length - 1].sleep_baseline ?? null,
      alcoholToday: todayEvents.some(e => e.type === 'alcohol'),
      lateCoffeeToday: todayEvents.some(e => e.type === 'coffee' && localHour(e.ts) >= 18),
      exerciseMinutesToday: (exRes.data as { sum_val: number | null } | null)?.sum_val ?? null,
      kpToday: (envRes.data as { kp_index: number | null } | null)?.kp_index ?? null,
    })
    if (!forecast) return null
    return forecastBlock(forecast, scores[scores.length - 1].readiness)
  } catch {
    return null
  }
}

const handler = async (req: Request) => {
  // Fail closed: без корректного cron-секрета не читаем таблицы и не шлём (спека §3.2).
  if (!isValidCronSecret(req, CRON_SECRET)) return new Response('unauthorized', { status: 401 })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const nowMs = Date.now()
  const runId = crypto.randomUUID()

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

  // ── 2. Доставка due-событий через атомарный claim (спека automation §2.2–2.3) ─
  // Claim RPC (FOR UPDATE SKIP LOCKED) исключает дубли при overlapping cron.
  // Каждый переход подтверждается claim_token; ошибка одной строки не
  // прерывает batch (§4.1).
  const { data: claimedRows, error: claimErr } = await supabase
    .rpc('claim_due_reminder_events', { p_limit: 20 })
  if (claimErr) {
    // Ошибка конфигурации/схемы — job обязан упасть видимо, а не вернуть 200 (§4.1).
    return new Response(JSON.stringify({ runId, error: `claim failed: ${claimErr.message}` }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
  const claimed = (claimedRows ?? []) as ClaimedReminder[]
  const transport: TelegramTransport = (body) =>
    fetchWithTimeout(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

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
    const fcText = await buildForecastText(supabase, ns.user_id, ns.timezone || 'Europe/Kyiv')
    await tgSend(link.telegram_chat_id, `${q}\n\nОцени самочувствие 1–5:` + (fcText ? `\n\n${fcText}` : ''), wbKeyboard)
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
        .select('user_id, telegram_chat_id')
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
          // Report generation includes a Gemini round-trip — allow well past the 10 s default.
          const reportRes = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/biweekly-report`, {
            method: 'POST',
            timeoutMs: 60_000,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, // gateway only; authority is x-internal-secret
              'x-internal-secret': INTERNAL_SECRET,
              'x-user-id': l.user_id,
            },
          })
          if (reportRes.ok) {
            reportsSent++
          } else if (reportRes.status === 403) {
            const body = await reportRes.json().catch(() => null)
            if (body?.error === 'ai_consent_required' && l.telegram_chat_id) {
              await tgSend(String(l.telegram_chat_id), '🔒 Чтобы получать ИИ-отчёты, открой Tonus → Настройки → Обработка данных ИИ и дай согласие.')
            }
          }
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
      const mRows: { resting_heart_rate: number | null; hrv: number | null; sleep_hours: number | null }[] = rows ?? []
      const numsOf = (vals: (number | null)[]) => vals.filter((v): v is number => v != null)
      const rhr = numsOf(mRows.map(r => r.resting_heart_rate))
      const hrv = numsOf(mRows.map(r => r.hrv))
      const sl = numsOf(mRows.map(r => r.sleep_hours))
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
        const recent = (rows as { date: string; resting_heart_rate: number | null; hrv: number | null; sleep_hours: number | null }[]).slice(-3)
        const col = (rs: Record<string, unknown>[], k: string): number[] =>
          rs.map(r => r[k]).filter((v): v is number => typeof v === 'number')

        // hrv_drop и rhr_rise удалены: их покрывает страж здоровья
        // (_shared/anomaly.ts в ingest-health, z-score против личной нормы) —
        // иначе пользователь получал бы двойные алерты об одном и том же.
        const checks: { type: string; cond: boolean; msg: string }[] = []
        const lastSleep = col(recent, 'sleep_hours')
        if (lastSleep.length >= 3 && lastSleep.every(v => v < 6))
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
      // §2.4: настоящий час в Киеве через Intl (жёсткое +3 ломалось на зимнем времени)
      const kyivHour = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Kyiv', hour: '2-digit', hour12: false,
      }).format(new Date(iso)))

      for (const l of links ?? []) {
        const { data: rs } = await supabase.from('report_settings').select('paused').eq('user_id', l.user_id).maybeSingle()
        if (rs?.paused) continue

        const [{ data: rows }, { data: ev }, { data: score }] = await Promise.all([
          supabase.from('daily_metrics').select('date, hrv, sleep_hours').eq('user_id', l.user_id).gte('date', sinceM).order('date', { ascending: true }),
          supabase.from('intake_events').select('ts, type').eq('user_id', l.user_id).gte('ts', sinceE).order('ts', { ascending: false }),
          supabase.from('daily_scores').select('hrv_baseline, sleep_baseline').eq('user_id', l.user_id).order('date', { ascending: false }).limit(1).maybeSingle(),
        ])
        if (!rows || rows.length < 10) continue
        const mRows2 = rows as { date: string; hrv: number | null; sleep_hours: number | null }[]
        const col = (rs2: Record<string, unknown>[], k: string): number[] =>
          rs2.map(r => r[k]).filter((v): v is number => typeof v === 'number')
        const recent = mRows2.slice(-3)
        const hrvBase = score?.hrv_baseline ?? avgF(col(mRows2.slice(-17, -3), 'hrv'))
        const sleepBase = score?.sleep_baseline ?? avgF(col(mRows2.slice(-17, -3), 'sleep_hours'))
        const rHrv = avgF(col(recent, 'hrv'))
        const rSleep = avgF(col(recent, 'sleep_hours'))
        const events: { ts: string; type: string }[] = ev ?? []

        // дни (YYYY-MM-DD) с поздним кофе (после 18:00 по Киеву)
        const lateCoffeeDays = new Set(events.filter(e => e.type === 'coffee' && kyivHour(e.ts) >= 18).map(e => e.ts.slice(0, 10)))
        const last3 = [0, 1, 2].map(d => new Date(nowMs - d * 86400000).toISOString().slice(0, 10))
        const alcoholRecent = events.find(e => e.type === 'alcohol' && (nowMs - new Date(e.ts).getTime()) < 2 * 86400000)
        const workoutCount = new Set(events.filter(e => e.type === 'workout').map(e => e.ts.slice(0, 10))).size
        const stressRecent = events.find(e => e.type === 'stress' && (nowMs - new Date(e.ts).getTime()) < 2 * 86400000)

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
    type FollowupRow = { id: string; user_id: string; payload: { due?: string; metric?: string; baseline?: number | null } | null }
    const due = ((openFollowups ?? []) as FollowupRow[]).filter(f => f.payload?.due && f.payload.due <= new Date(nowMs).toISOString())
    const avgF = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null

    for (const f of due) {
      const metric = f.payload?.metric === 'sleep_hours' ? 'sleep_hours' : 'hrv'
      const baseline = f.payload?.baseline as number | null
      const { data: link } = await supabase
        .from('telegram_links').select('telegram_chat_id').eq('user_id', f.user_id).eq('status', 'active').maybeSingle()
      const since = new Date(nowMs - 4 * 86400000).toISOString().slice(0, 10)
      const { data: rows } = await supabase
        .from('daily_metrics').select(`date, ${metric}`).eq('user_id', f.user_id).gte('date', since).order('date', { ascending: false }).limit(3)
      const cur = avgF(((rows ?? []) as Record<string, unknown>[])
        .map(r => r[metric]).filter((v): v is number => typeof v === 'number'))

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

  // ── 11. Уведомление о тренировке за N часов (спека workout-schedule §2) ─────
  let workoutNoticesSent = 0
  {
    const { data: schedules } = await supabase
      .from('workout_schedule')
      .select('user_id, weekdays, time, day_times, notify_hours_before, timezone, last_notified_date')
      .eq('enabled', true)
    for (const ws of schedules ?? []) {
      const { hhmm, weekday, dateStr } = localNow(ws.timezone || 'Europe/Kyiv')
      // Время своё на каждый день (day_times); legacy-строки без day_times
      // читаем по старой модели weekdays[]+time.
      const dayTimes = (ws.day_times ?? {}) as DayTimes
      const entry: DayEntry | null = dayTimes[String(weekday)]
        ?? (ws.weekdays?.includes(weekday) && ws.time ? { time: ws.time } : null)
      if (!entry) continue
      if (ws.last_notified_date === dateStr) continue
      if (!timeDue(shiftTime(entry.time, ws.notify_hours_before ?? 4), hhmm)) continue
      const { data: link } = await supabase
        .from('telegram_links').select('telegram_chat_id').eq('user_id', ws.user_id).eq('status', 'active').maybeSingle()
      if (!link?.telegram_chat_id) continue
      const { data: score } = await supabase
        .from('daily_scores').select('readiness, hrv_baseline').eq('user_id', ws.user_id).eq('date', dateStr).maybeSingle()
      const { data: hrvRow } = await supabase
        .from('daily_metrics').select('hrv').eq('user_id', ws.user_id).eq('date', dateStr).maybeSingle()
      // Уличный спорт — предупредить о магнитной буре (Kp ≥ 5), если есть.
      const { data: envRow } = await supabase
        .from('environment_daily').select('kp_index').eq('user_id', ws.user_id).eq('date', dateStr).maybeSingle()
      const stormLine = stormNotificationClause(envRow?.kp_index)
      const text = workoutNotificationText(entry, score ? {
        readiness: score.readiness, hrv: hrvRow?.hrv ?? null, hrvBaseline: score.hrv_baseline,
      } : null) + (stormLine ? `\n${stormLine}` : '')
      await tgSend(link.telegram_chat_id, text)
      // send → mark (как в утренней сводке): редкий дубль при сбое между ними приемлем
      await supabase.from('workout_schedule').update({ last_notified_date: dateStr }).eq('user_id', ws.user_id)
      workoutNoticesSent++
    }
  }

  // ── 12. Автовердикт завершившихся экспериментов (SPEC-EXPERIMENT-LOOP §2.2) ──
  // Утром 09:10 локального времени юзера: завершившиеся active-эксперименты
  // получают финальный result (атомарно, active→completed) и вердикт в Telegram.
  let verdictsSent = 0
  {
    const { data: activeExps } = await supabase
      .from('experiments')
      .select('id, user_id, hypothesis, target_metric, baseline_days, baseline_start, start_date, end_date')
      .eq('status', 'active')
    for (const exp of activeExps ?? []) {
      try {
        const { data: rs } = await supabase
          .from('report_settings').select('timezone').eq('user_id', exp.user_id).maybeSingle()
        const tz = rs?.timezone || 'Europe/Kyiv'
        const { hhmm, dateStr } = localNow(tz)
        if (!timeDue('09:10', hhmm)) continue
        if (exp.end_date >= dateStr) continue // ещё идёт

        const baseStart = exp.baseline_start ?? computeBaselineStart(exp.start_date, exp.baseline_days)
        const [mRes, sRes, hrRes] = await Promise.all([
          supabase.from('daily_metrics')
            .select('date, hrv, resting_heart_rate, sleep_hours, steps, active_energy, oxygen_saturation')
            .eq('user_id', exp.user_id).gte('date', baseStart).lte('date', exp.end_date),
          supabase.from('sleep_sessions')
            .select('date, deep_hours, rem_hours')
            .eq('user_id', exp.user_id).gte('date', baseStart).lte('date', exp.end_date),
          supabase.from('metrics_daily')
            .select('date, avg_val')
            .eq('user_id', exp.user_id).eq('metric', 'heartRate').gte('date', baseStart).lte('date', exp.end_date),
        ])
        type MRow = { date: string; hrv: number | null; resting_heart_rate: number | null; sleep_hours: number | null; steps: number | null; active_energy: number | null; oxygen_saturation: number | null }
        const byDate = new Map<string, ExpDaily>()
        for (const r of (mRes.data ?? []) as MRow[]) {
          byDate.set(r.date, {
            date: r.date, hrv: r.hrv, restingHeartRate: r.resting_heart_rate,
            sleepHours: r.sleep_hours, steps: r.steps, activeEnergy: r.active_energy,
            oxygenSaturation: r.oxygen_saturation,
          })
        }
        for (const s of (sRes.data ?? []) as { date: string; deep_hours: number | null; rem_hours: number | null }[]) {
          const d = byDate.get(s.date) ?? { date: s.date }
          d.sleepDeep = s.deep_hours
          d.sleepREM = s.rem_hours
          byDate.set(s.date, d)
        }
        for (const h of (hrRes.data ?? []) as { date: string; avg_val: number | null }[]) {
          if (h.avg_val == null) continue
          const d = byDate.get(h.date) ?? { date: h.date }
          d.heartRate = { avg: h.avg_val }
          byDate.set(h.date, d)
        }
        const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
        const result = computeResult(daily, exp as unknown as ExperimentRow)

        // Атомарный переход: 0 строк → уже завершил параллельный ран, не дублируем
        const { data: updated } = await supabase
          .from('experiments')
          .update({ status: 'completed', result })
          .eq('id', exp.id).eq('status', 'active')
          .select('id')
        if (!updated?.length) continue

        const { data: link } = await supabase
          .from('telegram_links').select('telegram_chat_id').eq('user_id', exp.user_id).eq('status', 'active').maybeSingle()
        if (link?.telegram_chat_id) {
          await tgSend(link.telegram_chat_id, verdictMessage(exp.hypothesis, exp.target_metric, result))
          verdictsSent++
        }
      } catch {
        // ошибка одного эксперимента не роняет весь ран — доберём завтра
      }
    }
  }

  // Structured execution result (§4.1) + backlog signal (§4.2)
  return new Response(JSON.stringify({
    runId,
    claimed: claimed.length,
    sent,
    skipped,
    retried,
    failed,
    deliveryUnknown,
    remaining: remaining ?? 0,
    durationMs: Date.now() - nowMs,
    created, notesSent, reportsSent, morningsSent, alertsSent, nudgesSent, followupsSent, generalRemindersSent,
    workoutNoticesSent, verdictsSent,
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(withObservability('edge.send_reminders', handler))

// время дозы наступило в текущем 5-минутном окне cron
function timeDue(target: string, nowHHMM: string): boolean {
  const [th, tm] = target.split(':').map(Number)
  const [nh, nm] = nowHHMM.split(':').map(Number)
  const tMin = th * 60 + tm
  const nMin = nh * 60 + nm
  // окно [target, target+5) — cron тикает каждые 5 мин
  return nMin >= tMin && nMin < tMin + 5
}
