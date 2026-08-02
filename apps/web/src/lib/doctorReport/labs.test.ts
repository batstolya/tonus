import { describe, it, expect } from 'vitest'
import { parseRefRange, buildLabs } from './labs'
import type { LabResult } from '../labs'

// Both helpers mirror the backfilled production shape: every stored row carries
// a sample_date. A row without one is its own case, covered explicitly below.
const lab = (marker: string, value: number, date: string, over: Partial<LabResult> = {}): LabResult => ({
  id: `${marker}-${date}`, user_id: 'u', lab_file_id: 'f',
  marker, value, unit: 'ng/ml', ref_range: '30-100', flag: null, date,
  sample_date: date, sample_date_precision: 'day', analyte_key: null, ...over,
} as LabResult)

const r = (over: Partial<LabResult>): LabResult => {
  const base = {
    id: '1', lab_file_id: 'f', marker: 'X', value: 1, unit: null,
    date: '2026-06-20', analyte_key: null, ...over,
  }
  // sample_date follows the row's date unless the case sets one of its own.
  return { sample_date: base.date, sample_date_precision: 'day', ...base } as LabResult
}

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
      { date: '2026-04-01', precision: 'day', value: 24 },
      { date: '2026-07-10', precision: 'day', value: 41 },
    ])
  })

  it('reads the status from a range that parses', () => {
    const { lines } = buildLabs([lab('Ферритин', 12, '2026-07-10')], '2026-05-01')
    expect(lines[0].status).toBe('below')
    expect(lines[0].statusSource).toBe('range')
  })

  it('falls back to the source flag when the range does not parse', () => {
    const { lines } = buildLabs(
      [lab('X', 5, '2026-07-10', { ref_range: 'по возрасту', flag: 'H' })], '2026-05-01')
    expect(lines[0].status).toBe('above')
    expect(lines[0].statusSource).toBe('lab-flag')
  })

  it('refuses a verdict without a reference range or a lab flag', () => {
    const s = buildLabs([r({ marker: 'LDL', value: 147, unit: 'mg/dL' })], '2026-01-01')
    expect(s.lines[0].status).toBe('unknown')
    expect(s.lines[0].statusSource).toBeNull()
  })

  it('never claims the lab gave no reference when it gave one the app could not parse', () => {
    // 'unknown' means "the lab sent nothing"; a range that failed to parse is
    // a different fact and needs its own status, or the row would print the
    // unparsed range in one column and "no reference given" in the next.
    const s = buildLabs([r({ marker: 'X', value: 5, ref_range: 'муж 130-170' })], '2026-01-01')
    expect(s.lines[0].status).toBe('unparsed')
    expect(s.lines[0].statusSource).toBeNull()
  })

  it('still says "no reference given" for a blank or whitespace-only ref_range', () => {
    const s = buildLabs([r({ marker: 'X', value: 5, ref_range: '   ' })], '2026-01-01')
    expect(s.lines[0].status).toBe('unknown')
  })

  it('uses the range when it parses and names the source', () => {
    const s = buildLabs([r({ marker: 'LDL', value: 147, ref_range: '0-115' })], '2026-01-01')
    expect(s.lines[0].status).toBe('above')
    expect(s.lines[0].statusSource).toBe('range')
  })

  it('falls back to the laboratory flag and says so', () => {
    const s = buildLabs([r({ marker: 'LDL', value: 147, flag: 'high' })], '2026-01-01')
    expect(s.lines[0].status).toBe('above')
    expect(s.lines[0].statusSource).toBe('lab-flag')
  })

  it('keeps a percentage and an absolute count apart', () => {
    const s = buildLabs([
      r({ marker: 'LINFOCITOS', value: 42.2, unit: '%', date: '2026-06-20' }),
      r({ marker: 'LINFOCITOS', value: 2.16, unit: '10E3/µL', date: '2026-06-20' }),
    ], '2026-01-01')
    expect(s.lines).toHaveLength(2)
    expect(s.lines.every(l => l.delta === null)).toBe(true)
    // Two rows, but one marker: the closing count still says "1 marker".
    expect(s.markerCount).toBe(1)
  })

  it('treats the same unit written differently as one series', () => {
    const s = buildLabs([
      r({ marker: 'Ferritin', value: 85, unit: 'ng/mL', date: '2026-01-10' }),
      r({ marker: 'Ferritin', value: 68, unit: ' NG/ML ', date: '2026-06-20' }),
    ], '2026-01-01')
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0].delta).toBe(-17)
  })

  it('never treats genuinely different units as one series', () => {
    const s = buildLabs([
      r({ marker: 'Ferritin', value: 85, unit: 'µg/dL', date: '2026-01-10' }),
      r({ marker: 'Ferritin', value: 68, unit: 'µmol/L', date: '2026-06-20' }),
    ], '2026-01-01')
    expect(s.lines).toHaveLength(2)
    expect(s.lines.every(l => l.delta === null)).toBe(true)
  })
})

