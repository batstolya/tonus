import { describe, expect, it } from 'vitest'
import { EXTRA_METRIC_KEYS, compareExtraLines, extraMetricsLines, summarizeExtraMetrics } from './extraMetrics.ts'

const row = (date: string, metric: string, v: { avg_val?: number | null; sum_val?: number | null }) =>
  ({ date, metric, avg_val: null, sum_val: null, ...v })

describe('EXTRA_METRIC_KEYS', () => {
  it('covers breathing, daylight and all 16 catalog metrics', () => {
    expect(EXTRA_METRIC_KEYS).toHaveLength(18)
    expect(EXTRA_METRIC_KEYS).toContain('breathingDisturbances')
    expect(EXTRA_METRIC_KEYS).toContain('daylightMinutes')
    expect(EXTRA_METRIC_KEYS).toContain('walkingSpeed')
  })
})

describe('summarizeExtraMetrics', () => {
  it('averages over days with data and keeps the latest value', () => {
    const s = summarizeExtraMetrics([
      row('2026-11-20', 'breathingDisturbances', { avg_val: 1 }),
      row('2026-11-22', 'breathingDisturbances', { avg_val: 2 }),
      row('2026-11-21', 'basalEnergy', { sum_val: 1800 }),
      row('2026-11-21', 'steps', { sum_val: 9000 }),
    ])
    const b = s.find(x => x.key === 'breathingDisturbances')!
    expect(b).toMatchObject({ avg: 1.5, days: 2, latest: 2, latestDate: '2026-11-22' })
    expect(s.find(x => x.key === 'basalEnergy')).toMatchObject({ avg: 1800, days: 1 })
    expect(s.some(x => x.key === ('steps' as string))).toBe(false)
  })

  it('keeps a measured zero', () => {
    const [w] = summarizeExtraMetrics([row('2026-11-20', 'walkingAsymmetry', { avg_val: 0 })])
    expect(w).toMatchObject({ avg: 0, latest: 0 })
  })
})

describe('text helpers', () => {
  it('renders one line per metric with unit label, average, days and latest', () => {
    const lines = extraMetricsLines(summarizeExtraMetrics([
      row('2026-11-20', 'breathingDisturbances', { avg_val: 0.4 }),
      row('2026-11-21', 'breathingDisturbances', { avg_val: 0.6 }),
    ]))
    expect(lines).toEqual(['Нарушения дыхания во сне, в час: средн 0.5 (дней с данными: 2), последнее 0.6 (2026-11-21)'])
  })

  it('compares two periods with code-computed deltas, only for metrics present in both', () => {
    const cur = summarizeExtraMetrics([row('2026-11-21', 'walkingSpeed', { avg_val: 4.8 }), row('2026-11-21', 'daylightMinutes', { sum_val: 30 })])
    const prev = summarizeExtraMetrics([row('2026-11-07', 'walkingSpeed', { avg_val: 4.2 })])
    expect(compareExtraLines(cur, prev)).toEqual(['Скорость ходьбы, км/ч: 4.8 (было 4.2, +0.6; дней с данными 1 и 1)'])
  })
})
