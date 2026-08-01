import { addDays } from './dates'

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
