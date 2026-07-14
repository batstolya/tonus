import { supabase } from './supabase'
import { isDemoActive } from './demo'
import { demoList, demoInsert, demoUpdate, demoRemove, demoId } from './demoDb'

export async function loadTodayNote(userId: string, date: string): Promise<string> {
  if (isDemoActive()) return demoList('context_notes').find(n => n.date === date)?.note ?? ''
  const { data } = await supabase
    .from('context_notes')
    .select('note')
    .eq('user_id', userId)
    .eq('date', date)
    .single()
  return data?.note ?? ''
}

export async function saveNote(userId: string, date: string, note: string): Promise<void> {
  if (isDemoActive()) {
    const existing = demoList('context_notes').find(n => n.date === date)
    if (!note.trim()) { if (existing) demoRemove('context_notes', existing.id); return }
    if (existing) demoUpdate('context_notes', existing.id, { note: note.trim() })
    else demoInsert('context_notes', { id: demoId('demo-note'), user_id: userId, date, note: note.trim(), wellbeing: null })
    return
  }
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
  if (isDemoActive()) {
    return demoList('context_notes')
      .filter(n => n.date >= since)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(n => ({ date: n.date, note: n.note }))
  }
  const { data } = await supabase
    .from('context_notes')
    .select('date, note')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date', { ascending: false })
  return (data ?? []) as { date: string; note: string }[]
}
