import type { DailyMetrics } from '../../types'
import { METRIC_DEFS, avg, localDate, type MetricKey } from './metrics'
import { weekBuckets } from './weekly'

export function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Median absolute deviation, scaled to sigma. Unlike sigma, a single bad week
 * does not widen the spread that is supposed to expose it.
 */
export function mad(v: number[]): number {
  const med = median(v)
  return 1.4826 * median(v.map(x => Math.abs(x - med)))
}

export interface Deviation {
  key: MetricKey
  label: string
  digits: number
  weekMean: number
  median: number
  relPct: number
  z: number
}

export interface DeviationWeek {
  weekStart: string
  days: number
  items: Deviation[]
}

/** A week needs this many days before its mean is trustworthy. */
const MIN_DAYS = 5
/** Weekly means needed before the median of them means anything. */
const MIN_WEEKS = 5
/** Robust z above which a week counts as unusual. */
const MIN_Z = 2

/**
 * Weeks whose mean is both statistically unusual (2 MAD from the median of
 * weekly means) and practically large (past the metric's own minRel). Daily
 * spread is always wider than a weekly shift, so comparison happens between
 * weeks, never between days.
 */
export function detectDeviations(
  daily: DailyMetrics[],
  periodDays: number,
  today: string = localDate(),
): DeviationWeek[] {
  const buckets = weekBuckets(daily, periodDays, today)
  const found: (Deviation & { weekStart: string; days: number })[] = []

  for (const m of METRIC_DEFS) {
    const weekly = buckets
      .map(b => {
        const v = b.rows.map(m.get).filter((x): x is number => typeof x === 'number')
        return { weekStart: b.weekStart, days: v.length, mean: v.length >= MIN_DAYS ? avg(v) : null }
      })
      .filter((w): w is { weekStart: string; days: number; mean: number } => w.mean != null)
    if (weekly.length < MIN_WEEKS) continue

    const means = weekly.map(w => w.mean)
    const med = median(means)
    const spread = mad(means)
    if (!med) continue

    for (const w of weekly) {
      // A zero spread means every other week sat on the median, so any move at
      // all is unusual. Dropping the metric here would hide exactly the weeks
      // this function exists to find; the practical minRel below still applies.
      const z = spread ? Math.abs(w.mean - med) / spread : Infinity
      const relPct = ((w.mean - med) / med) * 100
      if (z < MIN_Z || Math.abs(relPct) < m.minRel) continue
      found.push({
        key: m.key,
        label: m.label,
        digits: m.digits,
        weekMean: +w.mean.toFixed(m.digits),
        median: +med.toFixed(m.digits),
        relPct: Math.round(relPct),
        z,
        weekStart: w.weekStart,
        days: w.days,
      })
    }
  }

  // Grouped by week, not ranked by strength: sleep, resting HR and steps
  // moving together is one event, and a flat list hides that.
  const byWeek = new Map<string, DeviationWeek>()
  for (const f of found.sort((a, b) => b.z - a.z)) {
    const week = byWeek.get(f.weekStart) ?? { weekStart: f.weekStart, days: f.days, items: [] }
    week.items.push({
      key: f.key, label: f.label, digits: f.digits,
      weekMean: f.weekMean, median: f.median, relPct: f.relPct, z: f.z,
    })
    byWeek.set(f.weekStart, week)
  }
  return [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}
