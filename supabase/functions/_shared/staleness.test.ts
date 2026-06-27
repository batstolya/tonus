import { describe, it, expect } from 'vitest'
import { daysSinceFreshData, freshestDataTs } from './staleness.ts'

describe('daysSinceFreshData', () => {
  const now = Date.parse('2026-06-27T16:44:00Z')

  it('returns null when there is no freshness signal at all', () => {
    expect(daysSinceFreshData(now, null, undefined)).toBeNull()
  })

  it('counts days since a lone manual export', () => {
    // последний ручной экспорт — 18 июня 21:59 → 8 полных суток
    expect(daysSinceFreshData(now, '2026-06-18T21:59:12Z')).toBe(8)
  })

  it('lets a fresh auto-sync override a stale manual export (the bug)', () => {
    // экспорт 8 дней назад, но автосинк был вчера → свежесть по автосинку = 0 дн
    expect(daysSinceFreshData(now, '2026-06-18T21:59:12Z', '2026-06-26T17:11:26Z')).toBe(0)
  })

  it('takes the freshest signal regardless of argument order', () => {
    expect(daysSinceFreshData(now, '2026-06-26T17:11:26Z', '2026-06-18T21:59:12Z')).toBe(0)
  })

  it('works with only an auto-sync timestamp', () => {
    expect(daysSinceFreshData(now, null, '2026-06-20T10:00:00Z')).toBe(7)
  })
})

describe('freshestDataTs', () => {
  it('returns null when there is no signal', () => {
    expect(freshestDataTs(null, undefined)).toBeNull()
  })

  it('returns the most recent timestamp in ms regardless of order', () => {
    const expected = Date.parse('2026-06-26T17:11:26Z')
    expect(freshestDataTs('2026-06-18T21:59:12Z', '2026-06-26T17:11:26Z')).toBe(expected)
    expect(freshestDataTs('2026-06-26T17:11:26Z', '2026-06-18T21:59:12Z')).toBe(expected)
  })
})
