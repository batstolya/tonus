import { supabase } from './supabase'
import { isDemoActive } from './demo'
import { demoList, demoInsert, demoUpdate, demoRemove, demoId } from './demoDb'
import { clampDosesPerDay } from './supplementDose'

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
  doses_per_day: number
}

export interface SupplementLog {
  id: string
  supplement_id: string
  date: string
  taken: boolean
  taken_count: number
  dose: string | null
  note: string | null
}

export async function loadSupplements(userId: string): Promise<Supplement[]> {
  if (isDemoActive()) {
    return (demoList('supplements') as Supplement[])
      .filter(s => s.active)
      .sort((a, b) => a.sort_order - b.sort_order)
  }
  const { data, error } = await supabase
    .from('supplements')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as Supplement[]
}

export async function addSupplement(
  userId: string, name: string, defaultDose?: string, unit?: string, dosesPerDay?: number,
): Promise<Supplement | null> {
  if (isDemoActive()) {
    return demoInsert('supplements', {
      id: demoId('demo-sup'), user_id: userId, name,
      default_dose: defaultDose ?? null, unit: unit ?? null,
      active: true, sort_order: 99, created_at: new Date().toISOString(), stock_count: null,
      doses_per_day: dosesPerDay ?? 1,
    }) as Supplement
  }
  const { data } = await supabase
    .from('supplements')
    .insert({
      user_id: userId, name, default_dose: defaultDose ?? null, unit: unit ?? null,
      doses_per_day: clampDosesPerDay(dosesPerDay ?? 1),
    })
    .select()
    .single()
  return data as Supplement | null
}

export async function updateDosesPerDay(id: string, dosesPerDay: number): Promise<boolean> {
  const next = clampDosesPerDay(dosesPerDay)
  if (isDemoActive()) { demoUpdate('supplements', id, { doses_per_day: next }); return true }
  const { error } = await supabase.from('supplements').update({ doses_per_day: next }).eq('id', id)
  return !error
}

export async function updateStock(id: string, next: number): Promise<boolean> {
  if (isDemoActive()) { demoUpdate('supplements', id, { stock_count: next }); return true }
  const { error } = await supabase.from('supplements').update({ stock_count: next }).eq('id', id)
  return !error
}

export async function deleteSupplement(id: string): Promise<void> {
  if (isDemoActive()) return demoUpdate('supplements', id, { active: false })
  await supabase.from('supplements').update({ active: false }).eq('id', id)
}

export async function loadLogsForMonth(userId: string, year: number, month: number): Promise<SupplementLog[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(year, month, 0).toISOString().slice(0, 10)
  if (isDemoActive()) {
    return (demoList('supplement_logs') as SupplementLog[])
      .filter(l => l.date >= start && l.date <= end)
  }
  const { data, error } = await supabase
    .from('supplement_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)
  if (error) throw error
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

/**
 * Write the exact number of doses taken on a day. The web knows the target
 * value (the cell cycles through it), so it sets rather than increments;
 * Telegram increments through the log_supplement_dose RPC instead.
 */
export async function setDoseCount(
  userId: string, supplementId: string, date: string, count: number,
): Promise<void> {
  const taken = count > 0
  if (isDemoActive()) {
    const existing = (demoList('supplement_logs') as SupplementLog[])
      .find(l => l.supplement_id === supplementId && l.date === date)
    if (taken && existing) {
      demoUpdate('supplement_logs', existing.id, { taken: true, taken_count: count })
    } else if (taken) {
      demoInsert('supplement_logs', {
        id: demoId('demo-suplog'), user_id: userId, supplement_id: supplementId,
        date, taken: true, taken_count: count, dose: null, note: null,
      })
    } else if (existing) {
      demoRemove('supplement_logs', existing.id)
    }
    return
  }
  if (taken) {
    await supabase.from('supplement_logs').upsert(
      { user_id: userId, supplement_id: supplementId, date, taken: true, taken_count: count },
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
