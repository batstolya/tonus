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
    expect(s.implausible).toBe(1)
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
