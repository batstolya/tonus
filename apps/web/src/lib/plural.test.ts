import { describe, it, expect } from 'vitest'
import { pluralDays } from './plural'

// "нема 5 дн" read as clipped machine output. Slavic day counts need three
// forms, and the teens are the trap: 11 днів, not 11 день.
describe('pluralDays', () => {
  it('picks the Ukrainian forms', () => {
    expect(pluralDays(1, 'uk')).toBe('день')
    expect(pluralDays(2, 'uk')).toBe('дні')
    expect(pluralDays(3, 'uk')).toBe('дні')
    expect(pluralDays(4, 'uk')).toBe('дні')
    expect(pluralDays(5, 'uk')).toBe('днів')
    expect(pluralDays(14, 'uk')).toBe('днів')
    expect(pluralDays(21, 'uk')).toBe('день')
  })

  it('does not fall into the teens trap', () => {
    for (const n of [11, 12, 13, 14]) {
      expect(pluralDays(n, 'uk'), `${n} must use the many form`).toBe('днів')
      expect(pluralDays(n, 'ru'), `${n} must use the many form`).toBe('дней')
    }
  })

  it('picks the Russian forms', () => {
    expect(pluralDays(1, 'ru')).toBe('день')
    expect(pluralDays(3, 'ru')).toBe('дня')
    expect(pluralDays(5, 'ru')).toBe('дней')
  })

  it('picks the English forms', () => {
    expect(pluralDays(1, 'en')).toBe('day')
    expect(pluralDays(2, 'en')).toBe('days')
    expect(pluralDays(14, 'en')).toBe('days')
  })
})
