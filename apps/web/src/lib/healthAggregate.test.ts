import { describe, expect, it } from 'vitest'
import { aggregateByDay } from './healthAggregate'
import type { HealthRecord } from '../types'

const rec = (type: string, value: number, start: string, end = start, sourceName = 'Apple Watch'): HealthRecord => ({
  type, value, unit: 'x', startDate: new Date(start), endDate: new Date(end), sourceName,
})

describe('aggregateByDay: breathing disturbances and time in daylight', () => {
  it('puts breathing disturbances on the wake-up day, like the sleep it belongs to', () => {
    const days = aggregateByDay([
      rec('HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances', 1.2, '2026-11-19T23:30:00Z', '2026-11-20T05:00:00Z'),
    ])
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ date: '2026-11-20', breathingDisturbances: 1.2 })
  })

  it('sums daylight minutes within a day and rounds them', () => {
    const days = aggregateByDay([
      rec('HKQuantityTypeIdentifierTimeInDaylight', 5, '2026-11-17T09:00:00Z'),
      rec('HKQuantityTypeIdentifierTimeInDaylight', 7.4, '2026-11-17T13:00:00Z'),
    ])
    expect(days[0]).toMatchObject({ date: '2026-11-17', daylightMinutes: 12 })
  })

  it('takes the fullest source for daylight instead of adding sources together', () => {
    const days = aggregateByDay([
      rec('HKQuantityTypeIdentifierTimeInDaylight', 10, '2026-11-17T09:00:00Z', '2026-11-17T09:00:00Z', 'A'),
      rec('HKQuantityTypeIdentifierTimeInDaylight', 6, '2026-11-17T09:00:00Z', '2026-11-17T09:00:00Z', 'B'),
    ])
    expect(days[0].daylightMinutes).toBe(10)
  })

  it('leaves both fields undefined on a day without those records', () => {
    const days = aggregateByDay([rec('HKQuantityTypeIdentifierStepCount', 100, '2026-11-17T09:00:00Z')])
    expect(days[0].breathingDisturbances).toBeUndefined()
    expect(days[0].daylightMinutes).toBeUndefined()
  })
})
