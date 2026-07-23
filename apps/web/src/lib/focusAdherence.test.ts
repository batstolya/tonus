import { describe, it, expect } from 'vitest'
import { evaluateFocus, type FocusData } from './focusAdherence'
import type { DailyMetrics } from '../types'

const setAt = '2020-01-01T08:00:00Z'
const dates = Array.from({ length: 7 }, (_, i) => `2020-01-0${i + 1}`)

function daily(overrides: Partial<DailyMetrics>[] = []): DailyMetrics[] {
  return dates.map((date, i) => ({ date, ...(overrides[i] ?? {}) }))
}
const empty: FocusData = { daily: [], intake: [], wellbeingByDate: {} }

describe('evaluateFocus', () => {
  it('steps_gte: считает дни с шагами >= порога', () => {
    const data: FocusData = { ...empty, daily: daily(dates.map((_, i) => ({ steps: i < 4 ? 9000 : 100 }))) }
    const p = evaluateFocus({ predicate: { kind: 'steps_gte', value: 8000 } }, setAt, data)
    expect(p.mode).toBe('daily'); expect(p.denom).toBe(7); expect(p.daysMet).toBe(4)
    expect(p.perDay).toHaveLength(7); expect(p.perDay.every(d => !d.future)).toBe(true)
  })

  it('presence-цель без данных = не выполнено', () => {
    const p = evaluateFocus({ predicate: { kind: 'steps_gte', value: 8000 } }, setAt, empty)
    expect(p.daysMet).toBe(0)
  })

  it('meals_gte: считает meal-события за день', () => {
    const intake = [
      { ts: '2020-01-01T09:00:00Z', type: 'meal' }, { ts: '2020-01-01T13:00:00Z', type: 'meal' }, { ts: '2020-01-01T19:00:00Z', type: 'meal' },
      { ts: '2020-01-02T13:00:00Z', type: 'meal' },
    ]
    const p = evaluateFocus({ predicate: { kind: 'meals_gte', value: 3 } }, setAt, { ...empty, intake })
    expect(p.daysMet).toBe(1) // только 1-е
  })

  it('event_absent: день без события = выполнено (absence-цель)', () => {
    const intake = [{ ts: '2020-01-03T20:00:00Z', type: 'alcohol' }]
    const p = evaluateFocus({ predicate: { kind: 'event_absent', event: 'alcohol' } }, setAt, { ...empty, intake })
    expect(p.daysMet).toBe(6) // все кроме 3-го
  })

  it('event_absent_after: кофе после 16:00 ломает день', () => {
    const intake = [
      { ts: '2020-01-01T09:00:00', type: 'coffee' },  // утро — ок
      { ts: '2020-01-02T18:00:00', type: 'coffee' },  // вечер — не ок
    ]
    const p = evaluateFocus({ predicate: { kind: 'event_absent_after', event: 'coffee', time: '16:00' } }, setAt, { ...empty, intake })
    expect(p.perDay.find(d => d.date === '2020-01-02')!.met).toBe(false)
    expect(p.daysMet).toBe(6)
  })

  it('bedtime_before: отбой после полуночи = поздно', () => {
    const d = daily([
      { sleepBedtime: '2020-01-01T22:30:00' }, // рано — ок
      { sleepBedtime: '2020-01-03T00:30:00' }, // 00:30 — поздно
    ])
    const p = evaluateFocus({ predicate: { kind: 'bedtime_before', time: '23:00' } }, setAt, { ...empty, daily: d })
    expect(p.perDay[0].met).toBe(true)
    expect(p.perDay[1].met).toBe(false)
  })

  it('weekly: target задаёт знаменатель и done', () => {
    const intake = ['2020-01-01', '2020-01-03', '2020-01-05'].map(d => ({ ts: `${d}T18:00:00Z`, type: 'workout' }))
    const p = evaluateFocus({ predicate: { kind: 'event_present', event: 'workout' }, target: 3 }, setAt, { ...empty, intake })
    expect(p.mode).toBe('weekly'); expect(p.denom).toBe(3); expect(p.daysMet).toBe(3); expect(p.done).toBe(true)
  })

  it('wellbeing_gte: по самочувствию', () => {
    const p = evaluateFocus({ predicate: { kind: 'wellbeing_gte', value: 4 } }, setAt, { ...empty, wellbeingByDate: { '2020-01-01': 5, '2020-01-02': 3 } })
    expect(p.daysMet).toBe(1)
  })
})
