import { supabase } from './supabase'
import { callFunction } from './edgeFunctions'

export interface CoachFocus { text: string; set_at: string }

export async function loadFocus(userId: string): Promise<CoachFocus | null> {
  const { data } = await supabase.from('coach_profile').select('focus').eq('user_id', userId).maybeSingle()
  const f = data?.focus
  return f && f.text ? f as CoachFocus : null
}

// Чек-ины фокуса за текущую неделю (с момента установки фокуса)
export async function loadCheckins(userId: string, sinceISO: string): Promise<string[]> {
  const { data } = await supabase
    .from('coach_events')
    .select('created_at')
    .eq('user_id', userId).eq('type', 'focus_checkin')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false })
  return (data ?? []).map((e: any) => e.created_at.slice(0, 10))
}

export async function checkInToday(userId: string): Promise<void> {
  await supabase.from('coach_events').insert({ user_id: userId, type: 'focus_checkin', payload: { date: new Date().toISOString().slice(0, 10) } })
}

export async function removeCheckinToday(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  await supabase.from('coach_events')
    .delete()
    .eq('user_id', userId).eq('type', 'focus_checkin')
    .gte('created_at', `${today}T00:00:00`)
}

// Запустить разбор недели вручную (кнопка) — возвращает текст
export async function runWeeklyReview(): Promise<string | null> {
  try {
    const j = await callFunction<{ text?: string }>('coach-weekly', {})
    return j.text ?? null
  } catch { return null }
}