describe('buildLabs — sample dates and canonical analytes', () => {
  // Production shape: three files, two languages, one analyte. Before the
  // analyte key existed these were three unrelated single-point markers.
  const ferritin: LabResult[] = [
    r({ id: 'a', marker: 'FERRITINA', value: 85, unit: 'ng/mL',
        date: '2026-06-20', sample_date: '2024-09-01', sample_date_precision: 'month', analyte_key: 'ferritin' }),
    r({ id: 'b', marker: '[L05] Ferrytyna', value: 85, unit: 'ng/ml',
        date: '2026-06-20', sample_date: '2025-03-01', sample_date_precision: 'month', analyte_key: 'ferritin' }),
    r({ id: 'c', marker: 'Ferrytyna (L05)', value: 68, unit: 'ng/mL',
        date: '2026-06-20', sample_date: '2025-09-01', sample_date_precision: 'month', analyte_key: 'ferritin' }),
  ]

  it('joins one analyte spelled three ways into a single series', () => {
    const s = buildLabs(ferritin, '2024-01-01')
    expect(s.series).toHaveLength(1)
    expect(s.series[0].points.map(p => p.value)).toEqual([85, 85, 68])
    expect(s.lines).toHaveLength(1)
  })

  it('orders and reports by the sample date, not the import date', () => {
    const s = buildLabs(ferritin, '2024-01-01')
    expect(s.lines[0].date).toBe('2025-09-01')
    expect(s.lines[0].prevDate).toBe('2025-03-01')
    expect(s.series[0].points.map(p => p.date)).toEqual(['2024-09-01', '2025-03-01', '2025-09-01'])
  })

  it('keeps the percentage and the absolute count of one analyte apart', () => {
    // Both carry analyte_key 'lymphocytes'; joining them is the defect #170
    // fixed, and grouping on the key alone would bring it back.
    const s = buildLabs([
      r({ id: 'p', marker: 'LINFOCITOS', value: 42.2, unit: '%', analyte_key: 'lymphocytes', sample_date: '2024-09-01', sample_date_precision: 'month' }),
      r({ id: 'q', marker: 'LINFOCITOS', value: 2.16, unit: '10E3/µL', analyte_key: 'lymphocytes', sample_date: '2024-09-01', sample_date_precision: 'month' }),
    ], '2024-01-01')
    expect(s.lines).toHaveLength(2)
    expect(s.series).toHaveLength(0)
  })

  it('joins two spellings of one unit that string equality would split', () => {
    // TSH: mU/l from one lab, µIU/mL from another — the same unit.
    const s = buildLabs([
      r({ id: 'x', marker: '[L69] TSH', value: 1.96, unit: 'mU/l', analyte_key: 'tsh', sample_date: '2025-03-01', sample_date_precision: 'month' }),
      r({ id: 'y', marker: 'TSH (L69)', value: 2.33, unit: 'µIU/mL', analyte_key: 'tsh', sample_date: '2025-09-01', sample_date_precision: 'month' }),
    ], '2024-01-01')
    expect(s.series).toHaveLength(1)
    expect(s.lines[0].delta).toBeCloseTo(0.37, 2)
  })

  it('falls back to marker and unit when the analyte was not identified', () => {
    const s = buildLabs([
      r({ id: 'u1', marker: 'Неведомый маркер', value: 1, unit: 'ед', analyte_key: null, sample_date: '2025-01-01', sample_date_precision: 'day' }),
      r({ id: 'u2', marker: 'Неведомый маркер', value: 2, unit: 'ед', analyte_key: null, sample_date: '2025-06-01', sample_date_precision: 'day' }),
    ], '2024-01-01')
    expect(s.series).toHaveLength(1)
    expect(s.unidentifiedMarkers).toBe(1)
  })

  it('prints no delta between two results whose order inside a month is unknown', () => {
    const s = buildLabs([
      r({ id: 'm1', marker: 'FERRITINA', value: 85, unit: 'ng/mL', analyte_key: 'ferritin', sample_date: '2025-09-01', sample_date_precision: 'month' }),
      r({ id: 'm2', marker: 'Ferrytyna (L05)', value: 68, unit: 'ng/mL', analyte_key: 'ferritin', sample_date: '2025-09-01', sample_date_precision: 'month' }),
    ], '2024-01-01')
    expect(s.lines[0].delta).toBeNull()
    expect(s.lines[0].orderKnown).toBe(false)
  })

  it('marks a row whose sample date is unknown instead of printing the import date', () => {
    const s = buildLabs([
      r({ id: 'n', marker: 'FERRITINA', value: 85, unit: 'ng/mL', analyte_key: 'ferritin',
          date: '2026-06-20', sample_date: null, sample_date_precision: 'unknown' }),
    ], '2024-01-01')
    expect(s.lines[0].date).toBeNull()
    expect(s.lines[0].datePrecision).toBe('unknown')
  })
})

describe('buildLabs — precision belongs to each date, not to the row', () => {
  it('keeps the previous result at its own precision', () => {
    // Spring draw dated to the day, summer one only to its month. Rendering
    // the previous date with the current row's precision would hide a day the
    // source actually gave.
    const s = buildLabs([
      r({ id: '1', marker: 'FERRITINA', value: 24, unit: 'ng/mL', analyte_key: 'ferritin',
          sample_date: '2026-04-03', sample_date_precision: 'day' }),
      r({ id: '2', marker: 'FERRITINA', value: 41, unit: 'ng/mL', analyte_key: 'ferritin',
          sample_date: '2026-07-01', sample_date_precision: 'month' }),
    ], '2026-01-01')
    expect(s.lines[0].datePrecision).toBe('month')
    expect(s.lines[0].prevPrecision).toBe('day')
  })
})
