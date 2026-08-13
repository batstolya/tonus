import { describe, it, expect } from 'vitest'
import { buildSleep, isDaytimeEpisode, withoutDaytimeSleep } from './sleep'
import { periodFrame } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'

describe('buildSleep', () => {
  it('returns one row per night with phase shares', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-07-30', sleepHours: 8, sleepDeep: 2, sleepREM: 1.6, sleepCore: 4.4 },
      { date: '2026-07-31', sleepHours: 5.5 },
    ]
    const s = buildSleep(daily, periodFrame(daily, 30, today))!
    expect(s.nights).toHaveLength(2)
    expect(s.nights[0].deepPct).toBe(25)
    expect(s.nights[0].remPct).toBe(20)
    expect(s.nights[1].deepPct).toBeNull()
    expect(s.nights[0].weekday).toBe('Чт')
  })

  it('counts short, long, missing and implausible nights', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-07-28', sleepHours: 5 },
      { date: '2026-07-29', sleepHours: 8.2 },
      { date: '2026-07-30' },
      // wake time earlier than bedtime + duration: the source is wrong
      { date: '2026-07-31', sleepHours: 9, sleepBedtime: '2026-07-30T23:00:00Z', sleepWakeTime: '2026-07-31T06:00:00Z' },
    ]
    // effectiveStart clamps to 2026-07-28 (the first record), so calendarDays is 4.
    const s = buildSleep(daily, periodFrame(daily, 30, today))!
    expect(s.total).toBe(3)
    expect(s.under6).toBe(1)
    expect(s.over8).toBe(2)
    expect(s.missing).toBe(1)
    expect(s.suspiciousNights).toBe(1)
  })

  it('flags a bed window too long to be one night', () => {
    // The production case: 2026-06-13 stored bedtime 00:14 and wake 23:55 of
    // the same day — a 23h41m window holding 7.3h of sleep. 80 of 525 stored
    // sessions look like this, and none of them was flagged before.
    const daily: DailyMetrics[] = [{
      date: '2026-06-13', sleepHours: 7.3,
      sleepBedtime: '2026-06-13T00:14:24Z', sleepWakeTime: '2026-06-13T23:55:33Z',
    }]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-06-13'))!
    expect(s.nights[0].windowHours).toBeCloseTo(23.69, 1)
    expect(s.nights[0].suspicious).toBe(true)
    expect(s.suspiciousNights).toBe(1)
  })

  it('holds the bed-window threshold at 16 hours, not one hour either side', () => {
    const night = (date: string, windowH: number): DailyMetrics => ({
      date, sleepHours: 7,
      sleepBedtime: `${date}T00:00:00Z`,
      sleepWakeTime: new Date(Date.parse(`${date}T00:00:00Z`) + windowH * 3600000).toISOString(),
    })
    const daily = [night('2026-07-27', 15), night('2026-07-28', 16), night('2026-07-29', 17)]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-29'))!
    expect(s.nights.map(n => n.suspicious)).toEqual([false, false, true])
  })

  it('flags a non-positive window and keeps its sleep total', () => {
    const daily: DailyMetrics[] = [{
      date: '2026-07-27', sleepHours: 7,
      sleepBedtime: '2026-07-27T08:00:00Z', sleepWakeTime: '2026-07-27T08:00:00Z',
    }]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-27'))!
    expect(s.nights[0].suspicious).toBe(true)
    expect(s.nights[0].hours).toBe(7)
  })

  it('keeps a suspicious night out of the bedtime and wake medians', () => {
    // Two sane nights at 23:00 and one broken session starting at 09:00 with a
    // 22-hour window. Including it would drag the median hours away.
    const daily: DailyMetrics[] = [
      { date: '2026-07-27', sleepHours: 7, sleepBedtime: '2026-07-26T23:00:00Z', sleepWakeTime: '2026-07-27T06:00:00Z' },
      { date: '2026-07-28', sleepHours: 7, sleepBedtime: '2026-07-27T23:00:00Z', sleepWakeTime: '2026-07-28T06:00:00Z' },
      { date: '2026-07-29', sleepHours: 7, sleepBedtime: '2026-07-29T09:00:00Z', sleepWakeTime: '2026-07-30T07:00:00Z' },
    ]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-29'))!
    expect(s.suspiciousNights).toBe(1)
    expect(s.bedtime!.count).toBe(2)
    expect(s.wake!.count).toBe(2)
  })

  it('is null when no night has sleep data', () => {
    expect(buildSleep([{ date: today }], periodFrame([{ date: today }], 30, today))).toBeNull()
  })

  it('qualifies a bedtime that falls on the previous calendar day', () => {
    const daily: DailyMetrics[] = [{
      date: '2026-06-13', sleepHours: 7.3,
      sleepBedtime: '2026-06-12T02:14:00', sleepWakeTime: '2026-06-13T01:55:00',
    }]
    const s = buildSleep(daily, periodFrame(daily, 90, '2026-07-31'))!
    expect(s.nights[0].bedtime).toBe('02:14')
    expect(s.nights[0].bedtimeDate).toBe('12.06')
    expect(s.nights[0].wakeDate).toBeNull() // same day as the row
  })

  it('shows the sleep time no phase accounts for', () => {
    const daily: DailyMetrics[] = [{
      date: '2026-07-25', sleepHours: 9.1, sleepDeep: 1.8, sleepREM: 2.1, sleepCore: 2.4,
      sleepBedtime: '2026-07-25T01:00:00',
    }]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-31'))!
    expect(s.nights[0].unclassified).toBe(2.8)
    expect(s.phaseCoveragePct).toBe(69) // 6.3 of 9.1
  })

  it('leaves unclassified null when the source reported no phases at all', () => {
    const daily: DailyMetrics[] = [{ date: '2026-07-25', sleepHours: 7 }]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-31'))!
    expect(s.nights[0].unclassified).toBeNull()
    expect(s.phaseCoveragePct).toBeNull()
  })

  it('signs unclassified negative when phases overshoot the total, instead of flooring at 0', () => {
    const daily: DailyMetrics[] = [{
      date: '2026-07-25', sleepHours: 6, sleepDeep: 3, sleepREM: 3, sleepCore: 1,
    }]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-31'))!
    // 3 + 3 + 1 = 7 of 6 h: the source recorded phases and total independently
    // and never reconciled them — flooring at 0 would print a false "phases
    // fully accounted for" instead of the real -1 h discrepancy.
    expect(s.nights[0].unclassified).toBe(-1)
    expect(s.phasesOverTotal).toBe(1)
  })

  it('counts phasesOverTotal only for nights whose phases actually overshoot', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-07-24', sleepHours: 8, sleepDeep: 2, sleepREM: 1.6, sleepCore: 4.4 }, // exact
      { date: '2026-07-25', sleepHours: 6, sleepDeep: 3, sleepREM: 3, sleepCore: 1 },     // overshoot
      { date: '2026-07-26', sleepHours: 7 },                                              // no phases
    ]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-31'))!
    expect(s.phasesOverTotal).toBe(1)
  })

  it('excludes a daytime episode from phasesOverTotal even when its phases overshoot', () => {
    const daily: DailyMetrics[] = [
      { date: '2026-07-16', sleepHours: 7, sleepDeep: 2, sleepREM: 1.6, sleepCore: 3.4, sleepBedtime: '2026-07-16T01:10:00' },
      // A daytime nap whose phases overshoot its own tiny total — still not a night.
      { date: '2026-07-15', sleepHours: 1, sleepDeep: 0.8, sleepREM: 0.8, sleepCore: 0.2, sleepBedtime: '2026-07-15T09:08:00' },
    ]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-31'))!
    expect(s.nights.find(n => n.daytime)).toBeDefined()
    expect(s.phasesOverTotal).toBe(0)
  })

  it('returns null phase coverage instead of NaN when the phase-carrying nights sum to zero sleep', () => {
    const daily: DailyMetrics[] = [{ date: '2026-07-25', sleepHours: 0, sleepDeep: 0, sleepREM: 0, sleepCore: 0 }]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-31'))!
    expect(s.phaseCoveragePct).toBeNull()
  })

  it('derives time in bed and efficiency from awake hours', () => {
    const daily: DailyMetrics[] = [{ date: '2026-08-13', sleepHours: 8.35, sleepAwake: 0.15 }]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-08-13'))!
    expect(s.nights[0].awake).toBeCloseTo(0.15)
    expect(s.nights[0].timeInBed).toBeCloseTo(8.5)
    expect(s.nights[0].efficiencyPct).toBe(98)
  })

  it('leaves all three null when the night predates awake tracking', () => {
    const daily: DailyMetrics[] = [{ date: '2026-08-13', sleepHours: 8.35 }]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-08-13'))!
    expect(s.nights[0].awake).toBeNull()
    expect(s.nights[0].timeInBed).toBeNull()
    expect(s.nights[0].efficiencyPct).toBeNull()
  })

  it('excludes a daytime episode from phaseCoveragePct even when it carries phase data', () => {
    const daily: DailyMetrics[] = [
      // A real night whose phases close exactly: 2 + 1.6 + 4.4 = 8 of 8 h -> 100% alone.
      { date: '2026-07-16', sleepHours: 8, sleepDeep: 2, sleepREM: 1.6, sleepCore: 4.4, sleepBedtime: '2026-07-16T01:10:00' },
      // A daytime nap that also reports phases. If phaseCoverage() were ever
      // fed `withSleep` instead of `nightly`, this would pull the section
      // percentage down to 91% (9 classified of 9.9 total) — a regression
      // this test exists to catch.
      { date: '2026-07-15', sleepHours: 1.9, sleepDeep: 0.5, sleepREM: 0.3, sleepCore: 0.2, sleepBedtime: '2026-07-15T09:08:00' },
    ]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-31'))!
    expect(s.nights.find(n => n.daytime)).toBeDefined() // the nap is still in the table
    expect(s.phaseCoveragePct).toBe(100) // only the real night counts
  })
})

