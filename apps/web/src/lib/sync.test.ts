import { describe, it, expect } from 'vitest'
import { applySleepRow } from './sync'
import type { DailyMetrics } from '../types'

const row = (awake: number | null) => ({
  duration_hours: 8.35, bedtime: null, wake_time: null,
  deep_hours: null, rem_hours: null, core_hours: null, awake_hours: awake,
})

describe('applySleepRow', () => {
  it('carries awake hours into the daily model', () => {
    const d: DailyMetrics = { date: '2026-08-13' }
    applySleepRow(d, row(0.15))
    expect(d.sleepAwake).toBeCloseTo(0.15)
  })

  it('leaves awake undefined when the column is null', () => {
    const d: DailyMetrics = { date: '2026-08-13' }
    applySleepRow(d, row(null))
    expect(d.sleepAwake).toBeUndefined()
  })

  it('keeps a measured zero', () => {
    const d: DailyMetrics = { date: '2026-08-13' }
    applySleepRow(d, row(0))
    expect(d.sleepAwake).toBe(0)
  })
})
