import { supabase } from '../supabase'
import { isDemoActive } from '../demo'
import { demoList } from '../demoDb'
import { loadConcerns, type ConcernLog, type HealthConcern } from '../concerns'
import { loadLabResults, type LabResult } from '../labs'
import { getSupplementLogsSince, type SupplementAdherenceLog } from '../api/settings'
import type { Supplement } from '../supplements'
import type { JournalNote } from './journal'

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
  const { data, error } = await supabase
    .from('concern_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date')
  if (error) throw error
  return (data ?? []) as ConcernLog[]
}

export async function loadNotesWithWellbeing(userId: string, since: string): Promise<JournalNote[]> {
  if (isDemoActive()) {
    return (demoList('context_notes') as JournalNote[])
      .filter(n => n.date >= since)
      .map(n => ({ date: n.date, note: n.note, wellbeing: n.wellbeing ?? null }))
  }
  const { data, error } = await supabase
    .from('context_notes')
    .select('date, note, wellbeing')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date')
  if (error) throw error
  return (data ?? []).map((n: { date: string; note: string | null; wellbeing: number | null }) => ({
    date: n.date, note: n.note ?? '', wellbeing: n.wellbeing,
  }))
}

export async function loadSupplementLogs(userId: string, since: string): Promise<SupplementAdherenceLog[]> {
  if (isDemoActive()) {
    return (demoList('supplement_logs') as SupplementAdherenceLog[]).filter(l => l.date >= since)
  }
  return getSupplementLogsSince(userId, since)
}

export interface ReportSources {
  labs: LabResult[]
  supplements: Supplement[]
  supplementLogs: SupplementAdherenceLog[]
  concerns: HealthConcern[]
  concernLogs: ConcernLog[]
  notes: JournalNote[]
}

/**
 * Every source is loaded independently and tolerates failure: one missing
 * table leaves its section empty instead of killing the whole report.
 */
export async function loadReportSources(userId: string, since: string): Promise<ReportSources> {
  const [labs, supplements, supplementLogs, concerns, concernLogs, notes] = await Promise.all([
    loadLabResults(userId).catch(() => [] as LabResult[]),
    loadAllSupplements(userId).catch(() => [] as Supplement[]),
    loadSupplementLogs(userId, since).catch(() => [] as SupplementAdherenceLog[]),
    loadConcerns(userId).catch(() => [] as HealthConcern[]),
    loadAllConcernLogs(userId, since).catch(() => [] as ConcernLog[]),
    loadNotesWithWellbeing(userId, since).catch(() => [] as JournalNote[]),
  ])
  return { labs, supplements, supplementLogs, concerns, concernLogs, notes }
}
