import type { HealthConcern, ConcernLog } from '../concerns'
import { avg } from './math'
import { mondayOf } from './weekly'

export interface ConcernLine {
  id: string
  name: string
  category: string
  status: HealthConcern['status']
  startedAt: string | null
  note: string | null
  severity: { count: number; avg: number; firstHalf: number; secondHalf: number } | null
  /** Every noted entry of the period, oldest first. */
  logs: { date: string; severity: number | null; note: string }[]
}

const round1 = (n: number) => +n.toFixed(1)

export function buildConcerns(
  concerns: HealthConcern[],
  logs: ConcernLog[],
  periodStartDate: string,
): ConcernLine[] {
  return concerns.map(c => {
    const own = logs
      .filter(l => l.concern_id === c.id && l.date >= periodStartDate)
      .sort((a, b) => a.date.localeCompare(b.date))
    const sev = own.map(l => l.severity).filter((v): v is number => typeof v === 'number')
    const half = Math.floor(sev.length / 2)
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      status: c.status,
      startedAt: c.started_at,
      note: c.notes,
      severity: sev.length
        ? {
            count: sev.length,
            avg: round1(avg(sev)),
            firstHalf: round1(avg(sev.slice(0, half || 1))),
            secondHalf: round1(avg(sev.slice(half))),
          }
        : null,
      // Whole history of the period, not a tail of it: the doctor reads this
      // section for the course of the complaint, and a truncated list reads as
      // "that is all there was". Entries without a note carry nothing to read
      // — they are already counted in the severity block above.
      logs: own
        .filter((l): l is ConcernLog & { note: string } => !!l.note)
        .map(l => ({ date: l.date, severity: l.severity, note: l.note })),
    }
  })
}

export interface JournalNote { date: string; note: string; wellbeing: number | null }

export interface JournalSection {
  weeks: { weekStart: string; avg: number; count: number }[]
  notes: JournalNote[]
  wellbeingCount: number
  wellbeingAvg: number | null
}

export function buildJournal(notes: JournalNote[], periodStartDate: string): JournalSection {
  const inPeriod = [...notes]
    .filter(n => n.date >= periodStartDate)
    .sort((a, b) => a.date.localeCompare(b.date))

  const wb = inPeriod.map(n => n.wellbeing).filter((v): v is number => typeof v === 'number')
  const weeks = new Map<string, number[]>()
  for (const n of inPeriod) {
    if (typeof n.wellbeing !== 'number') continue
    const wk = mondayOf(n.date)
    weeks.set(wk, [...(weeks.get(wk) ?? []), n.wellbeing])
  }

  return {
    weeks: [...weeks.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, v]) => ({ weekStart, avg: round1(avg(v)), count: v.length })),
    // Every note of the period. A tail of them printed under a count of all
    // of them reads as the whole diary, which is the one thing it is not.
    notes: inPeriod.filter(n => n.note),
    wellbeingCount: wb.length,
    wellbeingAvg: wb.length ? round1(avg(wb)) : null,
  }
}
