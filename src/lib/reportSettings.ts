import { supabase } from './supabase'

export interface ReportSettings {
  paused: boolean
  frequency_days: number
  detail_level: 'short' | 'medium' | 'full'
  send_sensitive: boolean
  morning_summary: boolean
  morning_time: string
}

const DEFAULTS: ReportSettings = {
  paused: false,
  frequency_days: 14,
  detail_level: 'full',
  send_sensitive: false,
  morning_summary: false,
  morning_time: '09:00',
}

export async function loadReportSettings(userId: string): Promise<ReportSettings> {
  const { data } = await supabase
    .from('report_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return { ...DEFAULTS, ...(data ?? {}) }
}

export async function saveReportSettings(
  userId: string,
  patch: Partial<ReportSettings>
): Promise<boolean> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'
  const { error } = await supabase.from('report_settings').upsert(
    { user_id: userId, timezone: tz, ...patch },
    { onConflict: 'user_id' }
  )
  return !error
}
