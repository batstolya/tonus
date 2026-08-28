import { describe, it, expect } from 'vitest'
import { buildHabitsSection } from './habits'

const habit = {
  id: 'h1', user_id: 'u1', name: 'Без сладкого', note: null,
  start_date: '2026-08-01', active: true, sort_order: 0, created_at: '2026-08-01T00:00:00Z',
}

describe('buildHabitsSection', () => {
  it('reports the period and the slip dates', () => {
    const rows = buildHabitsSection(
      [habit],
      [{ id: 'b1', habit_id: 'h1', date: '2026-08-10', note: null }],
      '2026-08-28',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Без сладкого')
    expect(rows[0].breakDates).toEqual(['2026-08-10'])
    expect(rows[0].startDate).toBe('2026-08-01')
  })

  it('omits archived habits', () => {
    expect(buildHabitsSection([{ ...habit, active: false }], [], '2026-08-28')).toEqual([])
  })

  it('handles a habit with no slips', () => {
    const rows = buildHabitsSection([habit], [], '2026-08-28')
    expect(rows[0].breakDates).toEqual([])
    expect(rows[0].cleanDays).toBe(27)
  })
})
