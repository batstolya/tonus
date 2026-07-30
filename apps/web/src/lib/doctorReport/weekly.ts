import type { DailyMetrics } from '../../types'
import { METRIC_DEFS, addDays, avg, localDate, periodSlice, periodStart, type MetricKey } from './metrics'

/** Metrics dense enough to be worth a column in the weekly table. */
export const WEEKLY_KEYS: MetricKey[] = ['rhr', 'hrv', 'sleep', 'deep', 'rem', 'spo2', 'resp', 'steps', 'exer']

export function mondayOf(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  return addDays(date, -((d.getUTCDay() + 6) % 7))
}

export interface WeekBucket { weekStart: string; rows: DailyMetrics[] }

export function weekBuckets(daily: DailyMetrics[], periodDays: number, today: string = localDate()): WeekBucket[] {
  const weeks = new Map<string, DailyMetrics[]>()
  for (const d of periodSlice(daily, periodDays, today)) {
    const wk = mondayOf(d.date)
    weeks.set(wk, [...(weeks.get(wk) ?? []), d])
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, rows]) => ({ weekStart, rows }))
}

export interface WeeklyRow {
  weekStart: string
  days: number
  values: Partial<Record<MetricKey, number>>
}

export function weeklyRows(daily: DailyMetrics[], periodDays: number, today: string = localDate()): WeeklyRow[] {
  return weekBuckets(daily, periodDays, today).map(({ weekStart, rows }) => {
    const values: Partial<Record<MetricKey, number>> = {}
    for (const m of METRIC_DEFS) {
      const v = rows.map(m.get).filter((x): x is number => typeof x === 'number')
      if (v.length) values[m.key] = +avg(v).toFixed(m.digits)
    }
    return { weekStart, days: rows.length, values }
  })
}

export interface CoverageGap {
  key: MetricKey
  label: string
  daysWithData: number
  daysInPeriod: number
  missingPct: number
}

/**
 * Coverage is reported, not corrected: a language model reading the report
 * treats silence as normality unless the gaps are spelled out.
 */
export function coverage(
  daily: DailyMetrics[],
  periodDays: number,
  today: string = localDate(),
): { gaps: CoverageGap[]; missingDates: string[] } {
  const slice = periodSlice(daily, periodDays, today)
  const gaps: CoverageGap[] = []
  for (const m of METRIC_DEFS) {
    const withData = slice.filter(d => typeof m.get(d) === 'number').length
    if (!withData || !slice.length) continue
    const missingPct = Math.round((1 - withData / slice.length) * 100)
    if (missingPct >= 10) {
      gaps.push({ key: m.key, label: m.label, daysWithData: withData, daysInPeriod: slice.length, missingPct })
    }
  }
  const have = new Set(slice.map(d => d.date))
  const start = periodStart(periodDays, today)
  const missingDates: string[] = []
  for (let i = 0; i < periodDays; i++) {
    const date = addDays(start, i)
    if (date > today) break
    if (!have.has(date)) missingDates.push(date)
  }
  return { gaps, missingDates }
}
