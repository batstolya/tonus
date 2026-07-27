import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { computeDailyScores, type DailyScore, type ScoreInput } from './scores'
import { daysSinceFreshData } from '../../../supabase/functions/_shared/staleness.ts'

// Данные для экрана Today. Клиент передаётся аргументом, а не берётся
// синглтоном: только так модуль тестируется поддельным клиентом — без сети,
// устройства и входа в аккаунт.

/** Сколько дней тренда показываем. */
export const DISPLAY_DAYS = 14

/**
 * Сколько дней грузим. НЕ равно DISPLAY_DAYS и не должно ему равняться:
 * computeDailyScores пропускает дни, у которых меньше 5 предшествующих, и
 * строит базовую линию по 30 предыдущим. Запросив только окно показа, мы
 * получили бы меньше точек И посчитали бы их по обрезанной истории — цифры
 * разошлись бы с вебом, оставаясь правдоподобными на вид.
 */
export const FETCH_DAYS = DISPLAY_DAYS + 35

/** Цель дня — та же, что на вебе: 7000 шагов ИЛИ 30 минут упражнений. */
const STEP_GOAL = 7000
const EXERCISE_GOAL_MINUTES = 30

export interface TrendPoint {
  date: string
  readiness: number | null
}

export interface TodayData {
  hasData: boolean
  /** Самый свежий день, для которого есть оценки. Утром это может быть вчера. */
  latest: { date: string; isToday: boolean; score: DailyScore } | null
  trend: TrendPoint[]
  sleep: { hours: number; deep: number | null; rem: number | null } | null
  activity: { steps: number | null; exerciseMinutes: number | null; goalMet: boolean }
  /** Полных суток с последнего обновления данных; null — сигналов нет вовсе. */
  staleDays: number | null
}

interface MetricRow {
  date: string
  metric: string
  avg_val?: number | null
  sum_val?: number | null
}

interface SleepRow {
  date: string
  duration_hours?: number | null
  deep_hours?: number | null
  rem_hours?: number | null
}

/** Локальная дата YYYY-MM-DD: сутки считаются по часам пользователя. */
function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Суммарные метрики дедуплицируются максимумом по источникам — как на сервере. */
function maxSum(current: number | null, incoming: number | null | undefined): number | null {
  if (incoming == null) return current
  return current == null ? incoming : Math.max(current, incoming)
}

export async function loadTodayData(
  client: SupabaseClient<Database>,
  userId: string,
  now: Date,
): Promise<TodayData> {
  const from = new Date(now)
  from.setDate(from.getDate() - FETCH_DAYS)
  const fromDate = localDay(from)

  const [metricsRes, sleepRes, tokenRes, importRes] = await Promise.all([
    client.from('metrics_daily').select('date, metric, avg_val, sum_val')
      .eq('user_id', userId).gte('date', fromDate),
    client.from('sleep_sessions').select('date, duration_hours, deep_hours, rem_hours')
      .eq('user_id', userId).gte('date', fromDate),
    client.from('ingest_tokens').select('last_ingest_at').eq('user_id', userId).maybeSingle(),
    client.from('imports').select('imported_at').eq('user_id', userId)
      .order('imported_at', { ascending: false }).limit(1),
  ])

  // Длинная таблица → один объект на день. Именно metrics_daily, а не вью
  // daily_metrics: во вью нет exerciseMinutes, а он нужен для цели дня.
  const byDate = new Map<string, ScoreInput & { steps: number | null; exerciseMinutes: number | null }>()
  const ensure = (date: string) => {
    const existing = byDate.get(date)
    if (existing) return existing
    const fresh = { date, hrv: null, restingHeartRate: null, sleepHours: null, steps: null, exerciseMinutes: null }
    byDate.set(date, fresh)
    return fresh
  }

  for (const row of (metricsRes.data ?? []) as MetricRow[]) {
    const day = ensure(row.date)
    switch (row.metric) {
      case 'hrv': day.hrv = row.avg_val ?? day.hrv; break
      case 'restingHeartRate': day.restingHeartRate = row.avg_val ?? day.restingHeartRate; break
      case 'steps': day.steps = maxSum(day.steps, row.sum_val); break
      case 'exerciseMinutes': day.exerciseMinutes = maxSum(day.exerciseMinutes, row.sum_val); break
    }
  }

  // При фрагментах ночи берём основной сон — самый длинный, как это делает веб.
  const bestSleep = new Map<string, SleepRow>()
  for (const row of (sleepRes.data ?? []) as SleepRow[]) {
    const current = bestSleep.get(row.date)
    if (!current || (row.duration_hours ?? 0) > (current.duration_hours ?? 0)) {
      bestSleep.set(row.date, row)
    }
  }
  for (const [date, row] of bestSleep) {
    ensure(date).sleepHours = row.duration_hours ?? null
  }

  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  const scores = computeDailyScores(days)
  const scoreByDate = new Map(scores.map(s => [s.date, s]))

  const today = localDay(now)
  // Самый свежий день С ГОТОВНОСТЬЮ, а не просто последняя строка оценок: у дня
  // может быть строка, но readiness = null (например, есть сон, но нет ВСР).
  // Показать такой день героем — вывести «недостаточно данных» поверх экрана,
  // полного данных; поймано на настоящих данных в симуляторе.
  const latestScore = [...scores].reverse().find(s => s.readiness != null) ?? scores.at(-1) ?? null
  const latest = latestScore
    ? { date: latestScore.date, isToday: latestScore.date === today, score: latestScore }
    : null

  const trend: TrendPoint[] = days
    .slice(-DISPLAY_DAYS)
    .map(d => ({ date: d.date, readiness: scoreByDate.get(d.date)?.readiness ?? null }))

  const latestDay = latest ? byDate.get(latest.date) ?? null : null
  const sleepRow = latest ? bestSleep.get(latest.date) ?? null : null

  const steps = latestDay?.steps ?? null
  const exerciseMinutes = latestDay?.exerciseMinutes ?? null

  const importedAt = (importRes.data as { imported_at?: string }[] | null)?.[0]?.imported_at
  const lastIngestAt = (tokenRes.data as { last_ingest_at?: string } | null)?.last_ingest_at

  return {
    hasData: days.length > 0,
    latest,
    trend: latest ? trend : [],
    sleep: sleepRow?.duration_hours != null
      ? { hours: sleepRow.duration_hours, deep: sleepRow.deep_hours ?? null, rem: sleepRow.rem_hours ?? null }
      : null,
    activity: {
      steps,
      exerciseMinutes,
      goalMet: (steps ?? 0) >= STEP_GOAL || (exerciseMinutes ?? 0) >= EXERCISE_GOAL_MINUTES,
    },
    staleDays: daysSinceFreshData(now.getTime(), importedAt, lastIngestAt),
  }
}
