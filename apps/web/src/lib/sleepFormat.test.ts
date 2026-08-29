import { describe, it, expect } from 'vitest'
import { hoursToHM, effectiveWake, circularMeanHours, averageTimeOfDay } from './sleepFormat'

describe('hoursToHM', () => {
  it('обычные значения', () => {
    expect(hoursToHM(7.5)).toEqual({ hrs: 7, mins: 30 })
    expect(hoursToHM(1.67)).toEqual({ hrs: 1, mins: 40 })
    expect(hoursToHM(0)).toEqual({ hrs: 0, mins: 0 })
  })
  it('минуты, округляющиеся до 60, переносятся в час (баг «6год 60хв»)', () => {
    expect(hoursToHM(6.993)).toEqual({ hrs: 7, mins: 0 })
    expect(hoursToHM(7.992)).toEqual({ hrs: 8, mins: 0 })
    expect(hoursToHM(1.998)).toEqual({ hrs: 2, mins: 0 })
  })
  it('почти целое снизу не даёт лишнюю минуту', () => {
    expect(hoursToHM(2.001)).toEqual({ hrs: 2, mins: 0 })
  })
})

describe('effectiveWake', () => {
  it('нормальная ночь — оставляет реальное пробуждение (сон < время в постели)', () => {
    // в постели 8ч, спал 7.5ч — 30 мин бодрствования в кровати, это норма
    const wake = effectiveWake('2026-06-21T00:00:00Z', '2026-06-21T08:00:00Z', 7.5)
    expect(wake).toBe('2026-06-21T08:00:00Z')
  })
  it('битый wake (13.06: пробуждение на сутки позже) → отбой + длительность', () => {
    const wake = effectiveWake('2026-06-13T00:14:24Z', '2026-06-13T23:55:33Z', 7.3178)
    // 00:14:24 + 7ч19м04с ≈ 07:33:28Z
    expect(wake!.slice(0, 16)).toBe('2026-06-13T07:33')
  })
  it('в постели меньше длительности сна (невозможно) → производное', () => {
    const wake = effectiveWake('2026-06-01T00:00:00Z', '2026-06-01T05:00:00Z', 7)
    expect(wake!.slice(11, 16)).toBe('07:00')
  })
  it('нет wake, но есть длительность → производное', () => {
    const wake = effectiveWake('2026-06-01T23:00:00Z', null, 6)
    expect(wake!.slice(11, 16)).toBe('05:00')
  })
  it('нет данных для вывода — возвращает как есть', () => {
    expect(effectiveWake(null, '2026-06-01T08:00:00Z', 7)).toBe('2026-06-01T08:00:00Z')
    expect(effectiveWake('2026-06-01T00:00:00Z', '2026-06-01T30:00:00Z', null)).toBe('2026-06-01T30:00:00Z')
  })
})

describe('circularMeanHours', () => {
  it('averages plain morning times linearly', () => {
    expect(circularMeanHours([9, 10, 11])).toBeCloseTo(10, 5)
  })
  it('averages across midnight instead of landing at noon', () => {
    // 23:00 and 01:00 average to midnight, not to 12:00
    expect(circularMeanHours([23, 1])).toBeCloseTo(0, 5)
  })
  it('a single late wake-up shifts the mean forward, never backwards', () => {
    // 27 mornings at 09:50 plus one at 12:10 must stay near 09:50 —
    // the linear "hours from noon" mean fell to ~07:00 here.
    const wakes = [...Array(27).fill(9 + 50 / 60), 12 + 10 / 60]
    const mean = circularMeanHours(wakes)!
    expect(mean).toBeGreaterThan(9 + 50 / 60)
    expect(mean).toBeLessThan(10.1)
  })
  it('returns null for an empty sample', () => {
    expect(circularMeanHours([])).toBeNull()
  })
  it('normalises the result into [0, 24)', () => {
    const mean = circularMeanHours([23.5, 0.5])!
    expect(mean).toBeGreaterThanOrEqual(0)
    expect(mean).toBeLessThan(24)
  })
})

describe('averageTimeOfDay', () => {
  it('ignores missing timestamps instead of counting them as midnight', () => {
    const withGap = averageTimeOfDay(['2026-08-28T09:00:00', undefined, '2026-08-29T11:00:00'])
    const withoutGap = averageTimeOfDay(['2026-08-28T09:00:00', '2026-08-29T11:00:00'])
    expect(withGap).toBeCloseTo(withoutGap!, 5)
    expect(withGap).toBeCloseTo(10, 5)
  })
  it('returns null when nothing is measured', () => {
    expect(averageTimeOfDay([undefined, null])).toBeNull()
  })
  it('averages bedtimes across midnight', () => {
    expect(averageTimeOfDay(['2026-08-28T23:00:00', '2026-08-29T01:00:00'])).toBeCloseTo(0, 5)
  })
})
