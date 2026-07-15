import type { DailyMetrics } from '../types'
import { supabase } from './supabase'
import { computeDailyScores, avg } from '../../supabase/functions/_shared/scores'

// Формулы дневных оценок живут в ОДНОМ месте — supabase/functions/_shared/scores.ts
// (чистый модуль, его же импортирует ingest-health). Этот файл — клиентский фасад:
// re-export расчёта + браузерные надстройки (persist в supabase, отклонения от нормы).
// After changing formulas, release ingest-health through the canonical reviewed
// Edge Function wrapper so the server does not keep the previous calculation.

export { computeDailyScores }
export type { DailyScore, ScoreInput } from '../../supabase/functions/_shared/scores'

export interface BaselineDeviation {
  metric: 'hrv' | 'rhr' | 'sleep' | 'steps'
  current: number
  baseline: number
  pct: number // отклонение от нормы, %
}

// Текущее отклонение (среднее за 3 дня) от персональной нормы (30 дней).
export function baselineDeviations(daily: DailyMetrics[]): BaselineDeviation[] {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 10) return []
  const base = sorted.slice(-33, -3)
  const recent = sorted.slice(-3)
  const defs: { metric: BaselineDeviation['metric']; cur: number | null; b: number | null }[] = [
    { metric: 'hrv', cur: avg(recent.map(d => d.hrv)), b: avg(base.map(d => d.hrv)) },
    { metric: 'rhr', cur: avg(recent.map(d => d.restingHeartRate)), b: avg(base.map(d => d.restingHeartRate)) },
    { metric: 'sleep', cur: avg(recent.map(d => d.sleepHours)), b: avg(base.map(d => d.sleepHours)) },
    { metric: 'steps', cur: avg(recent.map(d => d.steps)), b: avg(base.map(d => d.steps)) },
  ]
  return defs
    .filter(x => x.cur != null && x.b != null && x.b! > 0)
    .map(x => ({ metric: x.metric, current: x.cur!, baseline: x.b!, pct: Math.round(((x.cur! - x.b!) / x.b!) * 100) }))
}

// Сохраняет рассчитанные оценки в daily_scores (последние 90 дней).
export async function persistDailyScores(userId: string, daily: DailyMetrics[]): Promise<void> {
  const scores = computeDailyScores(daily).slice(-90)
  if (!scores.length) return
  const rows = scores.map(s => ({
    user_id: userId,
    date: s.date,
    readiness: s.readiness,
    sleep_score: s.sleep_score,
    recovery_score: s.recovery_score,
    stress_score: s.stress_score,
    hrv_baseline: s.hrv_baseline,
    rhr_baseline: s.rhr_baseline,
    sleep_baseline: s.sleep_baseline,
    steps_baseline: s.steps_baseline,
    updated_at: new Date().toISOString(),
  }))
  await supabase.from('daily_scores').upsert(rows, { onConflict: 'user_id,date' })
}
