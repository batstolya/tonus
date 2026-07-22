import { supabase } from '../supabase'
import type { Json } from '../database.types'
import type { ExperimentRow, ExperimentResult } from '../experiments'

// experiments data access (see scripts/components-db-guard.test.mjs).

export interface ExperimentDraft {
  hypothesis: string
  change_rule: string
  target_metric: string
  baseline_days: number
  baseline_start: string | null
  start_date: string
  end_date: string
  status: 'active' | 'completed'
}

/** User experiments, newest first; null signals a load error. */
export async function getExperiments(userId: string): Promise<ExperimentRow[] | null> {
  const { data, error } = await supabase.from('experiments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return null
  return (data ?? []) as ExperimentRow[]
}

/** Returns the created row, or null on error. */
export async function createExperiment(userId: string, exp: ExperimentDraft): Promise<ExperimentRow | null> {
  const { data, error } = await supabase.from('experiments')
    .insert({ user_id: userId, ...exp })
    .select()
    .single()
  return error ? null : (data as ExperimentRow)
}

export async function saveExperimentResult(id: string, result: ExperimentResult, aiExplanation: string): Promise<void> {
  await supabase.from('experiments')
    .update({ result: result as unknown as Json, ai_explanation: aiExplanation })
    .eq('id', id)
}

export async function deleteExperiment(id: string): Promise<void> {
  await supabase.from('experiments').delete().eq('id', id)
}
