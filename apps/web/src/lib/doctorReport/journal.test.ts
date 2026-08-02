import { describe, it, expect } from 'vitest'
import { buildConcerns, buildJournal } from './journal'
import type { HealthConcern, ConcernLog } from '../concerns'

const concern = (id: string, over: Partial<HealthConcern> = {}): HealthConcern => ({
  id, user_id: 'u', name: 'Головные боли', category: 'other', status: 'active',
  started_at: '2026-05-31', notes: 'Чаще в дни с недосыпом', is_private: false,
  created_at: '2026-05-31T00:00:00Z', ...over,
})

const clog = (concern_id: string, date: string, severity: number | null, note: string | null = null): ConcernLog =>
  ({ id: `${concern_id}-${date}`, concern_id, date, severity, note, photo_path: null, created_at: date } as ConcernLog)

describe('buildConcerns', () => {
  it('compares severity in the first half of the period against the second', () => {
    const logs = [
      clog('c', '2026-06-01', 4), clog('c', '2026-06-08', 4),
      clog('c', '2026-07-20', 2), clog('c', '2026-07-27', 2),
    ]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].severity).toEqual({ count: 4, avg: 3, firstHalf: 4, secondHalf: 2 })
  })

  it('keeps the last three logged notes in chronological order', () => {
    const logs = [
      clog('c', '2026-06-01', 3, 'первая'), clog('c', '2026-06-08', 3, 'вторая'),
      clog('c', '2026-06-15', 3, 'третья'), clog('c', '2026-06-22', 3, 'четвёртая'),
    ]
    const out = buildConcerns([concern('c')], logs, '2026-05-03')
    expect(out[0].recentLogs.map(l => l.note)).toEqual(['вторая', 'третья', 'четвёртая'])
  })

  it('has no severity block when nothing was logged', () => {
    expect(buildConcerns([concern('c')], [], '2026-05-03')[0].severity).toBeNull()
  })
})

describe('buildJournal', () => {
  it('averages wellbeing per week and keeps the last 12 notes', () => {
    const notes = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 10).padStart(2, '0')}`,
      note: `запись ${i}`,
      wellbeing: 4,
    }))
    const j = buildJournal(notes, '2026-05-03')
    expect(j.wellbeingCount).toBe(14)
    expect(j.wellbeingAvg).toBe(4)
    expect(j.notes).toHaveLength(12)
    expect(j.notes[11].note).toBe('запись 13')
    expect(j.weeks.every(w => w.avg === 4)).toBe(true)
  })

  it('drops notes from before the period', () => {
    const j = buildJournal([{ date: '2026-01-01', note: 'старое', wellbeing: 3 }], '2026-05-03')
    expect(j.notes).toEqual([])
    expect(j.wellbeingAvg).toBeNull()
  })
})
