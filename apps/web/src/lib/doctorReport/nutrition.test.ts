import { describe, it, expect } from 'vitest'
import { buildNutrition, type NutritionEvent } from './nutrition'
import { periodFrame } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'
// 30 calendar days of records, so the frame is not clamped by short history.
const daily: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.parse(`${today}T00:00:00Z`) - (29 - i) * 86400000).toISOString().slice(0, 10),
  steps: 9000,
}))
const frame = periodFrame(daily, 30, today)

const ev = (over: Partial<NutritionEvent> & { ts: string; type: string }): NutritionEvent => ({
  amount: null, unit: null, note: null,
  calories: null, protein_g: null, carbs_g: null, fat_g: null,
  ...over,
})

const meal = (ts: string, over: Partial<NutritionEvent> = {}): NutritionEvent =>
  ev({ ts, type: 'meal', ...over })

describe('buildNutrition', () => {
  it('is absent when the period holds neither meals nor water', () => {
    expect(buildNutrition([], frame)).toBeNull()
  })

  it('counts days with a meal against calendar days, not against days with events', () => {
    const s = buildNutrition([
      meal('2026-07-29T09:00:00', { calories: 400 }),
      meal('2026-07-29T14:00:00', { calories: 600 }),
      meal('2026-07-30T09:00:00', { calories: 500 }),
    ], frame)!
    expect(s.days).toBe(2)
    expect(s.calendarDays).toBe(30)
    expect(s.meals).toBe(3)
  })

  it('takes macro medians over days with a mark, not over meals', () => {
    // Day one: 400 + 600 = 1000 kcal. Day two: 2000 kcal.
    // Median over days is 1500; a median over meals would be 600.
    const s = buildNutrition([
      meal('2026-07-29T09:00:00', { calories: 400, protein_g: 10 }),
      meal('2026-07-29T14:00:00', { calories: 600, protein_g: 30 }),
      meal('2026-07-30T09:00:00', { calories: 2000, protein_g: 100 }),
    ], frame)!
    expect(s.medianCalories).toBe(1500)
    expect(s.medianProtein).toBe(70)
  })

  it('counts macro days only where the macro itself was entered', () => {
    const s = buildNutrition([
      meal('2026-07-28T09:00:00'),
      meal('2026-07-29T09:00:00', { calories: 500 }),
      meal('2026-07-30T09:00:00', { calories: 700, fat_g: 20 }),
    ], frame)!
    expect(s.days).toBe(3)
    expect(s.macroDays).toBe(2)
    expect(s.medianCalories).toBe(600)
    // One day carries fat, so its median is that day's total, not a zero-filled average.
    expect(s.medianFat).toBe(20)
    expect(s.medianCarbs).toBeNull()
  })

  it('keeps a meal with no macros at all in the list', () => {
    const s = buildNutrition([meal('2026-07-30T13:00:00', { note: 'борщ' })], frame)!
    expect(s.meals).toBe(1)
    expect(s.medianCalories).toBeNull()
    expect(s.list).toHaveLength(1)
    expect(s.list[0].note).toBe('борщ')
  })

  it('lists every meal of the period in chronological order', () => {
    const s = buildNutrition([
      meal('2026-07-30T19:00:00', { note: 'ужин' }),
      meal('2026-07-29T09:00:00', { note: 'завтрак' }),
      meal('2026-07-30T13:00:00', { note: 'обед' }),
    ], frame)!
    expect(s.list.map(m => m.note)).toEqual(['завтрак', 'обед', 'ужин'])
    expect(s.list[0].date).toBe('2026-07-29')
    expect(s.list[0].time).toBe('09:00')
  })

  it('drops events outside the period on both ends', () => {
    const s = buildNutrition([
      meal('2026-06-01T09:00:00', { note: 'до периода' }),
      meal('2026-07-30T09:00:00', { note: 'внутри' }),
      meal('2026-08-05T09:00:00', { note: 'после' }),
    ], frame)!
    expect(s.list.map(m => m.note)).toEqual(['внутри'])
  })

  it('reports the typical meal time across the evening seam', () => {
    const s = buildNutrition([
      meal('2026-07-28T21:00:00'),
      meal('2026-07-29T22:00:00'),
      meal('2026-07-30T23:00:00'),
    ], frame)!
    expect(s.mealTime?.median).toBe('22:00')
    expect(s.mealTime?.count).toBe(3)
  })

  it('sums a drink per day and takes the median over days with a mark', () => {
    // Day one: 250 + 250 = 500 ml. Day two: 1500 ml.
    const s = buildNutrition([
      ev({ ts: '2026-07-29T09:00:00', type: 'water', amount: 250, unit: 'мл' }),
      ev({ ts: '2026-07-29T14:00:00', type: 'water', amount: 250, unit: 'мл' }),
      ev({ ts: '2026-07-30T09:00:00', type: 'water', amount: 1500, unit: 'мл' }),
    ], frame)!
    expect(s.drinks).toHaveLength(1)
    expect(s.drinks[0]).toMatchObject({
      type: 'water', days: 2, events: 3, medianPerDay: 1000, unit: 'мл', calendarDays: 30,
    })
    // A drink alone still produces a section, with no meals in it.
    expect(s.meals).toBe(0)
    expect(s.list).toEqual([])
  })

  it('carries coffee in the same section as food and water', () => {
    const s = buildNutrition([
      ev({ ts: '2026-07-29T09:00:00', type: 'coffee', amount: 200, unit: 'мл' }),
      ev({ ts: '2026-07-30T09:00:00', type: 'water', amount: 500, unit: 'мл' }),
    ], frame)!
    // Water leads: it is the baseline drink, coffee the exposure on top of it.
    expect(s.drinks.map(d => d.type)).toEqual(['water', 'coffee'])
    expect(s.drinks[1]).toMatchObject({ type: 'coffee', days: 1, events: 1, medianPerDay: 200 })
  })

  it('reports the typical time of a drink, like the intake section does', () => {
    const s = buildNutrition([
      ev({ ts: '2026-07-28T08:00:00', type: 'coffee', amount: 200, unit: 'мл' }),
      ev({ ts: '2026-07-29T09:00:00', type: 'coffee', amount: 200, unit: 'мл' }),
      ev({ ts: '2026-07-30T10:00:00', type: 'coffee', amount: 200, unit: 'мл' }),
    ], frame)!
    expect(s.drinks[0].time?.median).toBe('09:00')
  })

  it('leaves a drink out entirely rather than printing it as zero', () => {
    const s = buildNutrition([meal('2026-07-30T13:00:00', { calories: 500 })], frame)!
    expect(s.drinks).toEqual([])
  })

  it('ignores intake types the section does not own', () => {
    expect(buildNutrition([
      ev({ ts: '2026-07-30T21:00:00', type: 'alcohol', amount: 1, unit: 'доза' }),
      ev({ ts: '2026-07-30T09:00:00', type: 'meds', amount: 1, unit: null }),
    ], frame)).toBeNull()
  })
})
