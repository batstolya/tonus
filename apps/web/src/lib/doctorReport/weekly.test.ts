import { describe, it, expect } from 'vitest'
import { MIN_WEEK_DAYS, mondayOf, weeklyRows, coverage } from './weekly'
import { addDays } from './dates'
import { periodFrame } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31' // Friday
const day = (date: string, over: Partial<DailyMetrics> = {}): DailyMetrics => ({ date, ...over })

describe('mondayOf', () => {
  it('returns the Monday of the containing week', () => {
    expect(mondayOf('2026-07-31')).toBe('2026-07-27')
    expect(mondayOf('2026-07-27')).toBe('2026-07-27')
  })
})

describe('weeklyRows', () => {
  it('averages each metric inside its week and counts days', () => {
    const daily = [
      day('2026-07-27', { restingHeartRate: 58, steps: 8000 }),
      day('2026-07-28', { restingHeartRate: 62, steps: 10000 }),
      day('2026-07-29', { restingHeartRate: 60, steps: 11000 }),
    ]
    const rows = weeklyRows(daily, periodFrame(daily, 30, today))
    expect(rows).toHaveLength(1)
    expect(rows[0].weekStart).toBe('2026-07-27')
    expect(rows[0].days).toBe(3)
    expect(rows[0].values.rhr).toBe(60)
    expect(rows[0].values.steps).toBe(9667)
  })

  it('leaves a weekly cell empty below three days of that metric', () => {
    const daily = [
      { date: '2026-07-27', hrv: 40 },
      { date: '2026-07-28', hrv: 60 },
      { date: '2026-07-29', steps: 9000 },
    ]
    const rows = weeklyRows(daily, periodFrame(daily, 30, '2026-07-31'))
    expect(MIN_WEEK_DAYS).toBe(3)
    expect(rows[0].values.hrv).toBeUndefined()
    expect(rows[0].days).toBe(3)
  })
})

describe('coverage', () => {
  it('reports a gap when a metric misses at least 10% of days', () => {
    const daily = Array.from({ length: 10 }, (_, i) =>
      day(addDays(today, -9 + i), { steps: 1000, ...(i < 5 ? { hrv: 40 } : {}) }))
    const { gaps } = coverage(daily, periodFrame(daily, 10, today))
    expect(gaps.map(g => g.key)).toEqual(['hrv'])
    expect(gaps[0].daysWithData).toBe(5)
    expect(gaps[0].missingPct).toBe(50)
  })

  it('lists days with no record at all', () => {
    const daily = [day(addDays(today, -2), { steps: 1 }), day(today, { steps: 1 })]
    const { missingDates } = coverage(daily, periodFrame(daily, 3, today))
    expect(missingDates).toEqual([addDays(today, -1)])
  })
})
