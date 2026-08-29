// Menu / command handlers (moved verbatim from index.ts in the B3 split).

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchWithTimeout } from '../_shared/http.ts'
import { daysSinceFreshData } from '../_shared/staleness.ts'
import { localizeRoundName } from '../_shared/football.ts'
import { metricLabel as expMetricLabel } from '../_shared/experiments.ts'
import { localDate } from '../_shared/time.ts'
import { loadUserTimezone } from '../_shared/userTimezone.ts'
import { habitDays, habitStats, addDays, HABIT_WINDOW_DAYS, type Habit, type HabitBreak } from '../_shared/habits.ts'
import { tgSend, tgTyping } from './tg.ts'
import { REPORT_ACTIONS, STATUS_ACTIONS, BACK_MENU, FOOTBALL_MENU, HABITS_MENU, HABIT_DAY_MENU } from './menus.ts'
import { AI_CONSENT_TELEGRAM_MESSAGE } from './ai.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const INTERNAL_SECRET = Deno.env.get('TONUS_INTERNAL_SECRET') ?? ''

export async function handleReport(chatId: number | string, userId: string, _supabase: unknown, _msgId?: number) {
  await tgTyping(chatId)
  // Report generation includes a Gemini round-trip — allow well past the 10 s default.
  const reportRes = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/biweekly-report`, {
    method: 'POST',
    timeoutMs: 60_000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, // gateway only; authority is x-internal-secret
      'x-internal-secret': INTERNAL_SECRET,
      'x-user-id': userId,
    },
  })
  if (reportRes.status === 403) {
    const error = await reportRes.json().catch(() => null)
    if (error?.error === 'ai_consent_required') {
      await tgSend(chatId, AI_CONSENT_TELEGRAM_MESSAGE, { reply_markup: BACK_MENU })
      return
    }
  }
  if (!reportRes.ok) {
    await tgSend(chatId, '❌ Не удалось сгенерировать отчёт. Попробуй позже.', { reply_markup: BACK_MENU })
  }
  // biweekly-report sends the Telegram message itself with content
  // We just add action buttons in a follow-up
  if (reportRes.ok) {
    await tgSend(chatId, '↑ Что хочешь сделать дальше?', { reply_markup: REPORT_ACTIONS })
  }
}

export async function handleStatus(chatId: number | string, userId: string, supabase: SupabaseClient) {
  await tgTyping(chatId)
  const week = new Date(); week.setDate(week.getDate() - 7)
  const { data: rows } = await supabase
    .from('daily_metrics')
    .select('date, resting_heart_rate, hrv, sleep_hours, steps')
    .eq('user_id', userId)
    .gte('date', week.toISOString().slice(0, 10))
    .order('date', { ascending: false })

  if (!rows?.length) {
    await tgSend(chatId, '📭 Нет данных за последнюю неделю.', { reply_markup: BACK_MENU })
    return
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const mRows: { date: string; resting_heart_rate: number | null; hrv: number | null; sleep_hours: number | null; steps: number | null }[] = rows
  const nums = (vals: (number | null)[]) => vals.filter((v): v is number => v != null)
  const rhr = nums(mRows.map(r => r.resting_heart_rate))
  const hrv = nums(mRows.map(r => r.hrv))
  const sleep = nums(mRows.map(r => r.sleep_hours))
  const steps = nums(mRows.map(r => r.steps))

  const lines = ['📈 Статус за 7 дней', '']
  if (rhr.length) lines.push(`❤️ ЧСС покоя: ${avg(rhr)!.toFixed(0)} уд/мин`)
  if (hrv.length) lines.push(`💚 HRV: ${avg(hrv)!.toFixed(0)} мс`)
  if (sleep.length) lines.push(`😴 Сон: ${avg(sleep)!.toFixed(1)} ч/ночь`)
  if (steps.length) lines.push(`👟 Шаги: ${Math.round(avg(steps)!).toLocaleString()}/день`)
  lines.push('', `Данных за период: ${rows.length} дн.`)

  await tgSend(chatId, lines.join('\n'), { reply_markup: STATUS_ACTIONS })
}

export async function handleSupplements(chatId: number | string, userId: string, supabase: SupabaseClient) {
  await tgTyping(chatId)
  const today = new Date().toISOString().slice(0, 10)
  const { data: sups } = await supabase
    .from('supplements')
    .select('id, name, default_dose, unit, doses_per_day')
    .eq('user_id', userId)
    .eq('active', true)

  if (!sups?.length) {
    await tgSend(chatId, '💊 Препараты не добавлены. Добавь их в разделе Препараты на сайте.', { reply_markup: BACK_MENU })
    return
  }

  const { data: logs } = await supabase
    .from('supplement_logs')
    .select('supplement_id, taken, taken_count')
    .eq('user_id', userId)
    .eq('date', today)

  const logRows: { supplement_id: string; taken: boolean; taken_count: number | null }[] = logs ?? []
  // Сколько доз уже отмечено сегодня; препарат «закрыт», только когда набраны все.
  const takenCounts = new Map<string, number>()
  for (const l of logRows) {
    if (l.taken) takenCounts.set(l.supplement_id, l.taken_count ?? 1)
  }

  const supRows: {
    id: string; name: string; default_dose: string | number | null
    unit: string | null; doses_per_day: number | null
  }[] = sups
  const lines = [`💊 Препараты на сегодня (${today})`, '']
  for (const s of supRows) {
    const perDay = s.doses_per_day ?? 1
    const count = takenCounts.get(s.id) ?? 0
    const dose = s.default_dose ? ` ${s.default_dose}${s.unit ? ' ' + s.unit : ''}` : ''
    const progress = perDay > 1 ? ` — ${count}/${perDay}` : ''
    lines.push(`${count >= perDay ? '✅' : count > 0 ? '🔸' : '⬜'} ${s.name}${dose}${progress}`)
  }

  // Кнопка остаётся и у частично принятых — иначе вторую дозу из меню не отметить.
  const notTaken = supRows.filter(s => (takenCounts.get(s.id) ?? 0) < (s.doses_per_day ?? 1))
  const keyboard = {
    inline_keyboard: [
      ...notTaken.map(s => [{
        text: `✓ Принял ${s.name}`,
        callback_data: `take_${s.id}`,
      }]),
      [{ text: '🏠 Главное меню', callback_data: 'menu' }],
    ],
  }

  await tgSend(chatId, lines.join('\n'), { reply_markup: keyboard })
}

export async function handleGoals(chatId: number | string, userId: string, supabase: SupabaseClient) {
  await tgTyping(chatId)
  const { data: goals } = await supabase
    .from('goals')
    .select('id, title, metric, target_value, end_date, status')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (!goals?.length) {
    await tgSend(chatId, '🎯 Активных целей нет. Создай их на сайте в разделе Коуч → Цели.', { reply_markup: BACK_MENU })
    return
  }

  const lines = ['🎯 Активные цели', '']
  for (const g of goals) {
    lines.push(`• ${g.title} → ${g.target_value} (до ${g.end_date})`)
  }

  await tgSend(chatId, lines.join('\n'), { reply_markup: BACK_MENU })
}

export async function handleSettings(chatId: number | string, userId: string, supabase: SupabaseClient) {
  const { data: settings } = await supabase
    .from('report_settings')
    .select('paused, frequency_days')
    .eq('user_id', userId)
    .single()

  const paused = settings?.paused ?? false
  const freq = settings?.frequency_days ?? 14

  const keyboard = {
    inline_keyboard: [
      [{ text: paused ? '▶️ Включить автоотчёты' : '⏸ Приостановить автоотчёты', callback_data: paused ? 'resume' : 'pause' }],
      [{ text: '🔌 Отключить Telegram', callback_data: 'disconnect' }],
      [{ text: '🏠 Главное меню', callback_data: 'menu' }],
    ],
  }

  await tgSend(chatId,
    `⚙️ Настройки\n\nАвтоотчёты: ${paused ? '⏸ на паузе' : '▶️ активны'}\nЧастота: каждые ${freq} дней\n\n⚠️ Сообщения в Telegram не end-to-end зашифрованы.`,
    { reply_markup: keyboard }
  )
}

export async function handleFootballMenu(chatId: number | string, userId: string, supabase: SupabaseClient) {
  const { data: settings } = await supabase
    .from('football_user_settings')
    .select('reminders_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  const enabled = settings?.reminders_enabled ?? false
  await tgSend(chatId,
    `⚽ Football reminders\n\n${enabled ? 'Сейчас включены напоминания за 30 минут до матчей ЧМ-2026.' : 'Напоминания сейчас выключены.'}\n\nЧто сделать?`,
    { reply_markup: FOOTBALL_MENU }
  )
}

export async function handleFootballMatches(chatId: number | string, supabase: SupabaseClient) {
  const { data: matches, error } = await supabase
    .from('football_matches')
    .select('home_team_name, away_team_name, kickoff_at, round_name')
    .gt('kickoff_at', new Date().toISOString())
    .in('status_short', ['NS', 'TBD'])
    .not('home_team_name', 'ilike', '%Winner Match%')
    .not('home_team_name', 'ilike', '%Loser Match%')
    .not('home_team_name', 'ilike', '%TBD%')
    .not('home_team_name', 'ilike', '%TBA%')
    .not('away_team_name', 'ilike', '%Winner Match%')
    .not('away_team_name', 'ilike', '%Loser Match%')
    .not('away_team_name', 'ilike', '%TBD%')
    .not('away_team_name', 'ilike', '%TBA%')
    .order('kickoff_at', { ascending: true })
    .limit(5)

  if (error) {
    await tgSend(chatId, '⚠️ Ошибка при загрузке матчей. Попробуй позже.', { reply_markup: BACK_MENU })
    return
  }

  if (!matches?.length) {
    await tgSend(chatId, '📭 Пока нет ближайших матчей с известными командами. Попробуй позже — ESPN ещё не раскрыла пары для следующих раундов.', { reply_markup: BACK_MENU })
    return
  }

  const lines = ['Ближайшие матчи:', '']
  matches.forEach((m, i) => {
    const when = new Date(m.kickoff_at).toLocaleString('ru-RU', {
      timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
    const round = localizeRoundName(m.round_name)
    lines.push(`${i + 1}. ${m.home_team_name} — ${m.away_team_name}${round ? ` · ${round}` : ''}\n   ${when}`)
  })

  await tgSend(chatId, lines.join('\n'), { reply_markup: BACK_MENU })
}

export async function setFootballReminders(chatId: number | string, userId: string, enabled: boolean, supabase: SupabaseClient) {
  await supabase.from('football_user_settings').upsert(
    { user_id: userId, telegram_chat_id: Number(chatId), reminders_enabled: enabled },
    { onConflict: 'user_id' }
  )
  await tgSend(chatId, enabled ? '🔔 Напоминания о матчах включены.' : '🔕 Напоминания о матчах выключены.', { reply_markup: BACK_MENU })
}

export async function checkStaleness(chatId: number | string, userId: string, supabase: SupabaseClient) {
  // Свежесть считаем по самому недавнему из путей обновления: ручной экспорт
  // (imports) ИЛИ автосинк Apple Health (ingest_tokens.last_ingest_at). Иначе
  // баннер вечно нагирает «загрузи экспорт», хотя автосинк держит данные свежими.
  const [{ data: lastImport }, { data: tok }] = await Promise.all([
    supabase.from('imports').select('imported_at')
      .eq('user_id', userId).order('imported_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('ingest_tokens').select('last_ingest_at')
      .eq('user_id', userId).maybeSingle(),
  ])
  const days = daysSinceFreshData(Date.now(), lastImport?.imported_at, tok?.last_ingest_at)
  if (days != null && days >= 7) {
    await tgSend(chatId, `📲 Данные не обновлялись ${days} дн. Для точных данных загрузи свежий экспорт в Tonus (/sync — подробнее).`)
  }
}

// ── Эксперименты из бота (SPEC-EXPERIMENT-LOOP §2.1) ─────────────────────────
// Идеи генерирует suggest-experiments (service-вызов с x-user-id), каждая
// сохраняется в coach_events (type exp_suggestion) и уходит отдельным
// сообщением с кнопкой запуска expsug:<id>.
export async function handleExperimentSuggest(chatId: number | string, userId: string, supabase: SupabaseClient) {
  await tgSend(chatId, '⏳ Смотрю твои данные и придумываю эксперименты…')
  // Suggestion generation includes a Gemini round-trip — allow well past the 10 s default.
  const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/suggest-experiments`, {
    method: 'POST',
    timeoutMs: 60_000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, // gateway only; authority is x-internal-secret
      'x-internal-secret': INTERNAL_SECRET,
      'x-user-id': userId,
    },
    body: JSON.stringify({ mode: 'generate' }),
  })
  if (res.status === 402) {
    const j = await res.json().catch(() => null)
    await tgSend(chatId, j?.message ?? '💸 Лимит ИИ на сегодня исчерпан, попробуй завтра.')
    return
  }
  if (res.status === 403) {
    const j = await res.json().catch(() => null)
    if (j?.error === 'ai_consent_required') {
      await tgSend(chatId, AI_CONSENT_TELEGRAM_MESSAGE, { reply_markup: BACK_MENU })
      return
    }
  }
  if (!res.ok) {
    await tgSend(chatId, '🤔 Не получилось сгенерировать идеи, попробуй позже.', { reply_markup: BACK_MENU })
    return
  }
  const { suggestions } = await res.json().catch(() => ({ suggestions: null }))
  if (!suggestions?.length) {
    await tgSend(chatId, 'Пока недостаточно данных для идей — понадобится хотя бы неделя метрик.', { reply_markup: BACK_MENU })
    return
  }
  type Suggestion = { hypothesis: string; change_rule: string; target_metric: string; rationale: string }
  for (const s of (suggestions as Suggestion[]).slice(0, 2)) {
    const { data: ev } = await supabase.from('coach_events')
      .insert({ user_id: userId, type: 'exp_suggestion', status: 'open', payload: s })
      .select('id').single()
    if (!ev) continue
    await tgSend(chatId,
      `🧪 <b>${s.hypothesis}</b>\n\nЧто менять: ${s.change_rule}\nМетрика: ${expMetricLabel(s.target_metric)}\n${s.rationale}`,
      { reply_markup: { inline_keyboard: [[{ text: '▶️ Запустить (14 дней)', callback_data: `expsug:${ev.id}` }]] } })
  }
}

