import { describe, it, expect } from 'vitest'
import { computeStreak, getWeeklyRecord, FREEZE_EARN_EVERY, MAX_FREEZES, WEEKLY_MIN_DAYS } from './streak'
import type { DailyMetrics } from '../types'

// Build a DailyMetrics with `steps` so the day counts as "active".
function day(date: string): DailyMetrics {
  return { date, steps: 5000 }
}
// A day present in the array but with no core metric → NOT active.
function emptyDay(date: string): DailyMetrics {
  return { date }
}
// Generate N consecutive active days ending on `end` (inclusive), oldest first.
function run(end: string, n: number): DailyMetrics[] {
  const out: DailyMetrics[] = []
  const base = new Date(end + 'T12:00:00')
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    out.push(day(d.toISOString().slice(0, 10)))
  }
  return out
}

const TODAY = new Date('2026-07-09T12:00:00') // Thursday

describe('computeStreak', () => {
  it('returns all-zero for empty input', () => {
    const s = computeStreak([], TODAY)
    expect(s).toEqual({ current: 0, freezesAvailable: 0, freezesSpent: 0, weekly: 0, todayPending: false, frozenDates: [] })
  })

  it('counts consecutive active days ending today', () => {
    const s = computeStreak(run('2026-07-09', 3), TODAY)
    expect(s.current).toBe(3)
    expect(s.todayPending).toBe(false)
  })

  it('keeps streak alive and flags todayPending when today has no data yet', () => {
    const s = computeStreak(run('2026-07-08', 3), TODAY) // last active day = yesterday
    expect(s.current).toBe(3)
    expect(s.todayPending).toBe(true)
  })

  it('a day present but with no core metric does not count as active', () => {
    const daily = [...run('2026-07-08', 2), emptyDay('2026-07-09')]
    const s = computeStreak(daily, TODAY)
    expect(s.current).toBe(2)
    expect(s.todayPending).toBe(true)
  })

  it('earns one freeze per 7 streak days, capped at MAX_FREEZES', () => {
    const s = computeStreak(run('2026-07-09', 21), TODAY)
    expect(FREEZE_EARN_EVERY).toBe(7)
    expect(s.freezesAvailable).toBe(Math.min(MAX_FREEZES, 3))
  })

  it('spends a freeze to bridge a one-day gap', () => {
    // 8-day run ending 07-07 earns 1 freeze (on day 7), which bridges the
    // 07-08 gap; today (07-09) is pending.
    const daily = run('2026-07-07', 8)
    const s = computeStreak(daily, TODAY)
    expect(s.current).toBe(8)
    expect(s.freezesSpent).toBe(1)
    expect(s.frozenDates).toContain('2026-07-08')
  })

  it('breaks when a gap cannot be bridged (no freeze earned yet)', () => {
    // 1 day, 2-day gap without freezes, then 2 recent days.
    const daily = [day('2026-07-05'), day('2026-07-08'), day('2026-07-09')]
    const s = computeStreak(daily, TODAY)
    expect(s.current).toBe(2) // 07-08, 07-09; the 07-06/07-07 gap had no freeze
    expect(s.freezesSpent).toBe(0)
  })

  it('counts consecutive weeks with enough active days', () => {
    const s = computeStreak(run('2026-07-09', 14), TODAY)
    expect(WEEKLY_MIN_DAYS).toBe(5)
    expect(s.weekly).toBeGreaterThanOrEqual(1)
  })
})

describe('getWeeklyRecord', () => {
  // Тиждень Пн-Нд з n активними днями від понеділка `monday`.
  function week(monday: string, n: number): DailyMetrics[] {
    const out: DailyMetrics[] = []
    const start = new Date(monday + 'T12:00:00')
    for (let i = 0; i < n; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      out.push(day(d.toISOString().slice(0, 10)))
    }
    return out
  }

  it('returns 0 for empty data', () => {
    expect(getWeeklyRecord([], new Date('2026-07-10T12:00:00'))).toBe(0)
  })

  it('returns 0 when no week reaches the threshold', () => {
    expect(getWeeklyRecord(week('2026-06-01', 4), new Date('2026-07-10T12:00:00'))).toBe(0)
  })

  it('finds the longest run even if it is not the last one', () => {
    const data = [
      ...week('2026-05-04', 5), ...week('2026-05-11', 5), ...week('2026-05-18', 5), // 3 тижні
      ...week('2026-05-25', 2),                                                     // розрив
      ...week('2026-06-01', 5), ...week('2026-06-08', 5),                           // 2 тижні
    ]
    expect(getWeeklyRecord(data, new Date('2026-06-14T12:00:00'))).toBe(3)
  })

  it('counts the current partial week only once it reaches the threshold', () => {
    const base = [...week('2026-06-29', 7)] // повний минулий тиждень
    // Поточний тиждень (Пн 2026-07-06), сьогодні п'ятниця 2026-07-10: 5 активних днів.
    const reached = [...base, ...week('2026-07-06', 5)]
    expect(getWeeklyRecord(reached, new Date('2026-07-10T12:00:00'))).toBe(2)
    // З 4 днями поточний тиждень ще не рахується.
    const notReached = [...base, ...week('2026-07-06', 4)]
    expect(getWeeklyRecord(notReached, new Date('2026-07-10T12:00:00'))).toBe(1)
  })
})
