import { describe, expect, it } from 'vitest'
import { buildHaePayload, MOBILE_SOURCE_PREFIX } from './haePayload'
import { parseHAE } from '../../../supabase/functions/_shared/hae.ts'

const USER = '00000000-0000-0000-0000-000000000001'

describe('buildHaePayload', () => {
  it('keeps one point per source so the server can max across devices', () => {
    const payload = buildHaePayload({
      sums: [
        { hae: 'step_count', date: '2026-07-20', device: 'iPhone', value: 5000, units: 'count' },
        { hae: 'step_count', date: '2026-07-20', device: 'Apple Watch', value: 4800, units: 'count' },
      ],
    })
    const points = payload.data.metrics.find(m => m.name === 'step_count')!.data
    expect(points).toHaveLength(2)
    // Merging the two devices here would double-count: the server sums within a
    // source and takes the maximum across sources, so it must see them apart.
    expect(points.map(p => p.qty)).toEqual([5000, 4800])
  })

  it('stamps every point with the mobile source prefix and the device', () => {
    const payload = buildHaePayload({
      sums: [{ hae: 'step_count', date: '2026-07-20', device: 'iPhone', value: 1, units: 'count' }],
      averages: [{ hae: 'heart_rate_variability', date: '2026-07-20', avg: 44, min: 40, max: 50, units: 'ms' }],
    })
    const sources = payload.data.metrics.flatMap(m => m.data.map(p => p.source))
    expect(sources.every(s => s!.startsWith(MOBILE_SOURCE_PREFIX))).toBe(true)
    expect(sources[0]).toBe('Tonus iOS · iPhone')
  })

  it('formats dates the way the server slices them', () => {
    const payload = buildHaePayload({
      sums: [{ hae: 'step_count', date: '2026-07-20', device: 'iPhone', value: 1, units: 'count' }],
    })
    // parseHAE does date.slice(0, 10), so anything else silently lands on the
    // wrong day — or on no day at all.
    expect(payload.data.metrics[0].data[0].date).toBe('2026-07-20 00:00:00 +0000')
  })

  it('emits sleep phases under the names the server reads', () => {
    const payload = buildHaePayload({
      sleep: [{
        date: '2026-07-20',
        totalHours: 7.5,
        deepHours: 1.2,
        remHours: 1.8,
        coreHours: 4.5,
        bedtime: '2026-07-19 23:10:00 +0000',
        wakeTime: '2026-07-20 06:40:00 +0000',
      }],
    })
    const point = payload.data.metrics.find(m => m.name === 'sleep_analysis')!.data[0]
    expect(point).toMatchObject({ totalSleep: 7.5, deep: 1.2, rem: 1.8, core: 4.5 })
  })

  it('omits a metric entirely rather than sending an empty one', () => {
    const payload = buildHaePayload({ sums: [], averages: [], sleep: [] })
    expect(payload.data.metrics).toEqual([])
  })
})

// The real proof: the JSON the phone produces has to survive the server's own
// parser with the values intended. Anything else is a guess about the contract.
describe('round trip through the server parser', () => {
  it('lands the per-device maximum, not the sum', () => {
    const payload = buildHaePayload({
      sums: [
        { hae: 'step_count', date: '2026-07-20', device: 'iPhone', value: 5000, units: 'count' },
        { hae: 'step_count', date: '2026-07-20', device: 'Apple Watch', value: 4800, units: 'count' },
      ],
    })
    const { metrics } = parseHAE(USER, payload)
    expect(metrics.find(m => m.metric === 'steps')?.sum_val).toBe(5000)
  })

  it('keeps distance in km and energy in kcal through the server heuristics', () => {
    const payload = buildHaePayload({
      sums: [
        { hae: 'distance_walking_running', date: '2026-07-20', device: 'iPhone', value: 5.4, units: 'km' },
        { hae: 'active_energy', date: '2026-07-20', device: 'Apple Watch', value: 620, units: 'kcal' },
      ],
    })
    const { metrics } = parseHAE(USER, payload)
    // The server divides distance by 1000 above 100 (metres) and converts kJ
    // only when the units say so — emitting km and kcal keeps both no-ops.
    expect(metrics.find(m => m.metric === 'distance')?.sum_val).toBeCloseTo(5.4)
    expect(metrics.find(m => m.metric === 'activeEnergy')?.sum_val).toBeCloseTo(620)
  })

  it('keeps saturation a fraction', () => {
    const payload = buildHaePayload({
      averages: [{ hae: 'blood_oxygen_saturation', date: '2026-07-20', avg: 0.97, min: 0.95, max: 0.99, units: 'fraction' }],
    })
    const { metrics } = parseHAE(USER, payload)
    expect(metrics.find(m => m.metric === 'oxygenSaturation')?.avg_val).toBeCloseTo(0.97)
  })

  it('carries averages with their min and max', () => {
    const payload = buildHaePayload({
      averages: [{ hae: 'heart_rate_variability', date: '2026-07-20', avg: 44, min: 30, max: 61, units: 'ms' }],
    })
    const hrv = parseHAE(USER, payload).metrics.find(m => m.metric === 'hrv')
    expect(hrv).toMatchObject({ avg_val: 44, min_val: 30, max_val: 61 })
  })

  it('produces a sleep row the server can store', () => {
    const payload = buildHaePayload({
      sleep: [{
        date: '2026-07-20',
        totalHours: 7.5, deepHours: 1.2, remHours: 1.8, coreHours: 4.5,
        bedtime: '2026-07-19 23:10:00 +0000', wakeTime: '2026-07-20 06:40:00 +0000',
      }],
    })
    const { sleep } = parseHAE(USER, payload)
    expect(sleep).toHaveLength(1)
    expect(sleep[0]).toMatchObject({ date: '2026-07-20', duration_hours: 7.5, deep_hours: 1.2 })
  })
})
