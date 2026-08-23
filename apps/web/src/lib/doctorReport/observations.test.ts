import { describe, it, expect } from 'vitest'
import { buildObservations } from './observations'
import type { Observation } from '../observations'

// The report section for free-form observations: a per-tag summary, then every
// entry in order. Spec: 2026-08-23-observations-design.md

const obs = (
  date: string, at_time: string | null, tag: Observation['tag'], note: string,
): Observation => ({
  id: `${date}-${at_time ?? 'x'}`, user_id: 'u1', date, at_time, tag, note,
  created_at: date,
})

describe('buildObservations', () => {
  it('counts entries per tag, busiest first', () => {
    const out = buildObservations([
      obs('2026-08-20', '09:00:00', 'skin', 'a'),
      obs('2026-08-21', '09:00:00', 'skin', 'b'),
      obs('2026-08-22', '09:00:00', 'sleep', 'c'),
    ], '2026-08-01')
    expect(out.byTag).toEqual([
      { tag: 'skin', count: 2 },
      { tag: 'sleep', count: 1 },
    ])
    expect(out.total).toBe(3)
  })

  it('orders entries oldest first', () => {
    const out = buildObservations([
      obs('2026-08-22', '08:00:00', 'other', 'later'),
      obs('2026-08-20', '08:00:00', 'other', 'earlier'),
    ], '2026-08-01')
    expect(out.entries.map(e => e.note)).toEqual(['earlier', 'later'])
  })

  it('keeps an entry without a time at the end of its day', () => {
    const out = buildObservations([
      obs('2026-08-20', null, 'other', 'untimed'),
      obs('2026-08-20', '21:00:00', 'other', 'evening'),
      obs('2026-08-20', '07:00:00', 'other', 'morning'),
    ], '2026-08-01')
    expect(out.entries.map(e => e.note)).toEqual(['morning', 'evening', 'untimed'])
  })

  it('prints the time as HH:MM and drops an unknown one', () => {
    const out = buildObservations([
      obs('2026-08-20', '07:05:00', 'gut', 'timed'),
      obs('2026-08-21', null, 'gut', 'untimed'),
    ], '2026-08-01')
    expect(out.entries[0].time).toBe('07:05')
    expect(out.entries[1].time).toBe('')
  })

  it('drops entries from before the period', () => {
    const out = buildObservations([
      obs('2026-07-30', '09:00:00', 'skin', 'old'),
      obs('2026-08-02', '09:00:00', 'skin', 'inside'),
    ], '2026-08-01')
    expect(out.total).toBe(1)
    expect(out.entries[0].note).toBe('inside')
  })

  it('is empty for a period with nothing in it', () => {
    const out = buildObservations([], '2026-08-01')
    expect(out.total).toBe(0)
    expect(out.entries).toEqual([])
    expect(out.byTag).toEqual([])
  })
})
