import { supabase } from './supabase'

export interface DailyNoteSettings {
  time: string
  timezone: string
  enabled: boolean
}

export async function loadDailyNoteSettings(userId: string): Promise<DailyNoteSettings> {
  const { data } = await supabase
    .from('daily_note_settings')
    .select('time, timezone, enabled')
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? { time: '21:00', timezone: 'Europe/Kyiv', enabled: false }
}

export async function saveDailyNoteSettings(
  userId: string,
  patch: Partial<DailyNoteSettings>
): Promise<boolean> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'
  const { error } = await supabase.from('daily_note_settings').upsert(
    { user_id: userId, timezone: tz, updated_at: new Date().toISOString(), ...patch },
    { onConflict: 'user_id' }
  )
  return !error
}
