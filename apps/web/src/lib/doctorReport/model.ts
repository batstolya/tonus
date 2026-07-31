import type { DailyMetrics } from '../../types'
import { computeDailyScores } from '../scores'
import {
  avgTimeOfDay, localDate, periodSlice, periodStart, summarizeMetrics,
  type BaselineKey, type MetricSummary,
} from './metrics'
import { WEEKLY_KEYS, coverage, weeklyRows, type CoverageGap, type WeeklyRow } from './weekly'
import { detectDeviations, type DeviationWeek } from './deviations'
import { buildSleep, type SleepSection } from './sleep'
import { buildLabs, type LabsSection } from './labs'
import { buildSupplements, type SupplementLine } from './supplements'
import { buildConcerns, buildJournal, type ConcernLine, type JournalSection } from './journal'
import type { ReportSources } from './load'
import type { Sex } from '../api/settings'

export interface ScoreSummary {
  key: 'sleep_score' | 'recovery_score' | 'stress_score'
  label: string
  avg: number
  first: number
  last: number
}

export interface DoctorReportModel {
  period: { start: string; end: string; days: number }
  /** Age is coarse by design: only the birth year is stored. */
  patient: { birthYear: number | null; sex: Sex | null; age: number | null }
  scores: ScoreSummary[]
  metrics: MetricSummary[]
  avgBedtime: string | null
  avgWakeTime: string | null
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
const SCORE_DEFS: { key: ScoreSummary['key']; label: string }[] = [
  { key: 'sleep_score', label: 'Сон' },
  { key: 'recovery_score', label: 'Восстановление' },
  { key: 'stress_score', label: 'Нагрузка' },
]

export function buildReportModel({
  daily, sources, periodDays, today = localDate(), pickedConcernIds,
}: ReportInput): DoctorReportModel {
  const start = periodStart(periodDays, today)
  const slice = periodSlice(daily, periodDays, today)

  const scoreRows = computeDailyScores(daily)
  const lastScore = scoreRows[scoreRows.length - 1]
  const baselines: Partial<Record<BaselineKey, number | null>> = {
    rhr: lastScore?.rhr_baseline ?? null,
    hrv: lastScore?.hrv_baseline ?? null,
    sleep: lastScore?.sleep_baseline ?? null,
    steps: lastScore?.steps_baseline ?? null,
  }

  const inPeriod = scoreRows.filter(s => s.date >= start && s.date <= today)
  const third = Math.max(1, Math.floor(inPeriod.length / 3))
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
  const scores: ScoreSummary[] = []
  for (const def of SCORE_DEFS) {
    const vals = inPeriod.map(s => s[def.key]).filter((v): v is number => typeof v === 'number')
    if (!vals.length) continue
    scores.push({
      key: def.key,
      label: def.label,
      avg: Math.round(mean(vals)),
      first: Math.round(mean(vals.slice(0, third))),
      last: Math.round(mean(vals.slice(-third))),
    })
  }

  const visibleConcerns = sources.concerns.filter(c =>
    !c.is_private && (!pickedConcernIds || pickedConcernIds.has(c.id)))

  const birthYear = sources.profile?.birth_year ?? null

  return {
    period: { start, end: today, days: periodDays },
    patient: {
      birthYear,
      sex: sources.profile?.sex ?? null,
      age: birthYear ? Number(today.slice(0, 4)) - birthYear : null,
    },
    scores,
    metrics: summarizeMetrics(daily, periodDays, today, baselines),
    avgBedtime: avgTimeOfDay(slice.map(d => d.sleepBedtime).filter((v): v is string => !!v)),
    avgWakeTime: avgTimeOfDay(slice.map(d => d.sleepWakeTime).filter((v): v is string => !!v)),
    weekly: { keys: WEEKLY_KEYS, rows: weeklyRows(daily, periodDays, today) },
    sleep: buildSleep(daily, periodDays, today),
    coverage: coverage(daily, periodDays, today),
    deviations: detectDeviations(daily, periodDays, today),
    labs: buildLabs(sources.labs, start),
    supplements: buildSupplements(sources.supplements, sources.supplementLogs, start, today),
    concerns: buildConcerns(visibleConcerns, sources.concernLogs, start),
    journal: buildJournal(sources.notes, start),
  }
}
