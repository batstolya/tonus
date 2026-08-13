import type { DailyMetrics } from '../../types'
import { timeOfDayStats, type TimeStat } from './math'
import { frameSlice, type PeriodFrame } from './metrics'
import { timeInBedHours, sleepEfficiencyPct } from '../sleepQuality'

export type { TimeStat }

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
   * classified phases, signed. Negative when the source's phases overshoot
   * its own total (two independently recorded numbers, not reconciled — see
   * `phasesOverTotal`); never floored at 0, or an overshoot night would print
   * a false "phases fully accounted for". `null` when the source reported no
   * phase at all, so a dash prints instead of a claimed zero.
   */
  /**
   * Hours awake during the night, as measured by the source. `null` on every
   * night that arrived before `awake_hours` existed and on every XML-imported
   * night — the importer discards awake intervals. Never 0 in those cases:
   * an unmeasured night is not a night without awakenings.
   */
  awake: number | null
  /** Asleep plus awake. `null` whenever `awake` is. */
  timeInBed: number | null
  /** Asleep over time in bed, whole percent. `null` whenever `awake` is. */
  efficiencyPct: number | null
  unclassified: number | null
  deepPct: number | null
  remPct: number | null
  /** A short episode starting during the daytime window — not counted as a night. */
  daytime: boolean
  /** Wake minus bedtime. `null` when either timestamp is missing. */
  windowHours: number | null
  /**
   * The bed window cannot hold the night it reports: non-positive, longer than
   * `MAX_BED_WINDOW_HOURS`, or shorter than the sleep total itself. The sleep
   * duration stays trustworthy; the two timestamps do not.
   */
  suspicious: boolean
}

export interface SleepSection {
  nights: SleepNight[]
  total: number
  under6: number
  over8: number
  /** Days in the period with no night-sleep record at all (including daytime-only days). */
  missing: number
  /** Nights whose bed window cannot hold the sleep they report, in either direction. */
  suspiciousNights: number
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
  /**
   * Nights (daytime episodes excluded) whose reported phases sum to more
   * than the night's own total — the phases and the total come from
   * independently recorded numbers the source never reconciles (see
   * `unclassifiedHours`). Printed as its own caveat when non-zero, so a
   * negative "unclassified" figure never reads as a silent oddity.
   */
  phasesOverTotal: number
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
    delete copy.sleepAwake
    return copy
  })
}

/** Bedtimes and wake times cluster around midnight; 18:00 is their empty hour. */
export const SLEEP_ORIGIN_MIN = 18 * 60

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
 * Past this, a single sleep opportunity stops being plausible for an adult.
 * A threshold, not a truth: the production data clusters either under 14 hours
 * or over 20, so 16 separates merged or mis-paired sessions from long nights
 * without touching either cluster.
 */
export const MAX_BED_WINDOW_HOURS = 16

/**
 * The window is wrong in one of three ways: it runs backwards or to zero, it
 * is too long to be one night, or it is shorter than the sleep it supposedly
 * contains. 80 of 525 stored sessions fail this — almost all of them by being
 * far too long, which the previous check (sleep longer than window) missed
 * entirely.
 */
const isSuspicious = (d: DailyMetrics): boolean => {
  const w = windowHours(d)
  if (w == null) return false
  return w <= 0 || w > MAX_BED_WINDOW_HOURS || (d.sleepHours != null && d.sleepHours > w)
}

/**
 * Sleep the source did not attribute to any phase. The XML importer derives
 * the total from the same intervals as the phases, so its arithmetic closes;
 * `_shared/hae.ts` copies four independent numbers from Health Auto Export and
 * reconciles nothing, so an auto-synced night can leave hours unexplained —
 * or, just as independently, have its phases overshoot the total. Printing
 * the signed remainder (never floored) is the only way the four columns add
 * up on the page, negative included.
 */
const unclassifiedHours = (d: DailyMetrics, total: number): number | null => {
  const parts = [d.sleepDeep, d.sleepREM, d.sleepCore].filter((v): v is number => v != null)
  if (!parts.length) return null
  const classified = parts.reduce((a, b) => a + b, 0)
  return +(total - classified).toFixed(1)
}

/**
 * Over the nights that reported at least one phase (daytime episodes never
 * count): summed classified hours divided by those nights' summed total
 * sleep, rounded. `null` when no night in the period reports a phase, or
 * when the phase-carrying nights' total sleep sums to zero — the division
 * would otherwise print `NaN%`, which both renderers' `!= null` guards let
 * straight through.
 */
const phaseCoverage = (nights: DailyMetrics[]): number | null => {
  const withPhase = nights.filter(d => d.sleepDeep != null || d.sleepREM != null || d.sleepCore != null)
  if (!withPhase.length) return null
  const classified = withPhase.reduce((sum, d) =>
    sum + [d.sleepDeep, d.sleepREM, d.sleepCore].filter((v): v is number => v != null).reduce((a, b) => a + b, 0), 0)
  const total = withPhase.reduce((sum, d) => sum + d.sleepHours!, 0)
  if (total <= 0) return null
  return Math.round((classified / total) * 100)
}

/**
 * Measured values only. Time in bed and sleep efficiency are derived from the
 * night's own awake hours, so they exist only where the source measured them:
 * HAE auto-sync supplies `awake`, the XML importer discards awake intervals
 * and leaves all three columns empty. They are never derived from
 * bedtime/wake_time, which mean different things per ingest path and would
 * lie differently on every night.
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
      awake: d.sleepAwake != null ? +d.sleepAwake.toFixed(2) : null,
      timeInBed: (v => v == null ? null : +v.toFixed(1))(timeInBedHours(d.sleepHours, d.sleepAwake)),
      efficiencyPct: sleepEfficiencyPct(d.sleepHours, d.sleepAwake),
      unclassified: unclassifiedHours(d, hours),
      deepPct: share(d.sleepDeep, hours),
      remPct: share(d.sleepREM, hours),
      daytime: isDaytimeEpisode(d),
      windowHours: (w => w == null ? null : +w.toFixed(2))(windowHours(d)),
      suspicious: isSuspicious(d),
    }
  })

  const nightly = withSleep.filter(d => !isDaytimeEpisode(d))
  // A 23-hour window contributes a bedtime that is not a bedtime, so the
  // medians take only the nights whose timestamps can be believed. Their
  // `count` prints as "N из M", which makes the exclusion visible.
  const timed = nightly.filter(d => !isSuspicious(d))

  return {
    nights,
    total: nightly.length,
    under6: nightly.filter(d => d.sleepHours! < 6).length,
    over8: nightly.filter(d => d.sleepHours! >= 8).length,
    missing: frame.calendarDays - nightly.length,
    daytimeCount: withSleep.length - nightly.length,
    suspiciousNights: nightly.filter(isSuspicious).length,
    bedtime: timeOfDayStats(timed.map(d => d.sleepBedtime).filter((v): v is string => !!v), SLEEP_ORIGIN_MIN),
    wake: timeOfDayStats(timed.map(d => d.sleepWakeTime).filter((v): v is string => !!v), SLEEP_ORIGIN_MIN),
    phaseCoveragePct: phaseCoverage(nightly),
    phasesOverTotal: nightly.filter(d => {
      const u = unclassifiedHours(d, d.sleepHours!)
      return u != null && u < 0
    }).length,
  }
}
