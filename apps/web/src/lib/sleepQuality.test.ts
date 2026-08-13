import { describe, it, expect } from 'vitest'
import { timeInBedHours, sleepEfficiencyPct } from './sleepQuality'

describe('timeInBedHours', () => {
  it('adds awake time to sleep', () => {
    expect(timeInBedHours(8.35, 0.15)).toBeCloseTo(8.5)
  })

  it('is null when awake time is unknown', () => {
    expect(timeInBedHours(8.35, null)).toBeNull()
    expect(timeInBedHours(8.35, undefined)).toBeNull()
  })

  it('is null without a sleep duration', () => {
    expect(timeInBedHours(null, 0.15)).toBeNull()
  })

  it('treats a measured zero as a value, not as missing', () => {
    expect(timeInBedHours(8, 0)).toBeCloseTo(8)
  })

  it('is null when duration is negative', () => {
    expect(timeInBedHours(-8, 0)).toBeNull()
  })
})

describe('sleepEfficiencyPct', () => {
  it('is asleep over time in bed, in whole percent', () => {
    expect(sleepEfficiencyPct(8.35, 0.15)).toBe(98)
  })

  it('is 100 when the source measured no awake time', () => {
    expect(sleepEfficiencyPct(8, 0)).toBe(100)
  })

  it('is null when awake time is unknown', () => {
    expect(sleepEfficiencyPct(8.35, null)).toBeNull()
  })

  it('is null rather than NaN when there is no time in bed', () => {
    expect(sleepEfficiencyPct(0, 0)).toBeNull()
  })

  it('is null when duration is negative', () => {
    expect(sleepEfficiencyPct(-2, 10)).toBeNull()
  })

  it('is null when awake hours is negative', () => {
    expect(sleepEfficiencyPct(10, -8)).toBeNull()
  })
})
