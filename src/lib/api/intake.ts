import { supabase } from '../supabase'

// intake_events data access (see scripts/components-db-guard.test.mjs).
// Serves both the intake feature (QuickLog) and nutrition (meals with macros).

export interface IntakeEvent {
  id: string
  ts: string
  type: string
  amount: number | null
  unit: string | null
  note: string | null
}

export interface Meal {
  ts: string
  note: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
}

/** Returns the created row, or null on error. */
export async function createIntakeEvent(
  userId: string,
  ev: { ts: string; type: string; amount: number | null; unit: string | null; note: string | null },
): Promise<IntakeEvent | null> {
  const { data, error } = await supabase.from('intake_events')
    .insert({ user_id: userId, ...ev })
    .select()
    .single()
  return error ? null : (data as IntakeEvent)
}

export async function deleteIntakeEvent(id: string): Promise<void> {
  await supabase.from('intake_events').delete().eq('id', id)
}

/** Meals for the window, newest first; null signals a load error. */
export async function getMeals(userId: string, sinceIso: string): Promise<Meal[] | null> {
  const { data, error } = await supabase.from('intake_events')
    .select('ts, note, calories, protein_g, carbs_g, fat_g')
    .eq('user_id', userId).eq('type', 'meal')
    .gte('ts', sinceIso).order('ts', { ascending: false })
  if (error) return null
  return (data ?? []) as Meal[]
}

export async function createMealEvent(
  userId: string,
  meal: { note: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null },
): Promise<void> {
  await supabase.from('intake_events').insert({
    user_id: userId,
    ts: new Date().toISOString(),
    type: 'meal',
    ...meal,
  })
}
