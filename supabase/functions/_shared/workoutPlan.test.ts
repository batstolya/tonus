import { describe, it, expect } from 'vitest'
import {
  shiftTime, plannedDaysInRange, attendance,
  scheduleWeekdays, sportEmoji, workoutNotificationText, type DayTimes,
} from './workoutPlan.ts'

describe('shiftTime', () => {
  it('вычитает часы', () => expect(shiftTime('19:00', 4)).toBe('15:00'))
  it('клампит к 00:00 при уходе на вчера (спека §2 п.3)', () => expect(shiftTime('02:00', 4)).toBe('00:00'))
  it('ровно полночь', () => expect(shiftTime('04:00', 4)).toBe('00:00'))
  it('минуты сохраняются', () => expect(shiftTime('18:45', 4)).toBe('14:45'))
})

describe('scheduleWeekdays', () => {
  it('дни из ключей day_times, отсортированы', () => {
    const dt: DayTimes = { '5': { time: '20:30' }, '1': { time: '18:45' }, '3': { time: '19:00' } }
    expect(scheduleWeekdays(dt)).toEqual([1, 3, 5])
  })
  it('мусорные ключи отбрасываются', () => {
    expect(scheduleWeekdays({ '0': { time: '10:00' }, '8': { time: '10:00' }, '2': { time: '10:00' } } as DayTimes)).toEqual([2])
  })
})

describe('plannedDaysInRange', () => {
  // 2026-07-06 = Пн; weekdays 1/3/5 = Пн/Ср/Пт
  it('находит плановые дни в диапазоне', () => {
    expect(plannedDaysInRange([1, 3, 5], '2026-07-06', '2026-07-12')).toEqual(
      ['2026-07-06', '2026-07-08', '2026-07-10'])
  })
  it('через границу месяца', () => {
    expect(plannedDaysInRange([1], '2026-06-29', '2026-07-07')).toEqual(
      ['2026-06-29', '2026-07-06'])
  })
  it('воскресенье = 7', () => {
    expect(plannedDaysInRange([7], '2026-07-06', '2026-07-12')).toEqual(['2026-07-12'])
  })
  it('пустое расписание → пусто', () => {
    expect(plannedDaysInRange([], '2026-07-06', '2026-07-12')).toEqual([])
  })
})

describe('attendance', () => {
  it('считает done/total только по плановым', () => {
    expect(attendance(['2026-07-06', '2026-07-08'], new Set(['2026-07-06', '2026-07-07'])))
      .toEqual({ done: 1, total: 2 })
  })
})

describe('sportEmoji', () => {
  it('волейбол → 🏐, футбол → ⚽, прочее → 🏋️', () => {
    expect(sportEmoji('волейбол')).toBe('🏐')
    expect(sportEmoji('Волейбол')).toBe('🏐')
    expect(sportEmoji('футбол')).toBe('⚽')
    expect(sportEmoji('йога')).toBe('🏋️')
    expect(sportEmoji(null)).toBe('🏋️')
  })
})

describe('workoutNotificationText', () => {
  const entry = { time: '18:45', label: 'волейбол' }
  it('высокая готовность, с видом спорта и эмодзи', () => {
    const s = workoutNotificationText(entry, { readiness: 82, hrv: null, hrvBaseline: null })
    expect(s).toContain('🏐')
    expect(s).toContain('волейбол в 18:45')
    expect(s).toContain('можно выкладываться')
  })
  it('низкая готовность → полегче', () => {
    expect(workoutNotificationText(entry, { readiness: 54, hrv: null, hrvBaseline: null }))
      .toContain('полегче')
  })
  it('HRV сильно ниже нормы → полегче даже при среднем readiness', () => {
    expect(workoutNotificationText(entry, { readiness: 68, hrv: 60, hrvBaseline: 80 }))
      .toContain('полегче')
  })
  it('средний readiness без HRV-провала → нейтральный текст с оценкой', () => {
    const s = workoutNotificationText(entry, { readiness: 68, hrv: 80, hrvBaseline: 80 })
    expect(s).toContain('68/100')
    expect(s).not.toContain('полегче')
    expect(s).not.toContain('выкладываться')
  })
  it('без label → «тренировка»', () => {
    const s = workoutNotificationText({ time: '19:00' }, null)
    expect(s).toContain('тренировка в 19:00')
    expect(s).not.toContain('Готовность')
  })
})
