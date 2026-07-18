import { describe, it, expect } from 'vitest'
import { localNow, timeDue } from './time.ts'

describe('timeDue', () => {
  it('fires inside the 5-minute cron window [target, target+5)', () => {
    expect(timeDue('09:00', '09:00')).toBe(true)
    expect(timeDue('09:00', '09:04')).toBe(true)
    expect(timeDue('09:00', '09:05')).toBe(false)
    expect(timeDue('09:00', '08:59')).toBe(false)
  })

  it('handles hour boundaries in pure minute arithmetic', () => {
    expect(timeDue('23:58', '23:59')).toBe(true)
    // window crossing midnight does NOT wrap (documented existing behavior)
    expect(timeDue('23:58', '00:01')).toBe(false)
  })
})

describe('localNow', () => {
  it('returns hh:mm, ISO-like date and 1..7 weekday for a real timezone', () => {
    const r = localNow('Europe/Kyiv')
    expect(r.hhmm).toMatch(/^\d{2}:\d{2}$/)
    expect(r.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.weekday).toBeGreaterThanOrEqual(1)
    expect(r.weekday).toBeLessThanOrEqual(7)
  })

  it('differs across timezones far apart', () => {
    const kyiv = localNow('Europe/Kyiv')
    const tokyo = localNow('Asia/Tokyo')
    // Tokyo is 6-7 hours ahead of Kyiv; compare full tuples to avoid a flaky exact-hour assertion.
    expect(`${tokyo.dateStr} ${tokyo.hhmm}`).not.toBe(`${kyiv.dateStr} ${kyiv.hhmm}`)
  })
})
