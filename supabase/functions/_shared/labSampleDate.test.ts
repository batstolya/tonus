import { describe, expect, it } from 'vitest'
import { parseSampleDate, resolveSampleDate, sampleDateFromFileName } from './labSampleDate.ts'

describe('parseSampleDate', () => {
  it('keeps a full date at day precision', () => {
    expect(parseSampleDate('2025-09-14')).toEqual({ date: '2025-09-14', precision: 'day' })
  })

  it('anchors a month to its first day and says the precision is month', () => {
    expect(parseSampleDate('2025-09')).toEqual({ date: '2025-09-01', precision: 'month' })
  })

  it('refuses anything it cannot read, rather than inventing a date', () => {
    for (const v of ['', null, undefined, 'вчера', '14.09.2025', '2025', '2025-13', '1899-01']) {
      expect(parseSampleDate(v), String(v)).toBeNull()
    }
  })
})

describe('sampleDateFromFileName', () => {
  it('reads the month from the four names already in production', () => {
    expect(sampleDateFromFileName('2024-09_Analisis_Spain.pdf')).toEqual({ date: '2024-09-01', precision: 'month' })
    expect(sampleDateFromFileName('2025-03_Analisis_Poland.pdf')).toEqual({ date: '2025-03-01', precision: 'month' })
    expect(sampleDateFromFileName('2025-09_Analisis_Poznan_1.pdf')).toEqual({ date: '2025-09-01', precision: 'month' })
    expect(sampleDateFromFileName('2025-09_Analisis_Poznan_2.pdf')).toEqual({ date: '2025-09-01', precision: 'month' })
  })

  it('prefers a full date when the name carries one', () => {
    expect(sampleDateFromFileName('2025-09-14_blood.pdf')).toEqual({ date: '2025-09-14', precision: 'day' })
  })

  it('finds nothing in a name without a date', () => {
    expect(sampleDateFromFileName('scan.pdf')).toBeNull()
    expect(sampleDateFromFileName('')).toBeNull()
  })
})

describe('resolveSampleDate', () => {
  it('prefers the date read from the form itself', () => {
    expect(resolveSampleDate('2025-09-14', '2024-09_x.pdf', '2026-06-20'))
      .toEqual({ date: '2025-09-14', precision: 'day' })
  })

  it('falls back to the file name — the path that would have saved all four files', () => {
    expect(resolveSampleDate('', '2024-09_Analisis_Spain.pdf', '2026-06-20'))
      .toEqual({ date: '2024-09-01', precision: 'month' })
  })

  it('uses the upload field only when the form and the name gave nothing', () => {
    expect(resolveSampleDate('', 'scan.pdf', '2026-06-20'))
      .toEqual({ date: '2026-06-20', precision: 'day' })
  })

  it('never invents today when every source is empty', () => {
    // The whole defect in one assertion: the old code produced the current date
    // here, and 83 results inherited it.
    expect(resolveSampleDate('', 'scan.pdf', '')).toEqual({ date: null, precision: 'unknown' })
    expect(resolveSampleDate(null, null, null)).toEqual({ date: null, precision: 'unknown' })
  })
})
