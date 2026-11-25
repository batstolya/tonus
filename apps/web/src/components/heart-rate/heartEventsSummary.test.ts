import { describe, expect, it } from 'vitest'
import { summarizeHeartEvents } from './heartEventsSummary'
import type { HeartEvent } from '../../lib/doctorReport/heartEvents'

// Local-time instants, so "night" does not depend on the runner's zone.
const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 10).toISOString()
const low = (iso: string, min: number | null = 38): HeartEvent => ({
  kind: 'low_hr', start_ts: iso, end_ts: null, threshold: 40, hr_min: min, hr_max: 45, hr_avg: 41, classification: 'low_heart_rate_notification',
})
const ecg = (iso: string, avg: number | null, cls: string): HeartEvent => ({
  kind: 'ecg', start_ts: iso, end_ts: null, threshold: null, hr_min: null, hr_max: null, hr_avg: avg, classification: cls,
})

describe('summarizeHeartEvents', () => {
  const events = [
    low(at(2026, 1, 10, 3), 36),
    low(at(2026, 1, 20, 4), 35),
    low(at(2026, 3, 5, 9), 39),
    ecg(at(2026, 6, 15, 19), 100, 'Sinus Rhythm'),
    ecg(at(2026, 6, 15, 20), null, 'Inconclusive Poor Recording'),
  ]
  const s = summarizeHeartEvents(events, new Date(2026, 3, 15))

  it('counts low-HR notifications, their lowest heart rate and the night share', () => {
    expect(s.lowCount).toBe(3)
    expect(s.lowestHr).toBe(35)
    expect(s.nightShare).toBeCloseTo(2 / 3)
    expect(s.ecgCount).toBe(2)
  })

  it('builds a month series from the first event to the current month, zero-filled', () => {
    expect(s.monthly).toEqual([
      { month: '2026-01', count: 2 },
      { month: '2026-02', count: 0 },
      { month: '2026-03', count: 1 },
      { month: '2026-04', count: 0 },
    ])
  })

  it('lists notifications and ECGs newest first', () => {
    expect(s.notifications.map(e => e.hr_min)).toEqual([39, 35, 36])
    expect(s.ecgs.map(e => e.classification)).toEqual(['Inconclusive Poor Recording', 'Sinus Rhythm'])
  })

  it('returns an empty summary without events', () => {
    const e = summarizeHeartEvents([], new Date(2026, 3, 15))
    expect(e).toMatchObject({ lowCount: 0, lowestHr: null, nightShare: null, ecgCount: 0, monthly: [], notifications: [], ecgs: [] })
  })
})
