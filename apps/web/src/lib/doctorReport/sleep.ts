import type { DailyMetrics } from '../../types'
import { localDate } from './dates'
import { periodSlice } from './metrics'

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

export interface SleepNight {
  date: string
  weekday: string
  /** Local HH:MM, or null when the source sent no timestamp. */
  bedtime: string | null
  wakeTime: string | null
  hours: number
  deep: number | null
  rem: number | null
  core: number | null
  deepPct: number | null
  remPct: number | null
}

export interface SleepSection {
  nights: SleepNight[]
  total: number
  under6: number
  over8: number
  /** Days in the period with no sleep record at all. */
  missing: number
  /** Nights whose wake time precedes bedtime plus sleep duration. */
  implausible: number
}

const hhmm = (iso?: string): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const windowHours = (d: DailyMetrics): number | null =>
  d.sleepBedtime && d.sleepWakeTime
    ? (Date.parse(d.sleepWakeTime) - Date.parse(d.sleepBedtime)) / 3600000
    : null

/**
 * Measured values only. Time in bed and sleep efficiency are deliberately
 * absent: no ingest path supplies them, and bedtime/wake_time mean different
 * things depending on whether the night arrived via the XML importer or the
 * HAE auto-sync, so any arithmetic over them lies differently per night.
 */
export function buildSleep(
  daily: DailyMetrics[],
  periodDays: number,
  today: string = localDate(),
): SleepSection | null {
  const slice = periodSlice(daily, periodDays, today)
  const withSleep = slice.filter(d => d.sleepHours != null)
  if (!withSleep.length) return null

  const share = (part: number | undefined, total: number): number | null =>
    part != null && total > 0 ? Math.round((part / total) * 100) : null

  const nights: SleepNight[] = withSleep.map(d => {
    const hours = d.sleepHours!
    return {
      date: d.date,
      weekday: WEEKDAYS[new Date(d.date + 'T00:00:00Z').getUTCDay()],
      bedtime: hhmm(d.sleepBedtime),
      wakeTime: hhmm(d.sleepWakeTime),
      hours: +hours.toFixed(1),
      deep: d.sleepDeep != null ? +d.sleepDeep.toFixed(1) : null,
      rem: d.sleepREM != null ? +d.sleepREM.toFixed(1) : null,
      core: d.sleepCore != null ? +d.sleepCore.toFixed(1) : null,
      deepPct: share(d.sleepDeep, hours),
      remPct: share(d.sleepREM, hours),
    }
  })

  return {
    nights,
    total: withSleep.length,
    under6: withSleep.filter(d => d.sleepHours! < 6).length,
    over8: withSleep.filter(d => d.sleepHours! >= 8).length,
    missing: slice.length - withSleep.length,
    implausible: withSleep.filter(d => {
      const w = windowHours(d)
      return w != null && d.sleepHours! > w
    }).length,
  }
}
