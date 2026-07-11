import { describe, it, expect } from 'vitest'
import { plannedDaysInRange, attendance, nextPlannedWorkout } from './workoutPlan'

describe('plannedDaysInRange (зеркало _shared)', () => {
  it('Пн/Ср/Пт в неделе 2026-07-06..12', () => {
    expect(plannedDaysInRange([1, 3, 5], '2026-07-06', '2026-07-12')).toEqual(
      ['2026-07-06', '2026-07-08', '2026-07-10'])
  })
  it('пустое расписание → пусто', () => {
    expect(plannedDaysInRange([], '2026-07-06', '2026-07-12')).toEqual([])
  })
})

describe('attendance (зеркало _shared)', () => {
  it('done/total', () => {
    expect(attendance(['2026-07-06', '2026-07-08'], new Set(['2026-07-08'])))
      .toEqual({ done: 1, total: 2 })
  })
})

describe('nextPlannedWorkout', () => {
  // 2026-07-11 — суббота (локальное время конструктора Date)
  const sat = new Date(2026, 6, 11, 10, 0) // Сб 10:00

  it('сегодня плановый день и время не прошло → сегодня', () => {
    const r = nextPlannedWorkout([6], '19:00', sat)
    expect(r).toEqual({ date: '2026-07-11', time: '19:00', inDays: 0 })
  })
  it('сегодня плановый, но время прошло → следующая неделя', () => {
    const late = new Date(2026, 6, 11, 20, 0) // Сб 20:00
    const r = nextPlannedWorkout([6], '19:00', late)
    expect(r).toEqual({ date: '2026-07-18', time: '19:00', inDays: 7 })
  })
  it('ближайший из Пн/Ср/Пт от субботы → понедельник (через 2 дня)', () => {
    const r = nextPlannedWorkout([1, 3, 5], '19:00', sat)
    expect(r).toEqual({ date: '2026-07-13', time: '19:00', inDays: 2 })
  })
  it('пустое расписание → null', () => {
    expect(nextPlannedWorkout([], '19:00', sat)).toBeNull()
  })
})
