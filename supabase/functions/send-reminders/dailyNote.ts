import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { localDate } from '../_shared/time.ts'
import { forecastReadiness } from '../_shared/forecast.ts'
import { forecastBlock } from '../_shared/forecastMessage.ts'
import { localNow, timeDue } from './time.ts'
import { tgSend } from './tg.ts'
import type { Ctx } from './ctx.ts'

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

// ── 4. Вечерний вопрос «как прошёл день» (SPEC-DAILY-NOTE) ───────────────────
export async function runDailyNotes({ supabase }: Ctx): Promise<number> {
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

  return notesSent
}
