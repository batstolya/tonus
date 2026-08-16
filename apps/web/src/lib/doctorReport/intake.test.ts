import { describe, it, expect } from 'vitest'
import { buildIntake, REPORTED_TYPES } from './intake'
import { periodFrame } from './metrics'
import type { DailyMetrics } from '../../types'
import type { IntakeEvent } from '../api/intake'

const today = '2026-07-31'
// 30 calendar days of records, so the frame is not clamped by short history.
const daily: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.parse(`${today}T00:00:00Z`) - (29 - i) * 86400000).toISOString().slice(0, 10),
  steps: 9000,
}))
const frame = periodFrame(daily, 30, today)

let seq = 0
const ev = (over: Partial<IntakeEvent> & { ts: string; type: string }): IntakeEvent => ({
  id: `e${seq++}`, amount: null, unit: null, note: null, ...over,
})

describe('buildIntake', () => {
  it('reports medication only; every drink belongs to the drinks section now', () => {
    expect(REPORTED_TYPES).toEqual(['meds'])
  })

  it('counts days against calendar days, not against days that have events', () => {
    const events = [
      ev({ ts: '2026-07-29T09:00:00', type: 'meds', amount: 1, unit: 'таб' }),
      ev({ ts: '2026-07-29T14:00:00', type: 'meds', amount: 1, unit: 'таб' }),
      ev({ ts: '2026-07-30T09:00:00', type: 'meds', amount: 1, unit: 'таб' }),
    ]
    const [line] = buildIntake(events, frame)
    expect(line.type).toBe('meds')
    expect(line.days).toBe(2)
    expect(line.calendarDays).toBe(30)
    expect(line.events).toBe(3)
  })

  it('takes the dose median over days with a mark, not over events', () => {
    // Day one: two doses of 200 => 400. Day two: one dose of 100.
    // Median over days is 250; a median over events would be 200.
    const events = [
      ev({ ts: '2026-07-29T09:00:00', type: 'meds', amount: 200, unit: 'мг' }),
      ev({ ts: '2026-07-29T14:00:00', type: 'meds', amount: 200, unit: 'мг' }),
      ev({ ts: '2026-07-30T09:00:00', type: 'meds', amount: 100, unit: 'мг' }),
    ]
    const [line] = buildIntake(events, frame)
    expect(line.medianPerDay).toBe(250)
    expect(line.unit).toBe('мг')
  })

  it('prints no dose when the type carries no amounts', () => {
    const events = [
      ev({ ts: '2026-07-29T08:00:00', type: 'meds', note: 'Магний' }),
      ev({ ts: '2026-07-30T08:00:00', type: 'meds', note: 'Магний' }),
    ]
    const [line] = buildIntake(events, frame)
    expect(line.medianPerDay).toBeNull()
    expect(line.unit).toBeNull()
  })

  it('names medications with their counts, commonest first', () => {
    const events = [
      ev({ ts: '2026-07-25T08:00:00', type: 'meds', note: 'Магний' }),
      ev({ ts: '2026-07-26T08:00:00', type: 'meds', note: 'магний ' }),
      ev({ ts: '2026-07-27T08:00:00', type: 'meds', note: 'Ибупрофен' }),
      ev({ ts: '2026-07-28T08:00:00', type: 'meds', note: null }),
    ]
    const [line] = buildIntake(events, frame)
    expect(line.names).toEqual([
      { name: 'Магний', count: 2 },
      { name: 'Ибупрофен', count: 1 },
      { name: null, count: 1 },
    ])
  })

  it('reports a median time that respects the evening seam', () => {
    const events = [
      ev({ ts: '2026-07-27T17:55:00', type: 'meds', amount: 1, unit: 'таб' }),
      ev({ ts: '2026-07-28T18:05:00', type: 'meds', amount: 1, unit: 'таб' }),
    ]
    const [line] = buildIntake(events, frame)
    expect(line.time!.median).toBe('18:00')
  })

  it('ignores events outside the period and types the report does not carry', () => {
    const events = [
      ev({ ts: '2026-05-01T09:00:00', type: 'meds', note: 'Магний' }),
      ev({ ts: '2026-07-29T20:00:00', type: 'alcohol', amount: 150, unit: 'мл' }),
      ev({ ts: '2026-07-29T09:00:00', type: 'coffee', amount: 200, unit: 'мл' }),
      ev({ ts: '2026-07-29T13:00:00', type: 'water', amount: 250, unit: 'мл' }),
      ev({ ts: '2026-07-29T20:00:00', type: 'meal' }),
    ]
    expect(buildIntake(events, frame)).toEqual([])
  })

  it('keeps medication as the only line it prints', () => {
    const events = [
      ev({ ts: '2026-07-29T20:00:00', type: 'alcohol', amount: 150, unit: 'мл' }),
      ev({ ts: '2026-07-29T08:00:00', type: 'meds', note: 'Магний' }),
    ]
    expect(buildIntake(events, frame).map(l => l.type)).toEqual(['meds'])
  })
})
