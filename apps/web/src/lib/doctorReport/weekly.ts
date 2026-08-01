import type { DailyMetrics } from '../../types'
import { addDays } from './dates'
import { avg } from './math'
import { METRIC_DEFS, frameSlice, type MetricKey, type PeriodFrame } from './metrics'

/** Metrics dense enough to be worth a column in the weekly table. */
export const WEEKLY_KEYS: MetricKey[] = ['rhr', 'hrv', 'sleep', 'deep', 'rem', 'spo2', 'resp', 'steps', 'exer']

/** Days of a metric a week needs before its mean is printed as a weekly value. */
export const MIN_WEEK_DAYS = 3

export function mondayOf(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  return addDays(date, -((d.getUTCDay() + 6) % 7))
}

export interface WeekBucket { weekStart: string; rows: DailyMetrics[] }

export function weekBuckets(daily: DailyMetrics[], frame: PeriodFrame): WeekBucket[] {
  const weeks = new Map<string, DailyMetrics[]>()
  for (const d of frameSlice(daily, frame)) {
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

export function weeklyRows(daily: DailyMetrics[], frame: PeriodFrame): WeeklyRow[] {
  return weekBuckets(daily, frame).map(({ weekStart, rows }) => {
    const values: Partial<Record<MetricKey, number>> = {}
    for (const m of METRIC_DEFS) {
      const v = rows.map(m.get).filter((x): x is number => typeof x === 'number')
      if (v.length >= MIN_WEEK_DAYS) values[m.key] = +avg(v).toFixed(m.digits)
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
  frame: PeriodFrame,
): { gaps: CoverageGap[]; missingDates: string[] } {
  const slice = frameSlice(daily, frame)
  const gaps: CoverageGap[] = []
  for (const m of METRIC_DEFS) {
    const withData = slice.filter(d => typeof m.get(d) === 'number').length
    if (!withData) continue
    const missingPct = Math.round((1 - withData / frame.calendarDays) * 100)
    if (missingPct >= 10) {
      gaps.push({ key: m.key, label: m.label, daysWithData: withData, daysInPeriod: frame.calendarDays, missingPct })
    }
  }
  const have = new Set(slice.map(d => d.date))
  const missingDates: string[] = []
  for (let date = frame.effectiveStart; date <= frame.end; date = addDays(date, 1)) {
    if (!have.has(date)) missingDates.push(date)
  }
  return { gaps, missingDates }
}
