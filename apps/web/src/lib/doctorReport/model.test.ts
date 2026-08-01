import { describe, it, expect } from 'vitest'
import { buildReportModel } from './model'
import { addDays } from './dates'
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

  it('reports sleep and recovery only — load was recovery inverted', () => {
    const m = buildReportModel({ daily, sources: emptySources, periodDays: 30, today })
    expect(m.scores.map(s => s.key)).toEqual(['sleep_score', 'recovery_score'])
    expect(m.scores.every(s => s.days > 0)).toBe(true)
  })

  it('refuses a score trend when a third of the period is mostly empty', () => {
    const gappy = daily.map((d, i) => (i > 40 ? { date: d.date } : d))
    const m = buildReportModel({ daily: gappy, sources: emptySources, periodDays: 30, today })
    expect(m.scores.every(s => s.trend === false)).toBe(true)
  })

  it('fills the sections that have data and leaves the rest empty', () => {
    const m = buildReportModel({ daily, sources: emptySources, periodDays: 30, today })
    expect(m.metrics.length).toBeGreaterThan(0)
    expect(m.sleep!.nights).toHaveLength(30)
    expect(m.labs.lines).toEqual([])
    expect(m.supplements).toEqual([])
    expect(m.deviations).toEqual([])
  })

  it('keeps a nap-only day in the record count, but excludes it from metrics and scores', () => {
    // A day whose only entry is a daytime doze still had a record — blanking
    // its sleep fields must not make periodFrame think the day is empty.
    const nap: DailyMetrics = { date: addDays(today, -1), sleepHours: 1.9, sleepBedtime: `${addDays(today, -1)}T09:08:00`, steps: 4000 }
    const night: DailyMetrics = { date: today, sleepHours: 7.2, sleepBedtime: `${today}T01:10:00`, steps: 5000 }
    const m = buildReportModel({ daily: [nap, night], sources: emptySources, periodDays: 2, today })

    expect(m.period.daysWithAnyRecord).toBe(2)
    expect(m.period.emptyDays).toBe(0)
    // Steps is unaffected by the sleep-only blanking — both days still count.
    const steps = m.metrics.find(x => x.key === 'steps')!
    expect(steps.daysWithData).toBe(2)
    // But the sleep metric itself only sees the real night.
    const sleep = m.metrics.find(x => x.key === 'sleep')!
    expect(sleep.daysWithData).toBe(1)
    expect(m.sleep!.total).toBe(1)
    expect(m.sleep!.daytimeCount).toBe(1)
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

  it('prints no baseline comparison for a metric below the coverage band', () => {
    const sparse = daily.map((d, i) => (i % 4 === 0 ? d : { ...d, hrv: undefined }))
    const m = buildReportModel({ daily: sparse, sources: emptySources, periodDays: 30, today })
    const hrv = m.metrics.find(x => x.key === 'hrv')!
    expect(hrv.daysWithData).toBeGreaterThan(0)
    expect(hrv.baseline).toBeNull()
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