// ── Habits: passive Telegram control (SPEC habits, task 6) ─────────────────
// Deliberately no daily ping — the user opens this menu themselves via the
// "Привычки" button or /срыв, /break when a slip actually happens. Streaks
// come from the same pure logic the web app uses (_shared/habits.ts, also
// re-exported from apps/web/src/lib/habits.ts), never reimplemented here. "Today"/"yesterday" are resolved from the user's
// profile timezone (loadUserTimezone) — never current_date, never a bare
// new Date(), since the callback itself carries no timezone.

async function fetchActiveHabitsWithStreaks(
  supabase: SupabaseClient, userId: string, today: string,
): Promise<{ habit: Habit; streak: number }[]> {
  const { data: habitRows } = await supabase
    .from('habits')
    .select('id, user_id, name, note, start_date, active, sort_order, created_at')
    .eq('user_id', userId).eq('active', true)
    .order('sort_order', { ascending: true })
  const habits: Habit[] = habitRows ?? []
  if (!habits.length) return []

  const windowStart = addDays(today, -(HABIT_WINDOW_DAYS - 1))
  const { data: breakRows } = await supabase
    .from('habit_breaks')
    .select('id, habit_id, date, note')
    .eq('user_id', userId)
    .in('habit_id', habits.map(h => h.id))
    .gte('date', windowStart)
  const breaks: HabitBreak[] = breakRows ?? []

  return habits.map(habit => ({
    habit,
    streak: habitStats(habitDays(habit, breaks, today)).currentStreak,
  }))
}

