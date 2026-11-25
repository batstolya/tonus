import { describe, it, expect } from 'vitest'
import { applyMetricRow, applySleepRow, metricRowsOf } from './sync'
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

describe('breathing disturbances and daylight minutes', () => {
  const row = (metric: string, v: { avg_val?: number | null; sum_val?: number | null }) =>
    ({ metric, avg_val: null, min_val: null, max_val: null, sum_val: null, ...v })

  it('loads breathingDisturbances from avg_val and daylightMinutes from sum_val', () => {
    const d: DailyMetrics = { date: '2026-11-20' }
    applyMetricRow(d, row('breathingDisturbances', { avg_val: 0.48 }))
    applyMetricRow(d, row('daylightMinutes', { sum_val: 37 }))
    expect(d).toMatchObject({ breathingDisturbances: 0.48, daylightMinutes: 37 })
  })

  it('keeps the larger daylight total when a day has two rows', () => {
    const d: DailyMetrics = { date: '2026-11-20' }
    applyMetricRow(d, row('daylightMinutes', { sum_val: 37 }))
    applyMetricRow(d, row('daylightMinutes', { sum_val: 12 }))
    expect(d.daylightMinutes).toBe(37)
  })

  it('saves both metrics as rows only when they are set', () => {
    const set = metricRowsOf('u', { date: '2026-11-20', breathingDisturbances: 0, daylightMinutes: 37 })
    expect(set).toEqual([
      { user_id: 'u', date: '2026-11-20', metric: 'breathingDisturbances', avg_val: 0 },
      { user_id: 'u', date: '2026-11-20', metric: 'daylightMinutes', sum_val: 37 },
    ])
    expect(metricRowsOf('u', { date: '2026-11-20' })).toEqual([])
  })
})

describe('catalog metrics in sync', () => {
  const row = (metric: string, v: { avg_val?: number | null; sum_val?: number | null }) =>
    ({ metric, avg_val: null, min_val: null, max_val: null, sum_val: null, ...v })

  it('loads sum metrics from sum_val and avg metrics from avg_val', () => {
    const d: DailyMetrics = { date: '2026-11-24' }
    applyMetricRow(d, row('basalEnergy', { sum_val: 1650 }))
    applyMetricRow(d, row('walkingSpeed', { avg_val: 4.2 }))
    applyMetricRow(d, row('handwashing', { sum_val: 3 }))
    expect(d).toMatchObject({ basalEnergy: 1650, walkingSpeed: 4.2, handwashing: 3 })
  })

  it('saves catalog fields as rows only when set', () => {
    const rows = metricRowsOf('u', { date: '2026-11-24', basalEnergy: 1650, walkingAsymmetry: 0 })
    expect(rows).toEqual([
      { user_id: 'u', date: '2026-11-24', metric: 'basalEnergy', sum_val: 1650 },
      { user_id: 'u', date: '2026-11-24', metric: 'walkingAsymmetry', avg_val: 0 },
    ])
  })
})
