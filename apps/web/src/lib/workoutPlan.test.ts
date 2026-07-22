import { describe, it, expect } from 'vitest'
import { plannedDaysInRange, attendance, nextPlannedWorkout, scheduleWeekdays, sportEmoji, type DayTimes } from './workoutPlan'

const DT: DayTimes = {
  '1': { time: '18:45', label: 'волейбол' },
  '3': { time: '19:00', label: 'футбол' },
  '5': { time: '20:30', label: 'волейбол' },
}

describe('scheduleWeekdays / sportEmoji (зеркало _shared)', () => {
  it('дни из ключей, отсортированы', () => expect(scheduleWeekdays(DT)).toEqual([1, 3, 5]))
  it('эмодзи по виду спорта', () => {
    expect(sportEmoji('волейбол')).toBe('🏐')
    expect(sportEmoji('футбол')).toBe('⚽')
    expect(sportEmoji(undefined)).toBe('🏋️')
  })
})

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

describe('nextPlannedWorkout (per-day times)', () => {
  // 2026-07-11 — суббота
  const sat = new Date(2026, 6, 11, 10, 0)

  it('от субботы ближайшая — Пн 18:45 волейбол (через 2 дня)', () => {
    expect(nextPlannedWorkout(DT, sat)).toEqual(
      { date: '2026-07-13', time: '18:45', label: 'волейбол', inDays: 2 })
  })
  it('в среду до 19:00 — сегодня футбол', () => {
    const wed = new Date(2026, 6, 8, 12, 0)
    expect(nextPlannedWorkout(DT, wed)).toEqual(
      { date: '2026-07-08', time: '19:00', label: 'футбол', inDays: 0 })
  })
  it('в среду после 19:00 — пятница 20:30', () => {
    const wedLate = new Date(2026, 6, 8, 21, 0)
    expect(nextPlannedWorkout(DT, wedLate)).toEqual(
      { date: '2026-07-10', time: '20:30', label: 'волейбол', inDays: 2 })
  })
  it('пустое расписание → null', () => {
    expect(nextPlannedWorkout({}, sat)).toBeNull()
  })
})
