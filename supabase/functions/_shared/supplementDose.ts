// Marking one dose taken from Telegram.
// Spec: docs/superpowers/specs/2026-08-23-supplement-multi-dose-design.md
//
// The bot knows the delta (one button press = one dose) but not the current
// count, so the increment happens in the log_supplement_dose RPC, where it is
// atomic and clamped to the supplement's doses_per_day.

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface DoseProgress {
  count: number
  perDay: number
}

/** Text for the reply after a dose is marked: partial days show the progress. */
export function doseProgressText(name: string, progress: DoseProgress | null): string {
  if (!progress || progress.perDay <= 1 || progress.count >= progress.perDay) {
    return `✅ <b>${name}</b> — принято. Молодец!`
  }
  return `✅ <b>${name}</b> — принято, ${progress.count}/${progress.perDay} за сегодня.`
}

export async function takeDose(
  supabase: SupabaseClient,
  userId: string,
  supplementId: string,
  date: string,
): Promise<DoseProgress | null> {
  const { data: count, error } = await supabase.rpc('log_supplement_dose', {
    p_user_id: userId,
    p_supplement_id: supplementId,
    p_date: date,
    p_delta: 1,
  })
  if (error) return null
  const { data: sup } = await supabase
    .from('supplements').select('doses_per_day').eq('id', supplementId).maybeSingle()
  return { count: Number(count ?? 1), perDay: Number(sup?.doses_per_day ?? 1) }
}
