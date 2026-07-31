import { describe, it, expect } from 'vitest'
import { METRIC_DEFS, summarizeMetrics, avgTimeOfDay, addDays } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'
const day = (date: string, over: Partial<DailyMetrics> = {}): DailyMetrics => ({ date, ...over })

describe('METRIC_DEFS', () => {
  it('covers every numeric field of DailyMetrics', () => {
    expect(METRIC_DEFS.map(m => m.key)).toEqual([
      'rhr', 'hrv', 'hrAvg', 'hrMin', 'hrMax', 'walkHr', 'spo2', 'resp', 'temp',
      'vo2', 'sleep', 'deep', 'rem', 'core', 'steps', 'dist', 'kcal', 'exer', 'floors',
    ])
  })

  it('gives every metric its own deviation threshold', () => {
    for (const m of METRIC_DEFS) expect(m.minRel).toBeGreaterThan(0)
  })
})

describe('summarizeMetrics', () => {
  it('reports avg/min/max and coverage', () => {
    const daily = [
      day(addDays(today, -2), { restingHeartRate: 58 }),
      day(addDays(today, -1), { restingHeartRate: 62 }),
      day(today, { restingHeartRate: 60 }),
    ]
    const s = summarizeMetrics(daily, 30, today).find(m => m.key === 'rhr')!
    expect(s.avg).toBe(60)
    expect(s.min).toBe(58)
    expect(s.max).toBe(62)
    expect(s.daysWithData).toBe(3)
  })

  it('omits metrics with no data instead of returning empty rows', () => {
    const out = summarizeMetrics([day(today, { steps: 100 })], 30, today)
    expect(out.map(m => m.key)).toEqual(['steps'])
  })

  it('converts oxygen saturation from fraction to percent', () => {
    const out = summarizeMetrics([day(today, { oxygenSaturation: 0.97 })], 30, today)
    expect(out[0].avg).toBe(97)
  })

  it('drops days outside the period', () => {
    const daily = [day(addDays(today, -40), { steps: 1 }), day(today, { steps: 10 })]
    const s = summarizeMetrics(daily, 30, today).find(m => m.key === 'steps')!
    expect(s.daysWithData).toBe(1)
    expect(s.avg).toBe(10)
  })
})

describe('avgTimeOfDay', () => {
  it('averages times that straddle midnight without landing at noon', () => {
    const out = avgTimeOfDay(['2026-07-30T23:40:00', '2026-07-31T00:20:00'])
    expect(out).toBe('00:00')
  })
})
