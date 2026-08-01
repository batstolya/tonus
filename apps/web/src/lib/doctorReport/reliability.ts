import { addDays } from './dates'
import { quantile } from './math'

// How much of the period a metric covers, and what that permits the report to
// say. Measured values print at every band; only derived claims are gated.

export type Band = 'high' | 'medium' | 'low' | 'insufficient'

export interface Reliability {
  daysWithData: number
  daysInPeriod: number
  coveragePct: number
  band: Band
  /** Longest run of consecutive days with no value for this metric. */
  maxGap: number
}

export const bandOf = (pct: number): Band =>
  pct >= 80 ? 'high' : pct >= 60 ? 'medium' : pct >= 40 ? 'low' : 'insufficient'

/** Baseline comparisons, deviations and trends need this; raw values do not. */
export const supportsClaims = (band: Band): boolean => band === 'high' || band === 'medium'

export function reliabilityOf(datesWithValue: Set<string>, start: string, end: string): Reliability {
  let daysInPeriod = 0
  let daysWithData = 0
  let gap = 0
  let maxGap = 0
  for (let date = start; date <= end; date = addDays(date, 1)) {
    daysInPeriod++
    if (datesWithValue.has(date)) {
      daysWithData++
      gap = 0
    } else {
      gap++
      if (gap > maxGap) maxGap = gap
    }
  }
  const pct = daysInPeriod ? (daysWithData / daysInPeriod) * 100 : 0
  return { daysWithData, daysInPeriod, coveragePct: Math.round(pct), band: bandOf(pct), maxGap }
}

export const BAND_TEXT: Record<Band, string> = {
  high: 'высокая', medium: 'средняя', low: 'низкая', insufficient: 'недостаточная',
}

/** Days before the period start the baseline is built from. */
export const BASELINE_WINDOW_DAYS = 28
/** Values that window must hold before the comparison is printed at all. */
export const MIN_BASELINE_DAYS = 14

export interface Baseline {
  median: number
  /** 25th and 75th percentile of the same window — the usual spread. */
  lo: number
  hi: number
  days: number
  position: 'inside' | 'above' | 'below'
}

/**
 * A median and a range, not a percentage: +4% on a resting heart rate of 48 is
 * two beats and noise, the same +4% on HRV is not. A range says which one the
 * reader is looking at.
 */
export function baselineOf(values: number[], current: number, digits: number): Baseline | null {
  if (values.length < MIN_BASELINE_DAYS) return null
  const round = (n: number) => +n.toFixed(digits)
  const lo = round(quantile(values, 0.25))
  const hi = round(quantile(values, 0.75))
  return {
    median: round(quantile(values, 0.5)),
    lo,
    hi,
    days: values.length,
    position: current > hi ? 'above' : current < lo ? 'below' : 'inside',
  }
}

export const POSITION_TEXT: Record<Baseline['position'], string> = {
  inside: 'внутри диапазона', above: 'выше диапазона', below: 'ниже диапазона',
}
