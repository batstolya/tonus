import { describe, it, expect } from 'vitest'
import { habitDays, habitStats, addDays, type Habit, type HabitBreak } from './habits'

const habit = (start: string): Habit => ({
  id: 'h1', user_id: 'u1', name: 'Без сладкого', note: null,
  start_date: start, active: true, sort_order: 0, created_at: `${start}T00:00:00Z`,
})

const brk = (date: string): HabitBreak => ({ id: `b-${date}`, habit_id: 'h1', date, note: null })

describe('addDays', () => {
  it('steps across a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
  })
})

describe('habitDays', () => {
  it('marks today pending and closed days clean', () => {
    const days = habitDays(habit('2026-08-25'), [], '2026-08-28')
    expect(days.map(d => d.date)).toEqual(['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'])
    expect(days.map(d => d.status)).toEqual(['clean', 'clean', 'clean', 'pending'])
  })

  it('never emits days before start_date', () => {
    const days = habitDays(habit('2026-08-27'), [], '2026-08-28', 90)
    expect(days).toHaveLength(2)
    expect(days[0].date).toBe('2026-08-27')
  })

  it('marks a recorded day broken, today included', () => {
    const days = habitDays(habit('2026-08-26'), [brk('2026-08-27'), brk('2026-08-28')], '2026-08-28')
    expect(days.map(d => d.status)).toEqual(['clean', 'broken', 'broken'])
  })

  it('ignores break rows outside the window', () => {
    const days = habitDays(habit('2026-08-20'), [brk('2026-08-01')], '2026-08-22')
    expect(days.every(d => d.status !== 'broken')).toBe(true)
  })

  it('caps the window at windowDays counting back from today', () => {
    const days = habitDays(habit('2026-01-01'), [], '2026-08-28', 7)
    expect(days).toHaveLength(7)
    expect(days[0].date).toBe('2026-08-22')
  })
})

describe('habitStats', () => {
  it('counts the streak of closed clean days, excluding pending today', () => {
    const s = habitStats(habitDays(habit('2026-08-25'), [], '2026-08-28'))
    expect(s.currentStreak).toBe(3)
  })

  it('restarts the streak after a break', () => {
    const s = habitStats(habitDays(habit('2026-08-20'), [brk('2026-08-26')], '2026-08-28'))
    expect(s.currentStreak).toBe(1)
    expect(s.bestStreak).toBe(6)
  })

  it('reports a zero streak when yesterday was a break', () => {
    const s = habitStats(habitDays(habit('2026-08-20'), [brk('2026-08-27')], '2026-08-28'))
    expect(s.currentStreak).toBe(0)
  })

  it('breaking on the very first day leaves no streak', () => {
    const s = habitStats(habitDays(habit('2026-08-27'), [brk('2026-08-27')], '2026-08-28'))
    expect(s.currentStreak).toBe(0)
    expect(s.bestStreak).toBe(0)
  })

  it('counts breaks and clean days over the window', () => {
    const s = habitStats(habitDays(habit('2026-08-20'), [brk('2026-08-22'), brk('2026-08-26')], '2026-08-28'))
    expect(s.breaks30).toBe(2)
    expect(s.cleanDays).toBe(6)
    expect(s.windowDays).toBe(9)
  })
})
