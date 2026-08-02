import { supabase } from '../supabase'
import { isDemoActive } from '../demo'
import type { Json } from '../database.types'
import type { DayTimes } from '../workoutPlan'

// Settings-feature data access. Components in src/components/settings must not
// query Supabase directly (see scripts/components-db-guard.test.mjs) — every
// table read/write for this feature lives here.

// ── Telegram link ────────────────────────────────────────────────────────────

export interface TelegramLink { telegram_username: string | null }

export async function getActiveTelegramLink(userId: string): Promise<TelegramLink | null> {
  const { data } = await supabase.from('telegram_links')
    .select('telegram_username')
    .eq('user_id', userId).eq('status', 'active').maybeSingle()
  return data ?? null
}

/** Creates a one-time deep-link token (10-min TTL) and returns it. */
export async function createTelegramLinkToken(userId: string): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await supabase.from('telegram_link_tokens').insert({ token, user_id: userId, expires_at: expires })
  return token
}

export async function pauseTelegramLink(userId: string): Promise<void> {
  await supabase.from('telegram_links').update({ status: 'paused' }).eq('user_id', userId)
}

// ── Workout schedule ─────────────────────────────────────────────────────────

export interface WorkoutSchedule {
  day_times: DayTimes
  notify_hours_before: number
  enabled: boolean
}

export async function getWorkoutSchedule(): Promise<WorkoutSchedule | null> {
  const { data } = await supabase.from('workout_schedule')
    .select('day_times, notify_hours_before, enabled')
    .maybeSingle()
  if (!data) return null
  return { ...data, day_times: (data.day_times ?? {}) as unknown as DayTimes }
}

export async function saveWorkoutSchedule(userId: string, ws: WorkoutSchedule): Promise<boolean> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'
  const { error } = await supabase.from('workout_schedule')
    .upsert({ user_id: userId, ...ws, day_times: ws.day_times as unknown as Json, timezone })
  return !error
}

// ── Cal.com sync status ──────────────────────────────────────────────────────

export interface CalSyncStatus {
  cal_email: string | null
  last_sync_at: string | null
  last_status: string | null
  event_count: number | null
  enabled: boolean
}

export async function getCalSyncStatus(userId: string): Promise<CalSyncStatus | null> {
  const { data } = await supabase.from('cal_sync')
    .select('cal_email, last_sync_at, last_status, event_count, enabled')
    .eq('user_id', userId).maybeSingle()
  return data ?? null
}

// ── Profile location (environment data) ──────────────────────────────────────

export interface ProfileLocation {
  location_label: string | null
  latitude: number | null
  longitude: number | null
}

export async function getProfileLocation(userId: string): Promise<ProfileLocation | null> {
  const { data } = await supabase.from('profiles')
    .select('location_label, latitude, longitude')
    .eq('id', userId).maybeSingle()
  return data ?? null
}

/** Returns an error message on failure, null on success. */
export async function saveProfileLocation(
  userId: string,
  loc: { latitude: number; longitude: number; label: string },
): Promise<string | null> {
  const { error } = await supabase.from('profiles')
    .upsert({ id: userId, latitude: loc.latitude, longitude: loc.longitude, location_label: loc.label })
  return error ? error.message : null
}

export async function updateLocationLabel(userId: string, label: string): Promise<void> {
  await supabase.from('profiles').update({ location_label: label }).eq('id', userId)
}

// Keeps profiles.timezone in step with the device. Every server-rendered local
// time (biweekly report, chat, bot AI context) reads this column via
// _shared/userTimezone.ts; without it they fall back to the product default.
export async function syncProfileTimezone(userId: string): Promise<void> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!timezone) return
  await supabase.from('profiles').upsert({ id: userId, timezone })
}

// Keeps profiles.lang in step with the UI language. Cron-driven AI text (weekly
// coach digest, Telegram messages) has no request body to read the language
// from and used to answer everyone in Russian; it reads this column instead.
export async function syncProfileLang(userId: string, lang: string): Promise<void> {
  await supabase.from('profiles').upsert({ id: userId, lang })
}

// ── Profile basics (age + sex) ───────────────────────────────────────────────

export type Sex = 'male' | 'female'

export interface ProfileBasics {
  birth_year: number | null
  sex: Sex | null
}

export async function loadProfileBasics(userId: string): Promise<ProfileBasics | null> {
  // Demo has no profiles table; without this the section and the doctor report
  // header render empty on the screenshot stand.
  if (isDemoActive()) return { birth_year: 1988, sex: 'male' }
  const { data, error } = await supabase
    .from('profiles')
    .select('birth_year, sex')
    .eq('id', userId)
    .maybeSingle()
  if (error) return null
  return { birth_year: data?.birth_year ?? null, sex: (data?.sex as Sex | null) ?? null }
}

export async function saveProfileBasics(userId: string, patch: Partial<ProfileBasics>): Promise<boolean> {
  if (isDemoActive()) return true
  const { error } = await supabase.from('profiles').update({ ...patch }).eq('id', userId)
  return !error
}

// ── Supplement adherence logs (doctor report) ────────────────────────────────

export interface SupplementAdherenceLog { supplement_id: string; date: string; taken: boolean }

export async function getSupplementLogsSince(userId: string, sinceDate: string): Promise<SupplementAdherenceLog[]> {
  const { data } = await supabase.from('supplement_logs')
    .select('supplement_id, date, taken')
    .eq('user_id', userId)
    .gte('date', sinceDate)
  return (data ?? []) as SupplementAdherenceLog[]
}
