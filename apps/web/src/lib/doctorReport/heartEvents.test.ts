import { describe, expect, it } from 'vitest'
import { buildHeartEvents, type HeartEvent } from './heartEvents'

const ev = (over: Partial<HeartEvent>): HeartEvent => ({
  kind: 'low_hr', start_ts: '2026-11-20T02:10:00Z', end_ts: '2026-11-20T02:20:00Z',
  threshold: 40, hr_min: 36, hr_max: 38, hr_avg: 37, classification: null, ...over,
})

describe('buildHeartEvents', () => {
  it('keeps only events inside the period and counts them per kind', () => {
    const s = buildHeartEvents([
      ev({ start_ts: '2026-10-01T02:00:00Z' }),
      ev({}),
      ev({ start_ts: '2026-11-21T03:00:00Z' }),
      ev({ kind: 'ecg', start_ts: '2026-11-22T09:00:00Z', threshold: null, hr_min: null, hr_max: null, hr_avg: 72, classification: 'Sinus Rhythm' }),
    ], '2026-11-01')
    expect(s.total).toBe(3)
    expect(s.byKind).toEqual([{ kind: 'low_hr', count: 2 }, { kind: 'ecg', count: 1 }])
  })

  it('lists entries oldest first with local date/time and rounded heart rate', () => {
    const s = buildHeartEvents([ev({ start_ts: '2026-11-21T03:00:00Z', hr_avg: 36.6 }), ev({})], '2026-11-01')
    expect(s.entries.map(e => e.startIso)).toEqual(['2026-11-20T02:10:00Z', '2026-11-21T03:00:00Z'])
    expect(s.entries[1]).toMatchObject({ kind: 'low_hr', threshold: 40, hrMin: 36, hrMax: 38, hrAvg: 37 })
  })

  it('is empty for a period without events', () => {
    expect(buildHeartEvents([], '2026-11-01')).toEqual({ total: 0, byKind: [], entries: [] })
  })
})

describe('buildHeartEvents: period boundary in local time', () => {
  it('keeps an event that falls on the first local day even when its UTC date is the day before', () => {
    // Pick an instant at 00:30 local on the period's first day, whatever the runner's zone.
    const local = new Date(2026, 10, 1, 0, 30)
    const s = buildHeartEvents([ev({ start_ts: local.toISOString() })], '2026-11-01')
    expect(s.total).toBe(1)
  })

  it('drops an event at 23:30 local on the day before the period', () => {
    const local = new Date(2026, 9, 31, 23, 30)
    expect(buildHeartEvents([ev({ start_ts: local.toISOString() })], '2026-11-01').total).toBe(0)
  })
})
