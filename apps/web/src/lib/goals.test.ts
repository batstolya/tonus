import { describe, it, expect } from 'vitest'
import { isExpired, finalStatus, type Goal } from './goals'
import type { DailyMetrics } from '../types'

const baseGoal: Goal = {
  id: 'g1', user_id: 'u1', metric: 'steps', title: 'Шаги',
  baseline_value: 7000, target_value: 8000, direction: 'up',
  start_date: '2026-06-01', end_date: '2026-06-14', status: 'active',
  recommendation_id: null, step_size: null, created_at: '2026-06-01T00:00:00Z',
}

const day = (date: string, steps: number) => ({ date, steps } as DailyMetrics)

describe('isExpired', () => {
  it('активная цель с прошедшим end_date — истёкшая', () => {
    expect(isExpired(baseGoal, '2026-06-20')).toBe(true)
  })
  it('end_date сегодня — ещё не истёкшая', () => {
    expect(isExpired(baseGoal, '2026-06-14')).toBe(false)
  })
  it('пауза/завершённые не истекают', () => {
    expect(isExpired({ ...baseGoal, status: 'paused' }, '2026-06-20')).toBe(false)
    expect(isExpired({ ...baseGoal, status: 'achieved' }, '2026-06-20')).toBe(false)
  })
})

describe('finalStatus', () => {
  it('средняя за период достигла цели → achieved', () => {
    const daily = Array.from({ length: 14 }, (_, i) =>
      day(`2026-06-${String(i + 1).padStart(2, '0')}`, 8500))
    expect(finalStatus(baseGoal, daily)).toBe('achieved')
  })
  it('средняя ниже цели → failed', () => {
    const daily = Array.from({ length: 14 }, (_, i) =>
      day(`2026-06-${String(i + 1).padStart(2, '0')}`, 6000))
    expect(finalStatus(baseGoal, daily)).toBe('failed')
  })
  it('нет данных за период → failed', () => {
    expect(finalStatus(baseGoal, [])).toBe('failed')
  })
  it('direction=down: средняя ниже цели → achieved', () => {
    const g: Goal = { ...baseGoal, metric: 'resting_heart_rate', target_value: 60, direction: 'down' }
    const daily = Array.from({ length: 14 }, (_, i) =>
      ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, restingHeartRate: 55 } as DailyMetrics))
    expect(finalStatus(g, daily)).toBe('achieved')
  })
})
