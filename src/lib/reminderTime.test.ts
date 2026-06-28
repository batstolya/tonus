import { describe, it, expect } from 'vitest'
import { describeNextReminder } from './reminderTime'

const ALL = [1, 2, 3, 4, 5, 6, 7]
// 2026-06-29 is a Monday.
const monday = (h: number, m = 0) => new Date(2026, 5, 29, h, m)

describe('describeNextReminder', () => {
  it('returns today when a time is still ahead', () => {
    expect(describeNextReminder(['08:00'], ALL, monday(0, 27))).toEqual({ offsetDays: 0, time: '08:00' })
  })

  it('rolls to tomorrow when today’s only time has passed', () => {
    expect(describeNextReminder(['08:00'], ALL, monday(13))).toEqual({ offsetDays: 1, time: '08:00' })
  })

  it('picks the next upcoming time among several today', () => {
    expect(describeNextReminder(['08:00', '22:00'], ALL, monday(13))).toEqual({ offsetDays: 0, time: '22:00' })
  })

  it('skips non-selected weekdays', () => {
    // only Saturday(6)+Sunday(7); from Monday 13:00 → next is Saturday = +5 days
    expect(describeNextReminder(['08:00'], [6, 7], monday(13))).toEqual({ offsetDays: 5, time: '08:00' })
  })

  it('returns null for empty times or weekdays', () => {
    expect(describeNextReminder([], ALL, monday(9))).toBeNull()
    expect(describeNextReminder(['08:00'], [], monday(9))).toBeNull()
  })
})
