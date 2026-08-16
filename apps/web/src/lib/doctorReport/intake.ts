import type { IntakeEvent } from '../api/intake'
import { quantile, timeOfDayStats, type TimeStat } from './math'
import type { PeriodFrame } from './metrics'

/**
 * Coffee, alcohol and medication cluster in the waking day, so 18:00 — the
 * seam sleep uses — sits in the middle of the evening drinking hour and would
 * split it. 04:00 is the emptiest hour for all three.
 */
export const INTAKE_ORIGIN_MIN = 4 * 60

/**
 * The intake a doctor asks about as exposure rather than as diet. Coffee used
 * to sit here too; it moved to the nutrition section, where the patient's food
 * and every drink are read together. Workouts and life events stay unprinted:
 * they are recorded far more erratically and are listed as absent instead.
 *
 * Order is the print order: medication first, then alcohol.
 */
export const REPORTED_TYPES = ['meds', 'alcohol'] as const
export type ReportedIntakeType = (typeof REPORTED_TYPES)[number]

/** One spelling for both renderers, the same way the labs module owns its status text. */
export const INTAKE_LABELS: Record<string, string> = {
  meds: 'Лекарства', alcohol: 'Алкоголь', coffee: 'Кофе', water: 'Вода',
}

export interface IntakeName {
  /** `null` when the patient logged the dose without naming it. */
  name: string | null
  count: number
}

export interface IntakeLine {
  /** Widened past `ReportedIntakeType`: the nutrition section reuses this shape for drinks. */
  type: string
  /** Calendar days of the period carrying at least one event of this type. */
  days: number
  calendarDays: number
  events: number
  /**
   * Median of the per-day totals over days with a mark — not over events, or a
   * day of three coffees would read like a day of one. `null` when the type
   * carries no amounts at all, which is normal for medication.
   */
  medianPerDay: number | null
  unit: string | null
  time: TimeStat | null
  /**
   * Medication names with their counts, commonest first. Empty for every other
   * type: "лекарства — 23 отметки" tells a doctor nothing without the names,
   * while "кофе — 94" needs none.
   */
  names: IntakeName[]
}

const dayOf = (ts: string): string => {
  const d = new Date(ts)
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function namesOf(events: { note: string | null }[]): IntakeName[] {
  // Trim and case-fold to group, but print the first spelling the patient used.
  const seen = new Map<string, { name: string | null; count: number }>()
  for (const e of events) {
    const raw = e.note?.trim()
    const key = raw ? raw.toLocaleLowerCase() : ''
    const hit = seen.get(key)
    if (hit) hit.count++
    else seen.set(key, { name: raw || null, count: 1 })
  }
  // Commonest first; the unnamed remainder always last, whatever its count —
  // it is the leftover of the list, not one of its entries.
  return [...seen.values()].sort((a, b) =>
    b.count - a.count
    || Number(a.name == null) - Number(b.name == null)
    || (a.name ?? '').localeCompare(b.name ?? '', 'ru'))
}

/**
 * One line per type present in the period. Absent types are omitted rather
 * than printed as zero: the patient never ticking alcohol is not a measurement
 * that they drank none, and the section note says so.
 */
/**
 * One line for one type, or `null` when the period holds none of it. Shared
 * with the nutrition section so a cup of coffee and a glass of water are
 * counted by exactly the same rules as a dose of medication — the median is
 * always over per-day totals, never over events.
 */
export function summarizeIntakeType(
  events: { ts: string; type: string; amount: number | null; unit: string | null; note: string | null }[],
  type: string,
  frame: PeriodFrame,
  withNames = false,
): IntakeLine | null {
  const own = events.filter(e => {
    const day = dayOf(e.ts)
    return e.type === type && day >= frame.effectiveStart && day <= frame.end
  })
  if (!own.length) return null

  const perDay = new Map<string, number>()
  for (const e of own) {
    if (e.amount == null) continue
    const day = dayOf(e.ts)
    perDay.set(day, (perDay.get(day) ?? 0) + e.amount)
  }
  const totals = [...perDay.values()]

  return {
    type,
    days: new Set(own.map(e => dayOf(e.ts))).size,
    calendarDays: frame.calendarDays,
    events: own.length,
    medianPerDay: totals.length ? +quantile(totals, 0.5).toFixed(1) : null,
    unit: own.find(e => e.amount != null && e.unit)?.unit ?? null,
    time: timeOfDayStats(own.map(e => e.ts), INTAKE_ORIGIN_MIN),
    names: withNames ? namesOf(own) : [],
  }
}

export function buildIntake(events: IntakeEvent[], frame: PeriodFrame): IntakeLine[] {
  return REPORTED_TYPES
    .map(type => summarizeIntakeType(events, type, frame, type === 'meds'))
    .filter((l): l is IntakeLine => l != null)
}
