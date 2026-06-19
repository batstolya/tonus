import type { DailyMetrics } from '../types'
import { supabase } from './supabase'

// Канонический расчёт дневных оценок и персональной базовой линии.
// Один источник правды для дашборда, коуча и ИИ-контекста (#4).

export interface DailyScore {
  date: string
  readiness: number | null
  sleep_score: number | null
  recovery_score: number | null
  stress_score: number | null
  hrv_baseline: number | null
  rhr_baseline: number | null
  sleep_baseline: number | null
  steps_baseline: number | null
}

function avg(vals: (number | null | undefined)[]): number | null {
  const v = vals.filter((x): x is number => x != null && !isNaN(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))

// Считает оценки для каждого дня по скользящей базовой линии (до 30 дней ДО этого дня).
export function computeDailyScores(daily: DailyMetrics[]): DailyScore[] {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const out: DailyScore[] = []

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i]
    const prior = sorted.slice(Math.max(0, i - 30), i) // строго до текущего дня
    if (prior.length < 5) continue // мало истории для базовой линии

    const hrvBase = avg(prior.map(x => x.hrv))
    const rhrBase = avg(prior.map(x => x.restingHeartRate))
    const sleepBase = avg(prior.map(x => x.sleepHours))
    const stepsBase = avg(prior.map(x => x.steps))

    const hrv = d.hrv ?? null
    const rhr = d.restingHeartRate ?? null
    const sleep = d.sleepHours ?? null

    // recovery: HRV относительно нормы (выше = лучше) + пульс покоя (ниже = лучше)
    let recovery: number | null = null
    const recParts: number[] = []
    if (hrv != null && hrvBase) recParts.push(clamp((hrv / hrvBase) * 100) * 0.6)
    if (rhr != null && rhrBase) recParts.push(clamp((rhrBase / rhr) * 100) * 0.4)
    if (recParts.length) {
      const w = (hrv != null && hrvBase ? 0.6 : 0) + (rhr != null && rhrBase ? 0.4 : 0)
      recovery = Math.round(recParts.reduce((a, b) => a + b, 0) / w)
    }

    // sleep: 8ч = 100
    const sleepScore = sleep != null ? Math.round(clamp((sleep / 8) * 100)) : null

    // readiness: взвешенно HRV(40)+RHR(30)+сон(30) относительно нормы
    let hrvS: number | null = null, rhrS: number | null = null, slS: number | null = null
    if (hrv != null) hrvS = hrvBase ? clamp(40 * (hrv / hrvBase), 0, 40) : clamp(40 * (hrv / 50), 0, 40)
    if (rhr != null) rhrS = rhrBase ? clamp(30 * (rhrBase / rhr), 0, 30) : clamp(30 * (55 / rhr), 0, 30)
    if (sleep != null) slS = clamp(30 * (sleep / 8), 0, 30)
    const rParts = [hrvS, rhrS, slS].filter((v): v is number => v != null)
    const maxP = (hrvS != null ? 40 : 0) + (rhrS != null ? 30 : 0) + (slS != null ? 30 : 0)
    const readiness = rParts.length && maxP ? Math.round((rParts.reduce((a, b) => a + b, 0) / maxP) * 100) : null

    // stress: обратно к восстановлению
    const stress = recovery != null ? clamp(100 - recovery) : null

    out.push({
      date: d.date,
      readiness, sleep_score: sleepScore, recovery_score: recovery, stress_score: stress,
      hrv_baseline: hrvBase, rhr_baseline: rhrBase, sleep_baseline: sleepBase, steps_baseline: stepsBase,
    })
  }
  return out
}

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
