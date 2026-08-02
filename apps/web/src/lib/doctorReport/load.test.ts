import { describe, it, expect, vi, beforeEach } from 'vitest'

const demoActive = vi.fn(() => true)
vi.mock('../demo', () => ({ isDemoActive: () => demoActive() }))
vi.mock('../demoDb', () => ({
  demoList: (table: string) => ({
    supplements: [
      { id: 'a', name: 'Магний', active: true, default_dose: '400', unit: 'мг', sort_order: 0 },
      { id: 'b', name: 'Железо', active: false, default_dose: '25', unit: 'мг', sort_order: 1 },
    ],
    supplement_logs: [{ supplement_id: 'a', date: '2026-07-30', taken: true }],
    concern_logs: [{ id: 'l1', concern_id: 'c', date: '2026-07-30', severity: 2, note: null }],
    context_notes: [
      { id: 'n1', date: '2026-07-30', note: 'устал', wellbeing: 2 },
      { id: 'n2', date: '2026-01-01', note: 'старое', wellbeing: 5 },
    ],
  }[table] ?? []),
}))

import { loadAllSupplements, loadAllConcernLogs, loadNotesWithWellbeing } from './load'

beforeEach(() => demoActive.mockReturnValue(true))

describe('demo loading', () => {
  it('keeps discontinued supplements, unlike loadSupplements', async () => {
    const out = await loadAllSupplements('u')
    expect(out.map(s => s.id)).toEqual(['a', 'b'])
  })

  it('returns concern logs for every concern at once', async () => {
    expect(await loadAllConcernLogs('u', '2026-05-03')).toHaveLength(1)
  })

  it('returns notes with their wellbeing score, cut to the period', async () => {
    const notes = await loadNotesWithWellbeing('u', '2026-05-03')
    expect(notes).toEqual([{ date: '2026-07-30', note: 'устал', wellbeing: 2 }])
  })
})
