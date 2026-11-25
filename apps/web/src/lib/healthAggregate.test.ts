import { describe, expect, it } from 'vitest'
import { aggregateByDay, recordValue } from './healthAggregate'
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

describe('recordValue', () => {
  it('maps stand-hour categories to stood=1 and idle=0', () => {
    expect(recordValue('HKCategoryTypeIdentifierAppleStandHour', 'HKCategoryValueAppleStandHourStood')).toBe(1)
    expect(recordValue('HKCategoryTypeIdentifierAppleStandHour', 'HKCategoryValueAppleStandHourIdle')).toBe(0)
  })

  it('counts a handwashing event as 1', () => {
    expect(recordValue('HKCategoryTypeIdentifierHandwashingEvent', 'HKCategoryValueNotApplicable')).toBe(1)
  })

  it('keeps the sleep mapping and numeric parsing as before', () => {
    expect(recordValue('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepREM')).toBe(3)
    expect(recordValue('HKCategoryTypeIdentifierSleepAnalysis', 'nonsense')).toBeNull()
    expect(recordValue('HKQuantityTypeIdentifierStepCount', '120')).toBe(120)
    expect(recordValue('HKQuantityTypeIdentifierStepCount', 'abc')).toBeNull()
  })
})

describe('aggregateByDay: catalog metrics', () => {
  it('turns export.xml asymmetry fractions into percent', () => {
    const [d] = aggregateByDay([rec('HKQuantityTypeIdentifierWalkingAsymmetryPercentage', 0.25, '2026-11-17T09:00:00Z')])
    expect(d.walkingAsymmetry).toBeCloseTo(25)
  })

  it('sums basal energy already in kcal', () => {
    const [d] = aggregateByDay([
      rec('HKQuantityTypeIdentifierBasalEnergyBurned', 20, '2026-11-17T09:00:00Z'),
      rec('HKQuantityTypeIdentifierBasalEnergyBurned', 20, '2026-11-17T10:00:00Z'),
    ])
    expect(d.basalEnergy).toBe(40)
  })

  it('counts stood hours only, idle hours add zero', () => {
    const [d] = aggregateByDay([
      rec('HKCategoryTypeIdentifierAppleStandHour', 1, '2026-11-17T09:00:00Z'),
      rec('HKCategoryTypeIdentifierAppleStandHour', 0, '2026-11-17T10:00:00Z'),
    ])
    expect(d.standHours).toBe(1)
  })

  it('counts handwashing events', () => {
    const [d] = aggregateByDay([
      rec('HKCategoryTypeIdentifierHandwashingEvent', 1, '2026-11-17T09:00:00Z'),
      rec('HKCategoryTypeIdentifierHandwashingEvent', 1, '2026-11-17T12:00:00Z'),
    ])
    expect(d.handwashing).toBe(2)
  })
})

describe('aggregateByDay: walking steadiness', () => {
  it('turns the weekly steadiness fraction into percent', () => {
    const [d] = aggregateByDay([rec('HKQuantityTypeIdentifierAppleWalkingSteadiness', 0.997, '2026-06-01T00:00:00Z', '2026-06-08T00:00:00Z', 'iPhone')])
    expect(d.walkingSteadiness).toBeCloseTo(99.7)
  })
})
