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

  it('counts the days behind each metric separately, not the days in the week', () => {
    // The production case: the week of 2026-07-20 printed "Сон 8.3 · Дней 7"
    // from three nights, because the day count belonged to the week and the
    // average belonged to the metric.
    const daily = [
      day('2026-07-20', { restingHeartRate: 56, steps: 8000 }),
      day('2026-07-21', { restingHeartRate: 56, steps: 8000 }),
      day('2026-07-22', { restingHeartRate: 56, steps: 8000, sleepHours: 7.5 }),
      day('2026-07-23', { steps: 8000 }),
      day('2026-07-24', { steps: 8000, sleepHours: 8.2 }),
      day('2026-07-25', { steps: 8000, sleepHours: 9.1 }),
      day('2026-07-26', { steps: 8000 }),
    ]
    const rows = weeklyRows(daily, periodFrame(daily, 30, '2026-07-26'))
    expect(rows[0].days).toBe(7)
    expect(rows[0].values.sleep).toBe(8.3)
    expect(rows[0].counts.sleep).toBe(3)
    expect(rows[0].counts.rhr).toBe(3)
    expect(rows[0].counts.steps).toBe(7)
  })

  it('carries no count for a metric whose cell was suppressed', () => {
    const daily = [
      day('2026-07-27', { hrv: 40 }),
      day('2026-07-28', { hrv: 60 }),
      day('2026-07-29', { steps: 9000, hrv: undefined }),
    ]
    const rows = weeklyRows(daily, periodFrame(daily, 30, '2026-07-31'))
    expect(rows[0].values.hrv).toBeUndefined()
    expect(rows[0].counts.hrv).toBeUndefined()
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
