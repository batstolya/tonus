import { describe, it, expect } from 'vitest'
import { dayKey, logDays } from './intakeDays'

const at = (iso: string) => ({ ts: iso })

describe('dayKey', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // 23:30 local on the 2nd is still the 2nd, even where UTC has rolled over.
    const d = new Date(2026, 7, 2, 23, 30)
    expect(dayKey(d)).toBe('2026-08-02')
  })
})

describe('logDays', () => {
  const today = '2026-08-02'

  it('always offers today first, even with no events on it', () => {
    expect(logDays([], today)).toEqual([today])
  })

  it('lists the days that carry events, newest first', () => {
    const events = [
      at('2026-07-31T09:00:00'),
      at('2026-08-02T08:00:00'),
      at('2026-08-01T20:00:00'),
      at('2026-08-01T09:00:00'),
    ]
    expect(logDays(events, today)).toEqual(['2026-08-02', '2026-08-01', '2026-07-31'])
  })

  it('skips days with nothing logged, so an arrow never lands on an empty day', () => {
    const events = [at('2026-07-28T09:00:00'), at('2026-08-02T09:00:00')]
    expect(logDays(events, today)).toEqual(['2026-08-02', '2026-07-28'])
  })

  it('ignores days in the future — the log looks backwards', () => {
    const events = [at('2026-08-05T09:00:00'), at('2026-08-01T09:00:00')]
    expect(logDays(events, today)).toEqual(['2026-08-02', '2026-08-01'])
  })
})
