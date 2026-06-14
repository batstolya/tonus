import { supabase } from './supabase'
import type { CalendarEvent } from '../types'

export async function saveCalendarEvents(userId: string, events: CalendarEvent[], source: string) {
  if (!events.length) return

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
    await supabase.from('calendar_events').upsert(rows.slice(i, i + chunkSize), {
      onConflict: 'user_id,uid',
    })
  }
}

export async function loadCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const { data } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .order('start_ts', { ascending: false })
    .limit(2000)

  return (data ?? []).map(row => ({
    uid: row.uid,
    title: row.title,
    start: new Date(row.start_ts),
    end: new Date(row.end_ts),
    description: row.description ?? undefined,
    location: row.location ?? undefined,
  }))
}
