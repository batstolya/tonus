import { describe, it, expect } from 'vitest'
import { buildReportModel } from './model'
import { addDays } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'
const daily: DailyMetrics[] = Array.from({ length: 60 }, (_, i) => ({
  date: addDays(today, -59 + i),
  restingHeartRate: 58, hrv: 45, sleepHours: 7, steps: 9000,
  sleepDeep: 1.4, sleepREM: 1.5, sleepCore: 4.1,
}))

const emptySources = {
  labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], notes: [],
  profile: null,
}

describe('buildReportModel', () => {
  it('describes the period it covers', () => {
    const m = buildReportModel({ daily, sources: emptySources, periodDays: 30, today })
    expect(m.period.effectiveStart).toBe(addDays(today, -29))
    expect(m.period.end).toBe(today)
    expect(m.period.calendarDays).toBe(30)
    expect(m.period.emptyDays).toBe(0)
  })

  it('reports sleep, recovery and load but never readiness', () => {
    const m = buildReportModel({ daily, sources: emptySources, periodDays: 30, today })
    expect(m.scores.map(s => s.key)).toEqual(['sleep_score', 'recovery_score', 'stress_score'])
  })

  it('fills the sections that have data and leaves the rest empty', () => {
    const m = buildReportModel({ daily, sources: emptySources, periodDays: 30, today })
    expect(m.metrics.length).toBeGreaterThan(0)
    expect(m.sleep!.nights).toHaveLength(30)
    expect(m.labs.lines).toEqual([])
    expect(m.supplements).toEqual([])
    expect(m.deviations).toEqual([])
  })

  it('computes age from the birth year', () => {
    const m = buildReportModel({
      daily, sources: { ...emptySources, profile: { birth_year: 1988, sex: 'male' } },
      periodDays: 30, today,
    })
    expect(m.patient).toEqual({ birthYear: 1988, sex: 'male', age: 38 })
  })

  it('leaves the patient block empty when the profile is unset', () => {
    const m = buildReportModel({
      daily, sources: { ...emptySources, profile: null }, periodDays: 30, today,
    })
    expect(m.patient).toEqual({ birthYear: null, sex: null, age: null })
  })

  it('excludes private concerns even when they are passed in', () => {
    const m = buildReportModel({
      daily,
      sources: {
        ...emptySources,
        concerns: [
          { id: 'p', user_id: 'u', name: 'Приватная', category: 'other', status: 'active',
            started_at: null, notes: null, is_private: true, created_at: today },
          { id: 'o', user_id: 'u', name: 'Открытая', category: 'other', status: 'active',
            started_at: null, notes: null, is_private: false, created_at: today },
        ],
      },
      periodDays: 30,
      today,
      pickedConcernIds: new Set(['p', 'o']),
    })
    expect(m.concerns.map(c => c.name)).toEqual(['Открытая'])
  })
})
