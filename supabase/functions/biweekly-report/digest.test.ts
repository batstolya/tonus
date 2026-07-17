import { describe, expect, it } from 'vitest'
import { coverage, lateBedtimes, lateComparisonLine, localHHMM, lowHrvDays, median } from './digest.ts'

describe('localHHMM', () => {
  it('renders an instant in the given timezone', () => {
    expect(localHHMM('2026-07-10T23:13:00Z', 'Europe/Kyiv')).toBe('02:13')
  })

  it('respects winter offset (DST regression: Kyiv is UTC+2 in January, not Moscow +3)', () => {
    expect(localHHMM('2026-01-10T22:30:00Z', 'Europe/Kyiv')).toBe('00:30')
  })
})

describe('lateBedtimes', () => {
  const s = (date: string, bedtime: string | null) => ({ date, bedtime })

  it('flags bedtimes at or after 01:00 local', () => {
    const out = lateBedtimes([s('2026-07-11', '2026-07-10T23:13:00Z')], 'Europe/Kyiv')
    expect(out).toEqual([{ date: '2026-07-11', local: '02:13' }])
  })

  it('does not flag 00:30 local in winter (old UTC threshold flagged it)', () => {
    expect(lateBedtimes([s('2026-01-11', '2026-01-10T22:30:00Z')], 'Europe/Kyiv')).toEqual([])
  })

  it('treats exactly 01:00 as late and 00:59 as not late', () => {
    expect(lateBedtimes([s('d1', '2026-07-10T22:00:00Z')], 'Europe/Kyiv')).toHaveLength(1)
    expect(lateBedtimes([s('d2', '2026-07-10T21:59:00Z')], 'Europe/Kyiv')).toEqual([])
  })

  it('caps the late window before 09:00 local (evening bedtimes are not late)', () => {
    expect(lateBedtimes([s('d1', '2026-07-10T20:00:00Z')], 'Europe/Kyiv')).toEqual([]) // 23:00
    expect(lateBedtimes([s('d2', '2026-07-11T06:30:00Z')], 'Europe/Kyiv')).toEqual([]) // 09:30
  })

  it('skips rows without bedtime', () => {
    expect(lateBedtimes([s('d1', null)], 'Europe/Kyiv')).toEqual([])
  })
})

describe('median', () => {
  it('returns the middle value for odd counts', () => {
    expect(median([85, 60, 90])).toBe(85)
  })
  it('averages the two middle values for even counts', () => {
    expect(median([60, 80, 90, 100])).toBe(85)
  })
  it('returns null for empty input', () => {
    expect(median([])).toBeNull()
  })
})

describe('lowHrvDays', () => {
  const rows = [
    { date: '2026-07-13', hrv: 58 },
    { date: '2026-07-14', hrv: 64 },
    { date: '2026-07-15', hrv: 90 },
    { date: '2026-07-16', hrv: null },
  ]

  it('flags days below 80% of the personal baseline', () => {
    expect(lowHrvDays(rows, 85)).toEqual([
      { date: '2026-07-13', hrv: 58 },
      { date: '2026-07-14', hrv: 64 },
    ])
  })

  it('keeps the 80% boundary exclusive', () => {
    expect(lowHrvDays([{ date: 'd', hrv: 68 }], 85)).toEqual([]) // 68 = 0.8 * 85
  })
})

describe('coverage', () => {
  it('reports metric days and sleep nights against the period length', () => {
    expect(coverage(14, 14, 11)).toBe('Покрытие данных: метрики 14/14 дней, сон 11/14 ночей')
  })
})

describe('lateComparisonLine', () => {
  it('states both counts as a precomputed fact', () => {
    expect(lateComparisonLine(10, 12)).toBe(
      'Поздние засыпания (после 01:00 локального): текущий период 10, предыдущий 12',
    )
  })
})