describe('daytime episodes', () => {
  const nap: DailyMetrics = { date: '2026-07-15', sleepHours: 1.9, sleepBedtime: '2026-07-15T09:08:00' }
  const night: DailyMetrics = { date: '2026-07-16', sleepHours: 7.2, sleepBedtime: '2026-07-16T01:10:00' }
  const earlyShort: DailyMetrics = { date: '2026-07-17', sleepHours: 2.5, sleepBedtime: '2026-07-17T03:00:00' }
  const longAfternoon: DailyMetrics = { date: '2026-07-18', sleepHours: 3.5, sleepBedtime: '2026-07-18T14:00:00' }

  it('marks a short episode that starts during the day', () => {
    expect(isDaytimeEpisode(nap)).toBe(true)
    expect(isDaytimeEpisode(night)).toBe(false)
    expect(isDaytimeEpisode(earlyShort)).toBe(false)   // short, but at night
    expect(isDaytimeEpisode(longAfternoon)).toBe(false) // daytime, but not short
  })

  it('classifies nothing without a timestamp', () => {
    expect(isDaytimeEpisode({ date: '2026-07-15', sleepHours: 1.9 })).toBe(false)
  })

  it('draws the boundary at exactly 3 hours and exactly 08:00/20:00', () => {
    // Rule as implemented: shorter than 3 h (>= 3 h is excluded), starting in
    // the half-open window [08:00, 20:00) (20:00 itself is excluded).
    const exactlyThreeHoursAtMidday: DailyMetrics =
      { date: '2026-07-19', sleepHours: 3.0, sleepBedtime: '2026-07-19T12:00:00' }
    const notQuiteThreeHoursAt0800: DailyMetrics =
      { date: '2026-07-20', sleepHours: 2.9, sleepBedtime: '2026-07-20T08:00:00' }
    const notQuiteThreeHoursAt2000: DailyMetrics =
      { date: '2026-07-21', sleepHours: 2.9, sleepBedtime: '2026-07-21T20:00:00' }
    const notQuiteThreeHoursAt1959: DailyMetrics =
      { date: '2026-07-22', sleepHours: 2.9, sleepBedtime: '2026-07-22T19:59:00' }

    // 3.0 h is not "shorter than 3 h" -> not a daytime episode, even at midday.
    expect(isDaytimeEpisode(exactlyThreeHoursAtMidday)).toBe(false)
    // 08:00 is inside the window (>= 8) -> daytime episode.
    expect(isDaytimeEpisode(notQuiteThreeHoursAt0800)).toBe(true)
    // 20:00 is outside the window (< 20 fails) -> not a daytime episode.
    expect(isDaytimeEpisode(notQuiteThreeHoursAt2000)).toBe(false)
    // 19:59 is still inside the window (< 20) -> daytime episode.
    expect(isDaytimeEpisode(notQuiteThreeHoursAt1959)).toBe(true)
  })

  it('keeps the row but drops it from every night count', () => {
    const daily = [nap, night]
    const s = buildSleep(daily, periodFrame(daily, 30, '2026-07-31'))!
    expect(s.nights).toHaveLength(2)
    expect(s.nights[0].daytime).toBe(true)
    expect(s.daytimeCount).toBe(1)
    expect(s.under6).toBe(0)
    expect(s.total).toBe(1)
  })

  it('blanks the sleep fields so every aggregate ignores them', () => {
    const [clean] = withoutDaytimeSleep([nap])
    expect(clean.sleepHours).toBeUndefined()
    expect(clean.sleepBedtime).toBeUndefined()
    expect(clean.date).toBe('2026-07-15')
  })
})

// timeOfDayStats moved to math.ts when intake became a second caller with a
// different seam; its tests live in math.test.ts.
