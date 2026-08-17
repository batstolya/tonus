import { describe, it, expect } from 'vitest'
import { buildConcerns, buildJournal } from './journal'
import type { HealthConcern, ConcernLog } from '../concerns'

const concern = (id: string, over: Partial<HealthConcern> = {}): HealthConcern => ({
  id, user_id: 'u', name: 'Головные боли', category: 'other', status: 'active',
  started_at: '2026-05-31', notes: 'Чаще в дни с недосыпом', is_private: false,
  created_at: '2026-05-31T00:00:00Z', ...over,
})

const clog = (
  concern_id: string,
  date: string,
  severity: number | null,
  note: string | null = null,
  at_time: string | null = null,
): ConcernLog =>
  ({ id: `${concern_id}-${date}-${at_time ?? ''}`, concern_id, date, at_time, severity, note, photo_path: null, created_at: date } as ConcernLog)

describe('buildConcerns', () => {
  it('compares severity in the first half of the period against the second', () => {
    const logs = [
      clog('c', '2026-06-01', 4), clog('c', '2026-06-08', 4),
      clog('c', '2026-07-20', 2), clog('c', '2026-07-27', 2),
    ]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].severity).toEqual({ count: 4, avg: 3, firstHalf: 4, secondHalf: 2 })
  })

  // The doctor asked for the complaint's history, so the report prints every
  // entry of the period rather than a tail of it.
  it('keeps every logged note of the period in chronological order', () => {
    const logs = [
      clog('c', '2026-06-01', 3, 'первая'), clog('c', '2026-06-08', 3, 'вторая'),
      clog('c', '2026-06-15', 3, 'третья'), clog('c', '2026-06-22', 3, 'четвёртая'),
    ]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].logs.map(l => l.note)).toEqual(['первая', 'вторая', 'третья', 'четвёртая'])
  })

  it('drops entries logged before the period', () => {
    const logs = [clog('c', '2026-04-30', 3, 'старая'), clog('c', '2026-06-01', 3, 'своя')]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].logs.map(l => l.note)).toEqual(['своя'])
  })

  // Two entries on one day is ordinary for a symptom logged morning and
  // evening; both must survive.
  it('keeps several entries made on the same day', () => {
    const logs = [clog('c', '2026-06-01', 3, 'утро'), clog('c', '2026-06-01', 4, 'вечер')]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].logs.map(l => l.note)).toEqual(['утро', 'вечер'])
  })

  // A severity-only tick carries no text; the severity block already counts it.
  it('lists only entries that carry a note', () => {
    const logs = [clog('c', '2026-06-01', 3, ''), clog('c', '2026-06-02', 3, 'текст')]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].logs.map(l => l.note)).toEqual(['текст'])
  })

  it('orders entries of one day by time, oldest first', () => {
    const logs = [
      clog('c', '2026-06-01', 3, 'вечером', '19:30'),
      clog('c', '2026-06-01', 3, 'утром', '08:05'),
      clog('c', '2026-06-01', 3, 'в обед', '13:00'),
    ]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].logs.map(l => l.note)).toEqual(['утром', 'в обед', 'вечером'])
  })

  it('carries the time of each entry through to the report model', () => {
    const logs = [clog('c', '2026-06-01', 3, 'запись', '12:00:00')]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].logs[0].at_time).toBe('12:00:00')
  })

  // Rows stored before the time column existed keep working, and they are not
  // reordered ahead of entries whose time is known.
  it('places an entry without a time after the timed entries of its day', () => {
    const logs = [
      clog('c', '2026-06-01', 3, 'без времени', null),
      clog('c', '2026-06-01', 3, 'в 12', '12:00'),
    ]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].logs.map(l => l.note)).toEqual(['в 12', 'без времени'])
    expect(out[0].logs[1].at_time).toBeNull()
  })

  it('has no severity block when nothing was logged', () => {
    expect(buildConcerns([concern('c')], [], '2026-05-03')[0].severity).toBeNull()
  })
})

describe('buildJournal', () => {
  it('averages wellbeing per week and keeps every note of the period', () => {
    const notes = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 10).padStart(2, '0')}`,
      note: `запись ${i}`,
      wellbeing: 4,
    }))
    const j = buildJournal(notes, '2026-05-03')
    expect(j.wellbeingCount).toBe(14)
    expect(j.wellbeingAvg).toBe(4)
    expect(j.notes).toHaveLength(14)
    expect(j.notes[0].note).toBe('запись 0')
    expect(j.notes[13].note).toBe('запись 13')
    expect(j.weeks.every(w => w.avg === 4)).toBe(true)
  })

  it('keeps both notes written on the same day', () => {
    const notes = [
      { date: '2026-07-10', note: 'утро', wellbeing: 4 },
      { date: '2026-07-10', note: 'вечер', wellbeing: 2 },
    ]
    expect(buildJournal(notes, '2026-05-03').notes.map(n => n.note)).toEqual(['утро', 'вечер'])
  })


  it('drops notes from before the period', () => {
    const j = buildJournal([{ date: '2026-01-01', note: 'старое', wellbeing: 3 }], '2026-05-03')
    expect(j.notes).toEqual([])
    expect(j.wellbeingAvg).toBeNull()
  })
})
