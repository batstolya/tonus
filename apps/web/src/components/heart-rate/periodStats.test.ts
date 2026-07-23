import { describe, it, expect } from 'vitest'
import { computePeriodStats } from './periodStats'
import type { DailyMetrics } from '../../types'

const day = (date: string, avg: number | null, max: number | null, resting: number | null): DailyMetrics =>
  ({
    date,
    heartRate: avg !== null && max !== null ? { avg, max, min: 40 } : undefined,
    restingHeartRate: resting ?? undefined,
  }) as DailyMetrics

describe('computePeriodStats', () => {
  it('averages avg/resting and takes max over the given days only', () => {
    const days = [
      day('2026-07-01', 70, 120, 50),
      day('2026-07-02', 80, 186, null),
      day('2026-07-03', 90, 130, 46),
    ]
    expect(computePeriodStats(days)).toEqual({ avg: 80, resting: 48, max: 186 })
  })

  it('returns nulls when there is no data', () => {
    expect(computePeriodStats([])).toEqual({ avg: null, resting: null, max: null })
  })

  it('ignores days outside the slice the caller filtered (stats follow the period)', () => {
    const period = [day('2026-07-03', 77, 102, 42)]
    expect(computePeriodStats(period)).toEqual({ avg: 77, resting: 42, max: 102 })
  })
})
