import { supabase } from './supabase'

export async function loadTodayNote(userId: string, date: string): Promise<string> {
  const { data } = await supabase
    .from('context_notes')
    .select('note')
    .eq('user_id', userId)
    .eq('date', date)
    .single()
  return data?.note ?? ''
}

export async function saveNote(userId: string, date: string, note: string): Promise<void> {
  if (!note.trim()) {
    await supabase.from('context_notes').delete().eq('user_id', userId).eq('date', date)
    return
  }
  await supabase.from('context_notes').upsert(
    { user_id: userId, date, note: note.trim(), updated_at: new Date().toISOString() },
    { onConflict: 'user_id,date' }
  )
}

export async function loadRecentNotes(userId: string, days = 30): Promise<{ date: string; note: string }[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
  const { data } = await supabase
    .from('context_notes')
    .select('date, note')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date', { ascending: false })
  return (data ?? []) as { date: string; note: string }[]
}
