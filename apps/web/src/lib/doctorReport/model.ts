import type { DailyMetrics } from '../../types'
import { computeDailyScores } from '../scores'
import { addDays, localDate } from './dates'
import { avg } from './math'
import {
  periodFrame, summarizeMetrics,
  type MetricSummary, type PeriodFrame,
} from './metrics'
import { supportsClaims } from './reliability'
import { WEEKLY_KEYS, coverage, weeklyRows, type CoverageGap, type WeeklyRow } from './weekly'
import { detectDeviations, type DeviationWeek } from './deviations'
import { buildSleep, withoutDaytimeSleep, type SleepSection } from './sleep'
import { buildLabs, type LabsSection } from './labs'
import { buildSupplements, type SupplementLine } from './supplements'
import { buildConcerns, buildJournal, type ConcernLine, type JournalSection } from './journal'
import type { ReportSources } from './load'
import type { Sex } from '../api/settings'

export interface ScoreSummary {
  key: 'sleep_score' | 'recovery_score'
  label: string
  avg: number
  /** null — never a sentinel 0 — when `trend` is false: nothing to print. */
  first: number | null
  last: number | null
  days: number
  trend: boolean
}

export interface DoctorReportModel {
  period: PeriodFrame
  /** Age is coarse by design: only the birth year is stored. */
  patient: { birthYear: number | null; sex: Sex | null; age: number | null }
  scores: ScoreSummary[]
  metrics: MetricSummary[]
  weekly: { keys: typeof WEEKLY_KEYS; rows: WeeklyRow[] }
  sleep: SleepSection | null
  coverage: { gaps: CoverageGap[]; missingDates: string[] }
  deviations: DeviationWeek[]
  labs: LabsSection
  supplements: SupplementLine[]
  concerns: ConcernLine[]
  journal: JournalSection
}

export interface ReportInput {
  daily: DailyMetrics[]
  sources: ReportSources
  periodDays: number
  today?: string
  /** Concern ids the patient ticked; private concerns are dropped regardless. */
  pickedConcernIds?: Set<string>
}

// Readiness is absent on purpose: on this data it carries little signal.
// Load is absent because it was not load — stress_score is 100 − recovery,
// the same number under a name that promises training volume.
const SCORE_DEFS: { key: ScoreSummary['key']; label: string }[] = [
  { key: 'sleep_score', label: 'Сон' },
  { key: 'recovery_score', label: 'Восстановление' },
]

export function buildReportModel({
  daily, sources, periodDays, today = localDate(), pickedConcernIds,
}: ReportInput): DoctorReportModel {
  // Daytime episodes are shown in the sleep table and excluded everywhere else:
  // one filtered copy feeds metrics, weeks, coverage, deviations and scores.
  const clean = withoutDaytimeSleep(daily)
  const frame = periodFrame(clean, periodDays, today)

  const scoreRows = computeDailyScores(clean)
  const inPeriod = scoreRows.filter(s => s.date >= frame.start && s.date <= today)
  // A trend needs real coverage at both ends, not just an overall average: a
  // day is "in" a third only past its own weight, so a single stray reading
  // can't fabricate a start or end score for a mostly-empty stretch.
  const thirdDays = Math.max(1, Math.floor(frame.calendarDays / 3))
  const firstEnd = addDays(frame.effectiveStart, thirdDays - 1)
  const lastStart = addDays(frame.end, -(thirdDays - 1))
  const scores: ScoreSummary[] = []
  for (const def of SCORE_DEFS) {
    const has = (rows: typeof inPeriod) =>
      rows.map(s => s[def.key]).filter((v): v is number => typeof v === 'number')
    const vals = has(inPeriod)
    if (!vals.length) continue
    const firstVals = has(inPeriod.filter(s => s.date <= firstEnd))
    const lastVals = has(inPeriod.filter(s => s.date >= lastStart))
    const trend = firstVals.length >= thirdDays / 2 && lastVals.length >= thirdDays / 2
    scores.push({
      key: def.key,
      label: def.label,
      avg: Math.round(avg(vals)),
      first: trend ? Math.round(avg(firstVals)) : null,
      last: trend ? Math.round(avg(lastVals)) : null,
      days: vals.length,
      trend,
    })
  }

  const visibleConcerns = sources.concerns.filter(c =>
    !c.is_private && (!pickedConcernIds || pickedConcernIds.has(c.id)))

  const birthYear = sources.profile?.birth_year ?? null

  const metrics = summarizeMetrics(clean, frame)
  const reliable = new Set(metrics.filter(m => supportsClaims(m.reliability.band)).map(m => m.key))

  return {
    period: frame,
    patient: {
      birthYear,
      sex: sources.profile?.sex ?? null,
      age: birthYear ? Number(today.slice(0, 4)) - birthYear : null,
    },
    scores,
    metrics,
    weekly: { keys: WEEKLY_KEYS, rows: weeklyRows(clean, frame) },
    sleep: buildSleep(daily, frame),
    coverage: coverage(clean, frame),
    deviations: detectDeviations(clean, frame, reliable),
    labs: buildLabs(sources.labs, frame.effectiveStart),
    supplements: buildSupplements(sources.supplements, sources.supplementLogs, frame.effectiveStart, today),
    concerns: buildConcerns(visibleConcerns, sources.concernLogs, frame.effectiveStart),
    journal: buildJournal(sources.notes, frame.effectiveStart),
  }
}
