import { describe, expect, it } from 'vitest'
import { diffParsedMetrics } from './ingestDiff.ts'
import type { MetricRow } from './hae.ts'

const row = (date: string, metric: string, over: Partial<MetricRow> = {}): MetricRow =>
  ({ user_id: 'u', date, metric, ...over })

const TOL = { relativeTolerance: 0.01 }

describe('diffParsedMetrics', () => {
  it('reports nothing when both sides agree within tolerance', () => {
    expect(diffParsedMetrics(
      [row('2026-07-20', 'steps', { sum_val: 5000 })],
      [row('2026-07-20', 'steps', { sum_val: 5001 })],
      TOL,
    )).toEqual([])
  })

  it('reports a value gap beyond tolerance', () => {
    const [d] = diffParsedMetrics(
      [row('2026-07-20', 'steps', { sum_val: 5000 })],
      [row('2026-07-20', 'steps', { sum_val: 9000 })],
      TOL,
    )
    expect(d).toMatchObject({ date: '2026-07-20', metric: 'steps', kind: 'value', left: 5000, right: 9000 })
  })

  it('reports a metric present on one side only', () => {
    const [missingRight] = diffParsedMetrics([row('2026-07-20', 'hrv', { avg_val: 44 })], [], TOL)
    expect(missingRight).toMatchObject({ metric: 'hrv', kind: 'missing-right', left: 44, right: null })

    const [missingLeft] = diffParsedMetrics([], [row('2026-07-20', 'hrv', { avg_val: 44 })], TOL)
    expect(missingLeft).toMatchObject({ metric: 'hrv', kind: 'missing-left', left: null, right: 44 })
  })

  it('treats a zero on one side as a real gap, not a rounding difference', () => {
    // Относительный допуск к нулю неприменим: это не округление, а отсутствие
    // данных у одного из отправителей — ровно то, что сверка обязана показать.
    expect(diffParsedMetrics(
      [row('2026-07-20', 'steps', { sum_val: 0 })],
      [row('2026-07-20', 'steps', { sum_val: 4000 })],
      { relativeTolerance: 0.5 },
    )).toHaveLength(1)
  })

  it('compares averages through avg_val when sum_val is absent', () => {
    expect(diffParsedMetrics(
      [row('2026-07-20', 'hrv', { avg_val: 40 })],
      [row('2026-07-20', 'hrv', { avg_val: 60 })],
      TOL,
    )).toHaveLength(1)
  })

  it('keeps days and metrics separate', () => {
    const diffs = diffParsedMetrics(
      [row('2026-07-20', 'steps', { sum_val: 100 }), row('2026-07-21', 'steps', { sum_val: 200 })],
      [row('2026-07-20', 'steps', { sum_val: 100 }), row('2026-07-21', 'steps', { sum_val: 999 })],
      TOL,
    )
    expect(diffs).toHaveLength(1)
    expect(diffs[0].date).toBe('2026-07-21')
  })

  it('returns diffs sorted by date and metric so a report reads chronologically', () => {
    const diffs = diffParsedMetrics(
      [row('2026-07-21', 'steps', { sum_val: 1 }), row('2026-07-20', 'hrv', { avg_val: 1 })],
      [],
      TOL,
    )
    expect(diffs.map(d => `${d.date}|${d.metric}`)).toEqual(['2026-07-20|hrv', '2026-07-21|steps'])
  })
})
