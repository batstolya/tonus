import { describe, it, expect } from 'vitest'
import { buildSleep } from './sleep'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'

describe('buildSleep', () => {
  it('returns one row per night with phase shares', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-07-30', sleepHours: 8, sleepDeep: 2, sleepREM: 1.6, sleepCore: 4.4 },
      { date: '2026-07-31', sleepHours: 5.5 },
    ]
    const s = buildSleep(daily, 30, today)!
    expect(s.nights).toHaveLength(2)
    expect(s.nights[0].deepPct).toBe(25)
    expect(s.nights[0].remPct).toBe(20)
    expect(s.nights[1].deepPct).toBeNull()
    expect(s.nights[0].weekday).toBe('Чт')
  })

  it('counts short, long, missing and implausible nights', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-07-28', sleepHours: 5 },
      { date: '2026-07-29', sleepHours: 8.2 },
      { date: '2026-07-30' },
      // wake time earlier than bedtime + duration: the source is wrong
      { date: '2026-07-31', sleepHours: 9, sleepBedtime: '2026-07-30T23:00:00Z', sleepWakeTime: '2026-07-31T06:00:00Z' },
    ]
    const s = buildSleep(daily, 30, today)!
    expect(s.total).toBe(3)
    expect(s.under6).toBe(1)
    expect(s.over8).toBe(2)
    expect(s.missing).toBe(1)
    expect(s.implausible).toBe(1)
  })

  it('is null when no night has sleep data', () => {
    expect(buildSleep([{ date: today }], 30, today)).toBeNull()
  })
})
