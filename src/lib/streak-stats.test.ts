import { describe, it, expect } from 'vitest'
import { getMonthlyStats, getAllStreakRecords, getMilestoneProgress } from './streak-stats'
import type { DailyMetrics } from '../types'

function metric(date: string, hasData = true): DailyMetrics {
  return {
    date,
    ...(hasData ? { steps: 5000 } : {}),
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

describe('getAllStreakRecords', () => {
  it('identifies all streak runs, including current', () => {
    const data: DailyMetrics[] = [
      metric('2026-06-01'), // streak 1: 5 days
      metric('2026-06-02'),
      metric('2026-06-03'),
      metric('2026-06-04'),
      metric('2026-06-05'),
      metric('2026-06-06', false), // gap
      metric('2026-06-07'), // streak 2: 3 days
      metric('2026-06-08'),
      metric('2026-06-09'),
      metric('2026-07-01', false), // gap
      metric('2026-07-02'), // streak 3: 2 days (current)
      metric('2026-07-03'),
    ]
    const records = getAllStreakRecords(data, new Date('2026-07-03'))
    expect(records.length).toBe(3)
    expect(records[0].days).toBe(5)
    expect(records[0].startDate).toBe('2026-06-01')
    expect(records[1].days).toBe(3)
    expect(records[1].startDate).toBe('2026-06-07')
    expect(records[2].days).toBe(2)
    expect(records[2].startDate).toBe('2026-07-02')
    expect(records[2].isCurrent).toBe(true)
  })

  it('marks finished streaks as non-current', () => {
    const data: DailyMetrics[] = [
      metric('2026-06-01'),
      metric('2026-06-02'),
      metric('2026-06-03', false), // streak ends
    ]
    const records = getAllStreakRecords(data, new Date('2026-07-04'))
    expect(records[0].isCurrent).toBe(false)
  })

  it('returns empty list if no active days', () => {
    const data: DailyMetrics[] = [
      metric('2026-06-01', false),
      metric('2026-06-02', false),
    ]
    const records = getAllStreakRecords(data)
    expect(records).toHaveLength(0)
  })
})

describe('getMilestoneProgress', () => {
  it('finds next milestone and progress toward it', () => {
    const progress = getMilestoneProgress(45)
    expect(progress).not.toBeNull()
    expect(progress!.nextMilestone).toBe(50)
    expect(progress!.daysToGo).toBe(5)
    expect(progress!.percent).toBe(90)
  })

  it('returns null when at a major milestone', () => {
    expect(getMilestoneProgress(10)).toBeNull()
    expect(getMilestoneProgress(365)).toBeNull()
    expect(getMilestoneProgress(1000)).toBeNull()
  })

  it('works for milestone 1', () => {
    const progress = getMilestoneProgress(5)
    expect(progress).not.toBeNull()
    expect(progress!.nextMilestone).toBe(10)
    expect(progress!.daysToGo).toBe(5)
  })
})
