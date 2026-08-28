// Habits data access. Components must never query the DB directly
// (scripts/components-db-guard.test.mjs), so every habits query lives here.
// Pure day/streak logic is in ../habits.

import { supabase } from '../supabase'
import { isDemoActive } from '../demo'
import { demoList, demoInsert, demoRemove, demoId } from '../demoDb'
import { addDays, HABIT_WINDOW_DAYS, type Habit, type HabitBreak } from '../habits'

export interface NewHabit {
  name: string
  note: string | null
  start_date: string
}

export async function loadHabits(userId: string): Promise<Habit[]> {
  if (isDemoActive()) return demoList('habits') as Habit[]
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Habit[]
}

/** Breaks from `since` (default: the grid window) forward. */
export async function loadHabitBreaks(userId: string, since?: string): Promise<HabitBreak[]> {
  const from = since ?? addDays(new Date().toISOString().slice(0, 10), -(HABIT_WINDOW_DAYS - 1))
  if (isDemoActive()) {
    return (demoList('habit_breaks') as HabitBreak[]).filter(b => b.date >= from)
  }
  const { data, error } = await supabase
    .from('habit_breaks')
    .select('id, habit_id, date, note')
    .eq('user_id', userId)
    .gte('date', from)
  if (error) throw new Error(error.message)
  return (data ?? []) as HabitBreak[]
}

export async function createHabit(userId: string, input: NewHabit): Promise<Habit> {
  if (isDemoActive()) {
    return demoInsert('habits', {
      id: demoId('demo-habit'), user_id: userId, ...input, active: true, sort_order: 0,
      created_at: new Date().toISOString(),
    }) as Habit
  }
  const { data, error } = await supabase
    .from('habits')
    .insert({ user_id: userId, ...input })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Habit
}

/**
 * Marks or clears a break. Goes through the RPC rather than a plain insert so
 * the web and the bot share one set of rules (start-date check, idempotence).
 */
export async function setHabitBreak(
  userId: string,
  habitId: string,
  date: string,
  broken: boolean,
): Promise<void> {
  if (isDemoActive()) {
    const existing = (demoList('habit_breaks') as HabitBreak[])
      .find(b => b.habit_id === habitId && b.date === date)
    if (broken && !existing) {
      demoInsert('habit_breaks', { id: demoId('demo-habit-break'), user_id: userId, habit_id: habitId, date, note: null })
    } else if (!broken && existing) {
      demoRemove('habit_breaks', existing.id)
    }
    return
  }
  const { error } = await supabase.rpc('set_habit_break', {
    p_user_id: userId, p_habit_id: habitId, p_date: date, p_broken: broken,
  })
  if (error) throw new Error(error.message)
}

export async function archiveHabit(id: string, active: boolean): Promise<void> {
  if (isDemoActive()) return
  const { error } = await supabase.from('habits').update({ active }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteHabit(id: string): Promise<void> {
  if (isDemoActive()) { demoRemove('habits', id); return }
  const { error } = await supabase.from('habits').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
