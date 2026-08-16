import { describe, it, expect } from 'vitest'
import { buildReportModel } from './model'
import type { ReportSources } from './load'
import { addDays } from './dates'
import { periodFrame } from './metrics'
import { detectDeviations } from './deviations'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'
const daily: DailyMetrics[] = Array.from({ length: 60 }, (_, i) => ({
  date: addDays(today, -59 + i),
  restingHeartRate: 58, hrv: 45, sleepHours: 7, steps: 9000,
  sleepDeep: 1.4, sleepREM: 1.5, sleepCore: 4.1,
}))

const emptySources = {
  labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], notes: [], intake: [],
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

  it('refuses a trend when the period is a single day, instead of counting one score as both ends', () => {
    // 5 days of history feed computeDailyScores' own baseline gate, so the
    // last day of the 6 actually gets a score; a 1-day period then makes
    // firstEnd and lastStart the same date.
    const daily6: DailyMetrics[] = Array.from({ length: 6 }, (_, i) => ({
      date: addDays(today, -5 + i), restingHeartRate: 58, hrv: 45, sleepHours: 7, steps: 9000,
    }))
    const m = buildReportModel({ daily: daily6, sources: emptySources, periodDays: 1, today })
    expect(m.period.calendarDays).toBe(1)
    const sleep = m.scores.find(s => s.key === 'sleep_score')!
    expect(sleep.days).toBe(1)
    expect(sleep.trend).toBe(false)
    expect(sleep.first).toBeNull()
    expect(sleep.last).toBeNull()
  })

  it('gates both the baseline and the deviation weeks on the reliability band, not merely on the pre-period window depth', () => {
    // Regression for a mutation the reviewer proved survives the existing
    // suite: deleting the `supportsClaims(rel.band) ? … : null` guard at
    // metrics.ts, or widening deviations.ts's "reliable" set to every metric
    // key, left all tests green — because every existing fixture starves the
    // pre-period window and the in-period coverage together, so baselineOf's
    // own 14-day gate (and detectDeviations' own 5-week gate) produces the
    // same null/empty result regardless of the band gate. This fixture keeps
    // the pre-period window fully populated (28 of 28 days) and only starves
    // in-period coverage, isolating the band gate as the actual cause.
    const start = '2026-06-01' // Monday — aligns weekly buckets to 7-day blocks
    const today70 = addDays(start, 69) // 70-day period, 10 full weeks
    const preStart = addDays(start, -28)

    const preDays: DailyMetrics[] = Array.from({ length: 28 }, (_, i) => ({
      date: addDays(preStart, i), restingHeartRate: 50,
    }))

    // 5 populated weeks (Mon–Fri only, 5 of 7 days) with weekly means
    // 54/55/56/57/80, then 5 fully empty weeks. Coverage: 25 of 70 days
    // (~36%) — below the 40% "insufficient" line. The weekly means still
    // clear both of detectDeviations' own thresholds: 5 qualifying weeks
    // (MIN_WEEKS) and the 80-mean week sits far past 2 MAD from the median.
    const weekRhr = [54, 55, 56, 57, 80, null, null, null, null, null]
    const periodDays: DailyMetrics[] = Array.from({ length: 70 }, (_, i) => {
      const date = addDays(start, i)
      const week = Math.floor(i / 7)
      const dayOfWeek = i % 7
      const val = weekRhr[week]
      return val != null && dayOfWeek < 5 ? { date, restingHeartRate: val } : { date }
    })

    const allDaily = [...preDays, ...periodDays]
    const m = buildReportModel({ daily: allDaily, sources: emptySources, periodDays: 70, today: today70 })

    const rhr = m.metrics.find(x => x.key === 'rhr')!
    expect(rhr.daysWithData).toBe(25)
    expect(rhr.reliability.band).toBe('insufficient') // sanity: thin in-period coverage

    // (a) the band gate — not the 14-day baseline-window depth — is what
    // suppresses the baseline: the pre-period window itself has 28 of 28 days.
    expect(rhr.baseline).toBeNull()

    // (b) the same band gate keeps rhr out of every deviation week...
    expect(m.deviations.some(w => w.items.some(it => it.key === 'rhr'))).toBe(false)

    // ...even though its weekly pattern really would clear detectDeviations'
    // own thresholds absent the gate:
    const frame = periodFrame(allDaily, 70, today70)
    const unrestricted = detectDeviations(allDaily, frame, new Set(['rhr']))
    expect(unrestricted.some(w => w.items.some(it => it.key === 'rhr'))).toBe(true)
  })

  const twoConcerns: ReportSources = {
    ...emptySources,
    concerns: [
      { id: 'p', user_id: 'u', name: 'Приватная', category: 'other', status: 'active',
        started_at: null, notes: null, is_private: true, created_at: today },
      { id: 'o', user_id: 'u', name: 'Открытая', category: 'other', status: 'active',
        started_at: null, notes: null, is_private: false, created_at: today },
    ],
  }

  it('excludes private concerns while the PIN is locked, even when they are picked', () => {
    const m = buildReportModel({
      daily, sources: twoConcerns, periodDays: 30, today,
      pickedConcernIds: new Set(['p', 'o']),
    })
    expect(m.concerns.map(c => c.name)).toEqual(['Открытая'])
  })

  it('includes a private concern once it is unlocked and picked', () => {
    const m = buildReportModel({
      daily, sources: twoConcerns, periodDays: 30, today,
      pickedConcernIds: new Set(['p', 'o']), includePrivateConcerns: true,
    })
    expect(m.concerns.map(c => c.name)).toEqual(['Приватная', 'Открытая'])
  })

  // Unlocking reveals the tick box; it does not tick it. A private concern
  // reaches the doctor only by an explicit, per-report decision.
  it('leaves an unlocked private concern out while it is unpicked', () => {
    const m = buildReportModel({
      daily, sources: twoConcerns, periodDays: 30, today,
      pickedConcernIds: new Set(['o']), includePrivateConcerns: true,
    })
    expect(m.concerns.map(c => c.name)).toEqual(['Открытая'])
  })
})
