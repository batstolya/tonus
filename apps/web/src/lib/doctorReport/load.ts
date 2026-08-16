import { supabase } from '../supabase'
import { fetchAllPages } from '../supabasePaging'
import { isDemoActive } from '../demo'
import { demoList } from '../demoDb'
import { loadAllConcerns, type ConcernLog, type HealthConcern } from '../concerns'
import { loadLabResults, type LabResult } from '../labs'
import {
  getSupplementLogsSince, loadProfileBasics,
  type SupplementAdherenceLog, type ProfileBasics,
} from '../api/settings'
import type { Supplement } from '../supplements'
import type { IntakeEvent } from '../api/intake'
import type { JournalNote } from './journal'
import { REPORTED_TYPES } from './intake'

/**
 * Unlike loadSupplements, discontinued rows are kept: a treatment the patient
 * stopped is often exactly what the doctor asks about.
 */
export async function loadAllSupplements(userId: string): Promise<Supplement[]> {
  if (isDemoActive()) {
    return (demoList('supplements') as Supplement[]).slice().sort((a, b) => a.sort_order - b.sort_order)
  }
  const { data, error } = await supabase
    .from('supplements')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as Supplement[]
}

export async function loadAllConcernLogs(userId: string, since: string): Promise<ConcernLog[]> {
  if (isDemoActive()) {
    return (demoList('concern_logs') as ConcernLog[]).filter(l => l.date >= since)
  }
  return await fetchAllPages<ConcernLog>((from, to) => supabase
    .from('concern_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date')
    .range(from, to))
}

export async function loadNotesWithWellbeing(userId: string, since: string): Promise<JournalNote[]> {
  if (isDemoActive()) {
    return (demoList('context_notes') as JournalNote[])
      .filter(n => n.date >= since)
      .map(n => ({ date: n.date, note: n.note, wellbeing: n.wellbeing ?? null }))
  }
  const data = await fetchAllPages<{ date: string; note: string | null; wellbeing: number | null }>(
    (from, to) => supabase
      .from('context_notes')
      .select('date, note, wellbeing')
      .eq('user_id', userId)
      .gte('date', since)
      .order('date')
      .range(from, to))
  return data.map(n => ({
    date: n.date, note: n.note ?? '', wellbeing: n.wellbeing,
  }))
}

export async function loadSupplementLogs(userId: string, since: string): Promise<SupplementAdherenceLog[]> {
  if (isDemoActive()) {
    return (demoList('supplement_logs') as SupplementAdherenceLog[]).filter(l => l.date >= since)
  }
  return getSupplementLogsSince(userId, since)
}

/** Intake the report prints; other types stay listed as data it does not hold. */
export async function loadIntakeEvents(userId: string, since: string): Promise<IntakeEvent[]> {
  if (isDemoActive()) {
    return (demoList('intake_events') as IntakeEvent[])
      .filter(e => e.ts.slice(0, 10) >= since && (REPORTED_TYPES as readonly string[]).includes(e.type))
  }
  return await fetchAllPages<IntakeEvent>((from, to) => supabase
    .from('intake_events')
    .select('id, ts, type, amount, unit, note')
    .eq('user_id', userId)
    .gte('ts', `${since}T00:00:00`)
    .in('type', REPORTED_TYPES as unknown as string[])
    .order('ts')
    .range(from, to))
}

export interface ReportSources {
  labs: LabResult[]
  supplements: Supplement[]
  supplementLogs: SupplementAdherenceLog[]
  concerns: HealthConcern[]
  concernLogs: ConcernLog[]
  notes: JournalNote[]
  profile: ProfileBasics | null
  intake: IntakeEvent[]
}

/**
 * Every source is loaded independently and tolerates failure: one missing
 * table leaves its section empty instead of killing the whole report.
 */
export async function loadReportSources(userId: string, since: string): Promise<ReportSources> {
  const [labs, supplements, supplementLogs, concerns, concernLogs, notes, profile, intake] = await Promise.all([
    loadLabResults(userId).catch(() => [] as LabResult[]),
    loadAllSupplements(userId).catch(() => [] as Supplement[]),
    loadSupplementLogs(userId, since).catch(() => [] as SupplementAdherenceLog[]),
    // Resolved complaints included on purpose: "this cleared up in March" is
    // part of the history the doctor is reading, and the report has a status
    // line ready for it. The patient unticks what is not worth printing.
    loadAllConcerns(userId).catch(() => [] as HealthConcern[]),
    loadAllConcernLogs(userId, since).catch(() => [] as ConcernLog[]),
    loadNotesWithWellbeing(userId, since).catch(() => [] as JournalNote[]),
    loadProfileBasics(userId).catch(() => null),
    loadIntakeEvents(userId, since).catch(() => [] as IntakeEvent[]),
  ])
  return { labs, supplements, supplementLogs, concerns, concernLogs, notes, profile, intake }
}
