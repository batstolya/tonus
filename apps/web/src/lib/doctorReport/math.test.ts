import { describe, it, expect } from 'vitest'
import { timeOfDayStats } from './math'
import { SLEEP_ORIGIN_MIN } from './sleep'
import { INTAKE_ORIGIN_MIN } from './intake'

describe('timeOfDayStats', () => {
  it('puts the median of times straddling midnight at midnight', () => {
    const s = timeOfDayStats(['2026-07-30T23:40:00', '2026-07-31T00:20:00'], SLEEP_ORIGIN_MIN)!
    expect(s.median).toBe('00:00')
  })

  it('reports quartiles around the median bedtime', () => {
    const s = timeOfDayStats([
      '2026-07-29T01:00:00', '2026-07-30T02:00:00', '2026-07-31T03:00:00',
    ], SLEEP_ORIGIN_MIN)!
    expect(s.median).toBe('02:00')
    expect(s.q1).toBe('01:30')
    expect(s.q3).toBe('02:30')
    expect(s.count).toBe(3)
  })

  it('is null without times', () => {
    expect(timeOfDayStats([], SLEEP_ORIGIN_MIN)).toBeNull()
  })

  it('splits a cluster that sits on the origin, which is why the origin is a parameter', () => {
    // Evening drinks either side of 18:00. Under the sleep origin the two land
    // at opposite ends of the scale and the median lands twelve hours away.
    const drinks = ['2026-07-30T17:55:00', '2026-07-30T18:05:00']
    expect(timeOfDayStats(drinks, SLEEP_ORIGIN_MIN)!.median).toBe('06:00')
    expect(timeOfDayStats(drinks, INTAKE_ORIGIN_MIN)!.median).toBe('18:00')
  })

  it('keeps late-evening and early-night intake contiguous under the intake origin', () => {
    const s = timeOfDayStats([
      '2026-07-30T22:00:00', '2026-07-30T23:00:00', '2026-07-31T00:00:00',
    ], INTAKE_ORIGIN_MIN)!
    expect(s.median).toBe('23:00')
  })
})
