import { describe, it, expect } from 'vitest'
import { getMonthlyStats } from './streak-stats'
import type { DailyMetrics } from '../types'

function metric(date: string, hasData = true): DailyMetrics {
  return {
    date,
    ...(hasData ? { steps: 12000 } : {}),
  }
}

describe('getMonthlyStats', () => {
  it('counts active days in the given month and year', () => {
    const data: DailyMetrics[] = [
      metric('2026-07-01'),
      metric('2026-07-02'),
      metric('2026-07-03', false),
      metric('2026-07-05'),
      metric('2026-06-30'), // different month
    ]
    const stats = getMonthlyStats(data, 2026, 7)
    expect(stats.activeDays).toBe(3)
    expect(stats.totalDays).toBe(31)
  })

  it('handles months with 30 days', () => {
    const data: DailyMetrics[] = [
      metric('2026-06-01'),
      metric('2026-06-30'),
    ]
    const stats = getMonthlyStats(data, 2026, 6)
    expect(stats.totalDays).toBe(30)
  })

  it('handles february leap year', () => {
    const stats = getMonthlyStats([], 2024, 2)
    expect(stats.totalDays).toBe(29)
  })

  it('handles february non-leap year', () => {
    const stats = getMonthlyStats([], 2023, 2)
    expect(stats.totalDays).toBe(28)
  })
})