export async function handleHabits(chatId: number | string, userId: string, supabase: SupabaseClient) {
  const tz = await loadUserTimezone(supabase, userId)
  const today = localDate(tz)
  const withStreaks = await fetchActiveHabitsWithStreaks(supabase, userId, today)

  if (!withStreaks.length) {
    await tgSend(chatId, '🚫 Привычек пока нет. Добавь их в приложении в разделе «Привычки».', { reply_markup: BACK_MENU })
    return
  }

  const menu = HABITS_MENU(withStreaks.map(({ habit, streak }) => ({ id: habit.id, name: habit.name, streak })))
  await tgSend(chatId, '🚫 Отметь срыв или посмотри стрик:', { reply_markup: menu })
}

export async function handleHabitMenu(chatId: number | string, userId: string, habitId: string, supabase: SupabaseClient) {
  const { data: habit } = await supabase
    .from('habits').select('id, name').eq('id', habitId).eq('user_id', userId).maybeSingle()

  if (!habit) {
    await tgSend(chatId, '⚠️ Привычка не найдена.', { reply_markup: BACK_MENU })
    return
  }

  await tgSend(chatId, `🚫 <b>${habit.name}</b>\n\nОтметить срыв или снять отметку:`, {
    parse_mode: 'HTML', reply_markup: HABIT_DAY_MENU(habitId),
  })
}

export async function handleHabitBreak(
  chatId: number | string, userId: string, habitId: string, dayOffset: number, broken: boolean,
  supabase: SupabaseClient,
) {
  const tz = await loadUserTimezone(supabase, userId)
  const today = localDate(tz)
  const date = dayOffset === 1 ? addDays(today, -1) : today
  const label = dayOffset === 1 ? 'вчера' : 'сегодня'

  const { error } = await supabase.rpc('set_habit_break', {
    p_user_id: userId, p_habit_id: habitId, p_date: date, p_broken: broken,
  })

  if (error) {
    await tgSend(chatId, `⚠️ Не удалось сохранить (${date} может быть раньше старта привычки).`, { reply_markup: BACK_MENU })
    return
  }

  const text = broken ? `💥 Отметил срыв ${label} (${date}).` : `✅ Снял отметку срыва за ${label} (${date}).`
  await tgSend(chatId, text, { reply_markup: BACK_MENU })
}
