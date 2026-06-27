import { supabase } from './supabase'

export interface Supplement {
  id: string
  user_id: string
  name: string
  default_dose: string | null
  unit: string | null
  active: boolean
  sort_order: number
  created_at: string
  stock_count: number | null
}

export interface SupplementLog {
  id: string
  supplement_id: string
  date: string
  taken: boolean
  dose: string | null
  note: string | null
}

export async function loadSupplements(userId: string): Promise<Supplement[]> {
  const { data } = await supabase
    .from('supplements')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('sort_order')
  return (data ?? []) as Supplement[]
}

export async function addSupplement(userId: string, name: string, defaultDose?: string, unit?: string): Promise<Supplement | null> {
  const { data } = await supabase
    .from('supplements')
    .insert({ user_id: userId, name, default_dose: defaultDose ?? null, unit: unit ?? null })
    .select()
    .single()
  return data as Supplement | null
}

export async function updateStock(id: string, next: number): Promise<boolean> {
  const { error } = await supabase.from('supplements').update({ stock_count: next }).eq('id', id)
  return !error
}

export async function deleteSupplement(id: string): Promise<void> {
  await supabase.from('supplements').update({ active: false }).eq('id', id)
}

export async function loadLogsForMonth(userId: string, year: number, month: number): Promise<SupplementLog[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(year, month, 0).toISOString().slice(0, 10)
  const { data } = await supabase
    .from('supplement_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)
  return (data ?? []) as SupplementLog[]
}

// ── Reminders (docs/specs/SPEC-REMINDERS.md) ───────────────────────────────

export interface ReminderSetting {
  supplement_id: string
  times: string[]
  weekdays: number[]
  timezone: string
  quiet_until: string | null
  enabled: boolean
}

export async function loadReminders(userId: string): Promise<Record<string, ReminderSetting>> {
  const { data } = await supabase
    .from('reminder_settings')
    .select('supplement_id, times, weekdays, timezone, quiet_until, enabled')
    .eq('user_id', userId)
  const map: Record<string, ReminderSetting> = {}
  for (const r of data ?? []) map[r.supplement_id] = r as ReminderSetting
  return map
}

export async function saveReminder(
  userId: string,
  supplementId: string,
  patch: Partial<ReminderSetting>
): Promise<boolean> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'
  const { error } = await supabase.from('reminder_settings').upsert(
    {
      user_id: userId,
      supplement_id: supplementId,
      timezone: tz,
      updated_at: new Date().toISOString(),
      ...patch,
    },
    { onConflict: 'user_id,supplement_id' }
  )
  return !error
}

export async function toggleLog(userId: string, supplementId: string, date: string, taken: boolean): Promise<void> {
  if (taken) {
    await supabase.from('supplement_logs').upsert(
      { user_id: userId, supplement_id: supplementId, date, taken: true },
      { onConflict: 'user_id,supplement_id,date' }
    )
  } else {
    await supabase.from('supplement_logs')
      .delete()
      .eq('user_id', userId)
      .eq('supplement_id', supplementId)
      .eq('date', date)
  }
}
