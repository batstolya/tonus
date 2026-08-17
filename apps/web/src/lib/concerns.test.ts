import { describe, it, expect } from 'vitest'
import { formatLogTime, compareLogsAsc } from './concerns'

describe('formatLogTime', () => {
  it('trims the seconds Postgres sends back', () => {
    expect(formatLogTime('12:00:00')).toBe('12:00')
    expect(formatLogTime('09:44:31')).toBe('09:44')
  })

  it('passes an HH:MM value through unchanged', () => {
    expect(formatLogTime('12:00')).toBe('12:00')
  })

  it('renders nothing when the time is unknown', () => {
    expect(formatLogTime(null)).toBe('')
    expect(formatLogTime(undefined)).toBe('')
    expect(formatLogTime('')).toBe('')
  })
})

describe('compareLogsAsc', () => {
  it('orders by date first', () => {
    const logs = [
      { date: '2026-08-16', at_time: '08:00' },
      { date: '2026-08-13', at_time: '23:00' },
    ]
    expect([...logs].sort(compareLogsAsc).map(l => l.date))
      .toEqual(['2026-08-13', '2026-08-16'])
  })

  it('orders entries of one date by time', () => {
    const logs = [
      { date: '2026-08-16', at_time: '13:00' },
      { date: '2026-08-16', at_time: '12:00' },
      { date: '2026-08-16', at_time: '09:05' },
    ]
    expect([...logs].sort(compareLogsAsc).map(l => l.at_time))
      .toEqual(['09:05', '12:00', '13:00'])
  })

  // A legacy row has no time; putting it first would claim it happened before
  // the timed entries, which nothing in the data supports.
  it('puts an entry without a time after the timed entries of its date', () => {
    const logs = [
      { date: '2026-08-16', at_time: null },
      { date: '2026-08-16', at_time: '12:00' },
    ]
    expect([...logs].sort(compareLogsAsc).map(l => l.at_time))
      .toEqual(['12:00', null])
  })

  it('compares times of different precision consistently', () => {
    const logs = [
      { date: '2026-08-16', at_time: '13:00:00' },
      { date: '2026-08-16', at_time: '09:30' },
    ]
    expect([...logs].sort(compareLogsAsc).map(l => formatLogTime(l.at_time)))
      .toEqual(['09:30', '13:00'])
  })
})
