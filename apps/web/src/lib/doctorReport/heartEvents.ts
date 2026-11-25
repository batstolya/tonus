// Heart events for the doctor report: Apple Watch high/low heart-rate and
// irregular-rhythm notifications plus ECG recordings (heart_events table).
// Spec: docs/superpowers/specs/2026-11-25-heart-events-ecg-design.md
// Facts only — no interpretation, no diagnosis wording.

export type HeartEventKind = 'high_hr' | 'low_hr' | 'irregular_rhythm' | 'ecg' | 'other'

export interface HeartEvent {
  kind: HeartEventKind
  start_ts: string
  end_ts: string | null
  threshold: number | null
  hr_min: number | null
  hr_max: number | null
  hr_avg: number | null
  classification: string | null
}

export interface HeartEventEntry {
  kind: HeartEventKind
  /** The stored instant; renderers format it in the reader's local time. */
  startIso: string
  endIso: string | null
  threshold: number | null
  hrMin: number | null
  hrMax: number | null
  hrAvg: number | null
  classification: string | null
}

export interface HeartEventsSection {
  total: number
  /** Count per kind, busiest first; only kinds that occurred appear. */
  byKind: { kind: HeartEventKind; count: number }[]
  /** Every event of the period, oldest first. */
  entries: HeartEventEntry[]
}

/** Russian dictionary keys (rendered through t/rt). */
export const HEART_EVENT_LABEL: Record<HeartEventKind, string> = {
  low_hr: 'Уведомление о низком пульсе',
  high_hr: 'Уведомление о высоком пульсе',
  irregular_rhythm: 'Уведомление о нерегулярном ритме',
  ecg: 'ЭКГ',
  other: 'Другое уведомление о пульсе',
}

const round = (v: number | null) => (v == null ? null : Math.round(v))

export function buildHeartEvents(events: HeartEvent[], periodStartDate: string): HeartEventsSection {
  // Compare on the reader's LOCAL calendar date — the same clock localStamp
  // prints and the period frame uses. The UTC date would move events near
  // midnight across the period boundary.
  const own = events
    .filter(e => localStamp(e.start_ts).slice(0, 10) >= periodStartDate)
    .slice()
    .sort((a, b) => a.start_ts.localeCompare(b.start_ts))

  const counts = new Map<HeartEventKind, number>()
  for (const e of own) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1)

  return {
    total: own.length,
    byKind: [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
    entries: own.map(e => ({
      kind: e.kind,
      startIso: e.start_ts,
      endIso: e.end_ts,
      threshold: round(e.threshold),
      hrMin: round(e.hr_min),
      hrMax: round(e.hr_max),
      hrAvg: round(e.hr_avg),
      classification: e.classification,
    })),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Instant → "YYYY-MM-DD HH:MM" in the reader's local time (as the rest of the report). */
export function localStamp(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Same text in both renderers (markdown.ts and DoctorReport.tsx), given the
 * caller's translate function. Facts only: range, threshold, classification.
 */
export function heartEventLine(e: HeartEventEntry, t: (key: string) => string): string {
  const head = `${localStamp(e.startIso)} ${t(HEART_EVENT_LABEL[e.kind])}`
  const bpm = t('уд/мин')
  if (e.kind === 'ecg') {
    const parts = [e.classification ?? t('классификация не указана')]
    if (e.hrAvg != null) parts.push(`${t('средний пульс')} ${e.hrAvg} ${bpm}`)
    return `${head}: ${parts.join(', ')}`
  }
  const parts: string[] = []
  if (e.hrMin != null && e.hrMax != null) parts.push(`${t('пульс')} ${e.hrMin}–${e.hrMax} ${bpm}`)
  if (e.threshold != null) parts.push(`(${t('порог')} ${e.threshold})`)
  return parts.length ? `${head}: ${parts.join(' ')}` : head
}
