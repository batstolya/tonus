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
      '2026-08-01',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Без сладкого')
    expect(rows[0].breakDates).toEqual(['2026-08-10'])
    expect(rows[0].startDate).toBe('2026-08-01')
  })

  it('omits archived habits', () => {
    expect(buildHabitsSection([{ ...habit, active: false }], [], '2026-08-28', '2026-08-01')).toEqual([])
  })

  it('handles a habit with no slips', () => {
    const rows = buildHabitsSection([habit], [], '2026-08-28', '2026-08-01')
    expect(rows[0].breakDates).toEqual([])
    // 2026-08-01 .. 2026-08-28 inclusive = 28 clean days.
    expect(rows[0].cleanDays).toBe(28)
  })

  it('respects a period shorter than the default 84-day grid', () => {
    // Habit runs since 2026-08-01; a 7-day report (period start 2026-08-22)
    // must count/list only that window, not the full history.
    const rows = buildHabitsSection(
      [habit],
      [
        { id: 'b1', habit_id: 'h1', date: '2026-08-10', note: null }, // outside the 7-day window
        { id: 'b2', habit_id: 'h1', date: '2026-08-25', note: null }, // inside it
      ],
      '2026-08-28',
      '2026-08-22',
    )
    expect(rows[0].windowDays).toBe(7)
    expect(rows[0].breakDates).toEqual(['2026-08-25'])
    expect(rows[0].cleanDays).toBe(6)
  })

  it('clamps the window to the habit start date when it is inside the period', () => {
    // Habit started 2026-08-01; a 90-day report period (start 2026-06-01)
    // must not claim clean days before the habit existed.
    const rows = buildHabitsSection([habit], [], '2026-08-28', '2026-06-01')
    expect(rows[0].startDate).toBe('2026-08-01')
    expect(rows[0].cleanDays).toBe(28)
  })
})
