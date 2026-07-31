import { describe, it, expect } from 'vitest'
import { parseRefRange, buildLabs } from './labs'
import type { LabResult } from '../labs'

const lab = (marker: string, value: number, date: string, over: Partial<LabResult> = {}): LabResult => ({
  id: `${marker}-${date}`, user_id: 'u', lab_file_id: 'f',
  marker, value, unit: 'ng/ml', ref_range: '30-100', flag: null, date, ...over,
} as LabResult)

describe('parseRefRange', () => {
  it('parses ranges, comparisons and comma decimals', () => {
    expect(parseRefRange('3.5-5.5')).toEqual({ lo: 3.5, hi: 5.5 })
    expect(parseRefRange('3,9 – 6,2')).toEqual({ lo: 3.9, hi: 6.2 })
    expect(parseRefRange('< 5')).toEqual({ lo: -Infinity, hi: 5 })
    expect(parseRefRange('> 1.2')).toEqual({ lo: 1.2, hi: Infinity })
    expect(parseRefRange('какая-то строка')).toBeNull()
  })
})

describe('buildLabs', () => {
  const results = [
    lab('Ферритин', 24, '2026-04-01'),
    lab('Ферритин', 41, '2026-07-10'),
    lab('Витамин D', 19, '2026-01-05'),
  ]

  it('shows the latest value per marker with the previous one and its date', () => {
    const { lines } = buildLabs(results, '2026-05-01')
    const f = lines.find(l => l.marker === 'Ферритин')!
    expect(f.value).toBe(41)
    expect(f.prevValue).toBe(24)
    expect(f.prevDate).toBe('2026-04-01')
    expect(f.delta).toBe(17)
  })

  it('names markers whose latest measurement predates the period', () => {
    const { outOfPeriod } = buildLabs(results, '2026-05-01')
    expect(outOfPeriod).toEqual(['Витамин D'])
  })

  it('keeps every measurement in the series regardless of period', () => {
    const { series, totalMeasurements, markerCount } = buildLabs(results, '2026-07-01')
    expect(totalMeasurements).toBe(3)
    expect(markerCount).toBe(2)
    expect(series.find(s => s.marker === 'Ферритин')!.points).toEqual([
      { date: '2026-04-01', value: 24 },
      { date: '2026-07-10', value: 41 },
    ])
  })

  it('flags values outside the reference range', () => {
    const { lines } = buildLabs([lab('Ферритин', 12, '2026-07-10')], '2026-05-01')
    expect(lines[0].flag).toBe('↓')
  })

  it('falls back to the source flag when the range does not parse', () => {
    const { lines } = buildLabs(
      [lab('X', 5, '2026-07-10', { ref_range: 'по возрасту', flag: 'H' })], '2026-05-01')
    expect(lines[0].flag).toBe('↑')
  })
})
