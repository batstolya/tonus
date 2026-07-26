import { describe, expect, it } from 'vitest'
import { parseHAE, parseHRSamples } from './hae.ts'

// Характеризационные тесты: фиксируют поведение, которое уже крутится в проде.
// Если тест разошёлся с реализацией — прав тест только тогда, когда реализация
// действительно сломана; в остальных случаях прод и есть спецификация.
const USER = '00000000-0000-0000-0000-000000000001'
const DAY = '2026-07-20 00:00:00 +0000'

describe('parseHAE', () => {
  it('sums a metric within a source and takes the max across sources', () => {
    const { metrics } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'step_count',
          units: 'count',
          data: [
            { date: DAY, source: 'iPhone', qty: 4000 },
            { date: DAY, source: 'iPhone', qty: 1000 },
            { date: DAY, source: 'Watch', qty: 4800 },
          ],
        }],
      },
    })
    // iPhone 4000+1000 = 5000, Watch 4800 → максимум 5000, а не сумма 9800.
    // Это то, что делает параллельный прогон с HAE безопасным для сумм.
    expect(metrics.find(m => m.metric === 'steps')?.sum_val).toBe(5000)
  })

  it('averages a metric across all points of a day and keeps min/max', () => {
    const { metrics } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'heart_rate_variability',
          units: 'ms',
          data: [
            { date: '2026-07-20 03:00:00 +0000', Avg: 40, Min: 30, Max: 50 },
            { date: '2026-07-20 04:00:00 +0000', Avg: 60, Min: 55, Max: 70 },
          ],
        }],
      },
    })
    const hrv = metrics.find(m => m.metric === 'hrv')
    expect(hrv?.avg_val).toBe(50)
    expect(hrv?.min_val).toBe(30)
    expect(hrv?.max_val).toBe(70)
  })

  it('normalises saturation given as a percentage into a fraction', () => {
    const { metrics } = parseHAE(USER, {
      data: { metrics: [{ name: 'blood_oxygen_saturation', units: '%', data: [{ date: DAY, Avg: 97 }] }] },
    })
    expect(metrics.find(m => m.metric === 'oxygenSaturation')?.avg_val).toBeCloseTo(0.97)
  })

  it('treats a large distance as metres and converts to km', () => {
    const { metrics } = parseHAE(USER, {
      data: { metrics: [{ name: 'distance_walking_running', units: 'm', data: [{ date: DAY, qty: 5400 }] }] },
    })
    expect(metrics.find(m => m.metric === 'distance')?.sum_val).toBeCloseTo(5.4)
  })

  it('converts active energy from kJ when the units say so', () => {
    const { metrics } = parseHAE(USER, {
      data: { metrics: [{ name: 'active_energy', units: 'kJ', data: [{ date: DAY, qty: 4184 }] }] },
    })
    expect(metrics.find(m => m.metric === 'activeEnergy')?.sum_val).toBeCloseTo(1000)
  })

  it('reads sleep phases into one row per day', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{
            date: DAY,
            totalSleep: 7.5, deep: 1.2, rem: 1.8, core: 4.5,
            sleepStart: '2026-07-19 23:10:00 +0000',
            sleepEnd: '2026-07-20 06:40:00 +0000',
          }],
        }],
      },
    })
    expect(sleep).toHaveLength(1)
    expect(sleep[0].date).toBe('2026-07-20')
    expect(sleep[0].duration_hours).toBeCloseTo(7.5)
    expect(sleep[0].deep_hours).toBeCloseTo(1.2)
    expect(sleep[0].bedtime).toBe('2026-07-19 23:10:00 +0000')
  })

  it('ignores metrics the server does not map', () => {
    const { metrics } = parseHAE(USER, {
      data: { metrics: [{ name: 'handwashing', data: [{ date: DAY, qty: 3 }] }] },
    })
    expect(metrics).toEqual([])
  })

  it('accepts the flat payload shape as well as the nested one', () => {
    const flat = parseHAE(USER, { metrics: [{ name: 'step_count', data: [{ date: DAY, qty: 100 }] }] })
    expect(flat.metrics.find(m => m.metric === 'steps')?.sum_val).toBe(100)
  })

  it('survives a payload with no metrics at all', () => {
    expect(parseHAE(USER, {})).toEqual({ metrics: [], sleep: [] })
  })
})

describe('parseHRSamples', () => {
  it('dedups heart-rate samples by timestamp', () => {
    const samples = parseHRSamples(USER, {
      data: {
        metrics: [{
          name: 'heart_rate',
          data: [
            { date: '2026-07-20T10:00:00.000Z', Avg: 61, source: 'Watch' },
            { date: '2026-07-20T10:00:00.000Z', Avg: 62, source: 'Watch' },
            { date: '2026-07-20T10:00:01.000Z', Avg: 64, source: 'Watch' },
          ],
        }],
      },
    })
    expect(samples).toHaveLength(2)
    // Последний выигрывает при совпадении секунды.
    expect(samples[0].bpm).toBe(62)
  })

  it('returns nothing when the payload carries no heart rate', () => {
    expect(parseHRSamples(USER, { data: { metrics: [{ name: 'step_count', data: [] }] } })).toEqual([])
  })
})
