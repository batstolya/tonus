import { supabase } from './supabase'
import type { CalendarEvent } from '../types'

export async function saveCalendarEvents(userId: string, events: CalendarEvent[], source: string): Promise<boolean> {
  if (!events.length) return true

  const rows = events.map(e => ({
    user_id: userId,
    uid: e.uid,
    title: e.title,
    start_ts: e.start.toISOString(),
    end_ts: e.end.toISOString(),
    description: e.description ?? null,
    location: e.location ?? null,
    source,
  }))

  const chunkSize = 200
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase.from('calendar_events').upsert(rows.slice(i, i + chunkSize), {
      onConflict: 'user_id,uid',
    })
    if (error) {
      console.warn('calendar_events save error:', error.message)
      return false
    }
  }
  return true
}

export async function loadCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .order('start_ts', { ascending: false })
    .limit(2000)

  if (error) {
    console.warn('calendar_events load error:', error.message)
    return []
  }

  return (data ?? []).map(row => ({
    uid: row.uid,
    title: row.title,
    start: new Date(row.start_ts),
    end: new Date(row.end_ts),
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    source: row.source ?? undefined,
  }))
}
