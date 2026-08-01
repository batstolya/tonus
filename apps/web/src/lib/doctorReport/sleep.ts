import type { DailyMetrics } from '../../types'
import { frameSlice, timeOfDayStats, type PeriodFrame, type TimeStat } from './metrics'

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

/** An episode this short, starting inside the daytime window, is not a night. */
export const DAYTIME_MAX_HOURS = 3
export const DAYTIME_FROM_HOUR = 8
export const DAYTIME_TO_HOUR = 20

export interface SleepNight {
  date: string
  weekday: string
  /** Local HH:MM, or null when the source sent no timestamp. */
  bedtime: string | null
  wakeTime: string | null
  /** 'DD.MM' when the timestamp lands on a different calendar day than `date`, null otherwise. */
  bedtimeDate: string | null
  wakeDate: string | null
  hours: number
  deep: number | null
  rem: number | null
  core: number | null
  /**
   * Sleep the source did not attribute to any phase — `total` minus the
   * classified phases, floored at 0. `null` when the source reported no
   * phase at all, so a dash prints instead of a claimed zero.
   */
  unclassified: number | null
  deepPct: number | null
  remPct: number | null
  /** A short episode starting during the daytime window — not counted as a night. */
  daytime: boolean
}

export interface SleepSection {
  nights: SleepNight[]
  total: number
  under6: number
  over8: number
  /** Days in the period with no night-sleep record at all (including daytime-only days). */
  missing: number
  /** Nights whose wake time precedes bedtime plus sleep duration. */
  implausible: number
  /** Short episodes that started during the day — shown, but excluded from every other count. */
  daytimeCount: number
  /** Circular median/quartiles of nightly bedtimes and wake times — daytime episodes excluded. */
  bedtime: TimeStat | null
  wake: TimeStat | null
  /**
   * Share of measured night sleep the source attributed to a phase, over only
   * the nights that reported at least one phase (daytime episodes never
   * count). `null` when no night in the period reports a phase at all.
   */
  phaseCoveragePct: number | null
}

/**
 * Without a timestamp nothing is classified: the report marks what it can see
 * and never guesses. The XML importer merges a nap folded into a real night
 * before the data reaches us, so only wholly daytime episodes are findable
 * here — splitting the rest belongs to the ingest.
 */
export function isDaytimeEpisode(d: DailyMetrics): boolean {
  if (d.sleepHours == null || d.sleepHours >= DAYTIME_MAX_HOURS) return false
  if (!d.sleepBedtime) return false
  const start = new Date(d.sleepBedtime)
  if (isNaN(start.getTime())) return false
  const hour = start.getHours()
  return hour >= DAYTIME_FROM_HOUR && hour < DAYTIME_TO_HOUR
}

/**
 * Sleep fields blanked on daytime episodes, so no aggregate counts them. The
 * row itself — its date and every non-sleep field — is kept: a day whose only
 * record was a nap still exists as a day with a record.
 */
export function withoutDaytimeSleep(daily: DailyMetrics[]): DailyMetrics[] {
  return daily.map(d => {
    if (!isDaytimeEpisode(d)) return d
    const copy = { ...d }
    delete copy.sleepHours
    delete copy.sleepDeep
    delete copy.sleepREM
    delete copy.sleepCore
    delete copy.sleepBedtime
    delete copy.sleepWakeTime
    return copy
  })
}

const pad = (n: number): string => String(n).padStart(2, '0')

const hhmm = (iso?: string): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const localDay = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 'DD.MM' when the timestamp lands on another calendar day, null otherwise. */
const dateQualifier = (iso: string | undefined, rowDate: string): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime()) || localDay(d) === rowDate) return null
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
}

const windowHours = (d: DailyMetrics): number | null =>
  d.sleepBedtime && d.sleepWakeTime
    ? (Date.parse(d.sleepWakeTime) - Date.parse(d.sleepBedtime)) / 3600000
    : null

/**
 * Sleep the source did not attribute to any phase. The XML importer derives
 * the total from the same intervals as the phases, so its arithmetic closes;
 * `_shared/hae.ts` copies four independent numbers from Health Auto Export and
 * reconciles nothing, so an auto-synced night can leave hours unexplained.
 * Printing the remainder is the only way the four columns add up on the page.
 */
const unclassifiedHours = (d: DailyMetrics, total: number): number | null => {
  const parts = [d.sleepDeep, d.sleepREM, d.sleepCore].filter((v): v is number => v != null)
  if (!parts.length) return null
  const classified = parts.reduce((a, b) => a + b, 0)
  return +Math.max(0, total - classified).toFixed(1)
}

/**
 * Over the nights that reported at least one phase (daytime episodes never
 * count): summed classified hours divided by those nights' summed total
 * sleep, rounded. `null` when no night in the period reports a phase.
 */
const phaseCoverage = (nights: DailyMetrics[]): number | null => {
  const withPhase = nights.filter(d => d.sleepDeep != null || d.sleepREM != null || d.sleepCore != null)
  if (!withPhase.length) return null
  const classified = withPhase.reduce((sum, d) =>
    sum + [d.sleepDeep, d.sleepREM, d.sleepCore].filter((v): v is number => v != null).reduce((a, b) => a + b, 0), 0)
  const total = withPhase.reduce((sum, d) => sum + d.sleepHours!, 0)
  return Math.round((classified / total) * 100)
}

/**
 * Measured values only. Time in bed and sleep efficiency are deliberately
 * absent: no ingest path supplies them, and bedtime/wake_time mean different
 * things depending on whether the night arrived via the XML importer or the
 * HAE auto-sync, so any arithmetic over them lies differently per night.
 */
export function buildSleep(
  daily: DailyMetrics[],
  frame: PeriodFrame,
): SleepSection | null {
  const slice = frameSlice(daily, frame)
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
      bedtimeDate: dateQualifier(d.sleepBedtime, d.date),
      wakeDate: dateQualifier(d.sleepWakeTime, d.date),
      hours: +hours.toFixed(1),
      deep: d.sleepDeep != null ? +d.sleepDeep.toFixed(1) : null,
      rem: d.sleepREM != null ? +d.sleepREM.toFixed(1) : null,
      core: d.sleepCore != null ? +d.sleepCore.toFixed(1) : null,
      unclassified: unclassifiedHours(d, hours),
      deepPct: share(d.sleepDeep, hours),
      remPct: share(d.sleepREM, hours),
      daytime: isDaytimeEpisode(d),
    }
  })

  const nightly = withSleep.filter(d => !isDaytimeEpisode(d))

  return {
    nights,
    total: nightly.length,
    under6: nightly.filter(d => d.sleepHours! < 6).length,
    over8: nightly.filter(d => d.sleepHours! >= 8).length,
    missing: frame.calendarDays - nightly.length,
    daytimeCount: withSleep.length - nightly.length,
    implausible: nightly.filter(d => {
      const w = windowHours(d)
      return w != null && d.sleepHours! > w
    }).length,
    bedtime: timeOfDayStats(nightly.map(d => d.sleepBedtime).filter((v): v is string => !!v)),
    wake: timeOfDayStats(nightly.map(d => d.sleepWakeTime).filter((v): v is string => !!v)),
    phaseCoveragePct: phaseCoverage(nightly),
  }
}
