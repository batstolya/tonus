import { supabase } from '../supabase'
import type { AdherenceLog } from '../adherence'

// Supplements-feature data access (see scripts/components-db-guard.test.mjs).
// Not to be confused with src/lib/supplements.ts, which owns the supplement
// list itself — this module serves AdherenceBlock and TreatmentTracker.

export interface SupplementOption { id: string; name: string }

export interface Treatment {
  id: string
  user_id: string
  supplement_id: string | null
  name: string
  started_at: string
  outcome_metrics: string[]
  notes: string | null
  created_at: string
}

export interface MetricRow { date: string; metric: string; avg_val: number }

/** Adherence logs for the rolling window; RLS scopes rows to the current user. */
export async function getAdherenceLogs(sinceDate: string): Promise<AdherenceLog[]> {
  const { data } = await supabase.from('supplement_logs')
    .select('supplement_id, date, taken')
    .gte('date', sinceDate)
  return (data ?? []) as AdherenceLog[]
}

export async function getTreatments(userId: string): Promise<Treatment[]> {
  const { data } = await supabase.from('treatments')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
  return (data ?? []) as Treatment[]
}

export async function getSupplementOptions(userId: string): Promise<SupplementOption[]> {
  const { data } = await supabase.from('supplements')
    .select('id, name')
    .eq('user_id', userId)
    .order('name')
  return (data ?? []) as SupplementOption[]
}

export async function getMetricDailyRows(
  userId: string,
  metrics: string[],
  from: string,
  to: string,
): Promise<MetricRow[]> {
  const { data } = await supabase.from('metrics_daily')
    .select('date, metric, avg_val')
    .eq('user_id', userId)
    .in('metric', metrics)
    .gte('date', from)
    .lte('date', to)
  return (data ?? []) as MetricRow[]
}

/** Returns the created row, or null on error. */
export async function createTreatment(
  userId: string,
  tr: { supplement_id: string | null; name: string; started_at: string },
): Promise<Treatment | null> {
  const { data, error } = await supabase.from('treatments')
    .insert({ user_id: userId, ...tr })
    .select()
    .single()
  return error ? null : (data as Treatment)
}

export async function deleteTreatment(id: string): Promise<void> {
  await supabase.from('treatments').delete().eq('id', id)
}
