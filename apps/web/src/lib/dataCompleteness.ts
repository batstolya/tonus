import type { DailyMetrics } from '../types'

export interface GapInfo {
  metric: string
  label: string
  missingDays: number
  totalDays: number
}

const TRACKED: { key: keyof DailyMetrics; label: string }[] = [
  { key: 'hrv', label: 'HRV' },
  { key: 'restingHeartRate', label: 'Пульс покоя' },
  { key: 'sleepHours', label: 'Сон' },
  { key: 'steps', label: 'Шаги' },
  { key: 'activeEnergy', label: 'Калории' },
  { key: 'oxygenSaturation', label: 'SpO₂' },
]

/**
 * Metrics with missing days inside the trailing window.
 *
 * `today` is injectable so callers that already work from a fixed date — the
 * bell builds its items that way — stay testable instead of depending on the
 * wall clock.
 */
export function computeGaps(daily: DailyMetrics[], days = 14, today: Date = new Date()): GapInfo[] {
  if (!daily.length) return []
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const inPeriod = daily.filter(d => d.date >= cutoffStr)
  if (!inPeriod.length) return []

  const gaps: GapInfo[] = []
  for (const { key, label } of TRACKED) {
    const present = inPeriod.filter(d => d[key] != null && d[key] !== undefined).length
    const missing = inPeriod.length - present
    if (missing > 0) gaps.push({ metric: key, label, missingDays: missing, totalDays: inPeriod.length })
  }
  return gaps.sort((a, b) => b.missingDays - a.missingDays)
}

export function completenessScore(daily: DailyMetrics[], days = 14): number {
  const gaps = computeGaps(daily, days)
  if (!gaps.length) return 100
  const total = TRACKED.length * Math.min(daily.filter(d => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
    return d.date >= cutoff.toISOString().slice(0, 10)
  }).length, days)
  const missing = gaps.reduce((s, g) => s + g.missingDays, 0)
  return Math.round(((total - missing) / total) * 100)
}
