import { describe, it, expect } from 'vitest'
import { shiftTime, plannedDaysInRange, attendance, workoutNotificationText } from './workoutPlan.ts'

describe('shiftTime', () => {
  it('вычитает часы', () => expect(shiftTime('19:00', 4)).toBe('15:00'))
  it('клампит к 00:00 при уходе на вчера (спека §2 п.3)', () => expect(shiftTime('02:00', 4)).toBe('00:00'))
  it('ровно полночь', () => expect(shiftTime('04:00', 4)).toBe('00:00'))
  it('минуты сохраняются', () => expect(shiftTime('18:30', 2)).toBe('16:30'))
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
  it('пустой план', () => {
    expect(attendance([], new Set(['2026-07-06']))).toEqual({ done: 0, total: 0 })
  })
})

describe('workoutNotificationText', () => {
  const t = '19:00'
  it('высокая готовность', () => {
    expect(workoutNotificationText(t, { readiness: 82, hrv: null, hrvBaseline: null }))
      .toContain('можно выкладываться')
  })
  it('низкая готовность → полегче', () => {
    expect(workoutNotificationText(t, { readiness: 54, hrv: null, hrvBaseline: null }))
      .toContain('полегче')
  })
  it('HRV сильно ниже нормы → полегче даже при среднем readiness', () => {
    expect(workoutNotificationText(t, { readiness: 68, hrv: 60, hrvBaseline: 80 }))
      .toContain('полегче')
  })
  it('средний readiness без HRV-провала → нейтральный текст с оценкой', () => {
    const s = workoutNotificationText(t, { readiness: 68, hrv: 80, hrvBaseline: 80 })
    expect(s).toContain('68/100')
    expect(s).not.toContain('полегче')
    expect(s).not.toContain('выкладываться')
  })
  it('нет данных → простое напоминание со временем', () => {
    const s = workoutNotificationText(t, null)
    expect(s).toContain('19:00')
    expect(s).not.toContain('Готовность')
  })
})
