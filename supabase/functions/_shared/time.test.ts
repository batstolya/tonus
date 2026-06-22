import { describe, it, expect } from 'vitest'
import { localToIso, localNow, tzOffsetMin } from './time.ts'

describe('localToIso', () => {
  it('computes ts relative to the message-time anchor for "час назад"', () => {
    // Сообщение отправлено в 18:19 по Берлину (16:19 UTC), «час назад» → 17:19 Берлин = 15:19 UTC
    const now = new Date('2026-06-22T16:19:00.000Z')
    const iso = localToIso('Europe/Berlin', null, null, { now, minutesAgo: 60 })
    expect(iso).toBe('2026-06-22T15:19:00.000Z')
  })

  it('handles relative offset across midnight', () => {
    const now = new Date('2026-06-22T00:30:00.000Z') // 02:30 Берлин
    const iso = localToIso('Europe/Berlin', null, null, { now, minutesAgo: 180 })
    expect(iso).toBe('2026-06-21T21:30:00.000Z')
  })

  it('resolves an absolute HH:MM to that local time on the anchor date', () => {
    const now = new Date('2026-06-22T16:19:00.000Z')
    const iso = localToIso('Europe/Berlin', '11:22', null, { now })
    expect(iso).toBe('2026-06-22T09:22:00.000Z') // 11:22 Берлин = 09:22 UTC
  })

  it('returns the anchor "now" when no time/date/offset given', () => {
    const now = new Date('2026-06-22T16:19:00.000Z')
    expect(localToIso('Europe/Berlin', null, null, { now })).toBe('2026-06-22T16:19:00.000Z')
  })

  it('minutesAgo takes priority over an absolute time', () => {
    const now = new Date('2026-06-22T16:19:00.000Z')
    const iso = localToIso('Europe/Berlin', '11:22', '2026-06-22', { now, minutesAgo: 60 })
    expect(iso).toBe('2026-06-22T15:19:00.000Z')
  })
})

describe('localNow', () => {
  it('returns local date and time for the given anchor in the tz', () => {
    const now = new Date('2026-06-22T16:19:00.000Z')
    expect(localNow('Europe/Berlin', now)).toEqual({ date: '2026-06-22', time: '18:19' })
  })
})

describe('tzOffsetMin', () => {
  it('returns +120 for Berlin in summer', () => {
    expect(tzOffsetMin('Europe/Berlin', new Date('2026-06-22T12:00:00.000Z'))).toBe(120)
  })
})
