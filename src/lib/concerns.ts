import { supabase } from './supabase'

export interface HealthConcern {
  id: string
  user_id: string
  name: string
  category: string
  status: 'active' | 'improving' | 'resolved'
  started_at: string | null
  notes: string | null
  created_at: string
}

export interface ConcernLog {
  id: string
  concern_id: string
  date: string
  severity: number | null
  note: string | null
  photo_path: string | null
  created_at: string
}

export interface HairEntry {
  id: string
  user_id: string
  date: string
  shedding_level: number | null
  density_rating: number | null
  hairline_rating: number | null
  scalp_note: string | null
  photo_top: string | null
  photo_hairline: string | null
  photo_temples: string | null
  notes: string | null
  created_at: string
}

export const CATEGORIES: Record<string, string> = {
  skin: '🧴 Кожа',
  hair: '💇 Волосы',
  breathing: '🫁 Дыхание',
  gut: '🫀 ЖКТ',
  other: '🔹 Другое',
}

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:    { label: 'Активна', color: 'var(--red)' },
  improving: { label: 'Улучшается', color: '#f59e0b' },
  resolved:  { label: 'Решена', color: 'var(--green)' },
}

export async function loadConcerns(userId: string): Promise<HealthConcern[]> {
  const { data, error } = await supabase.from('health_concerns').select('*')
    .eq('user_id', userId).neq('status', 'resolved').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as HealthConcern[]
}

export async function loadAllConcerns(userId: string): Promise<HealthConcern[]> {
  const { data, error } = await supabase.from('health_concerns').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as HealthConcern[]
}

export async function addConcern(userId: string, c: Partial<HealthConcern>): Promise<HealthConcern | null> {
  const { data } = await supabase.from('health_concerns').insert({ user_id: userId, ...c }).select().single()
  return data as HealthConcern | null
}

export async function updateConcern(id: string, updates: Partial<HealthConcern>): Promise<void> {
  await supabase.from('health_concerns').update(updates).eq('id', id)
}

export async function loadLogs(concernId: string): Promise<ConcernLog[]> {
  const { data } = await supabase.from('concern_logs').select('*')
    .eq('concern_id', concernId).order('date', { ascending: true })
  return (data ?? []) as ConcernLog[]
}

export async function addLog(userId: string, log: Omit<ConcernLog, 'id' | 'created_at'>): Promise<ConcernLog | null> {
  const { data } = await supabase.from('concern_logs').insert({ user_id: userId, ...log }).select().single()
  return data as ConcernLog | null
}

export async function deleteLog(id: string): Promise<void> {
  await supabase.from('concern_logs').delete().eq('id', id)
}

export async function uploadConcernPhoto(userId: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const path = `${userId}/concerns/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('health-photos').upload(path, file)
  if (error) return null
  return path
}

export async function getPhotoUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from('health-photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? ''
}

// Hair entries
export async function loadHairEntries(userId: string): Promise<HairEntry[]> {
  const { data } = await supabase.from('hair_entries').select('*')
    .eq('user_id', userId).order('date', { ascending: false })
  return (data ?? []) as HairEntry[]
}

export async function saveHairEntry(userId: string, entry: Partial<HairEntry>): Promise<HairEntry | null> {
  const { data } = await supabase.from('hair_entries')
    .upsert({ user_id: userId, ...entry }, { onConflict: 'user_id,date' }).select().single()
  return data as HairEntry | null
}

export async function uploadHairPhoto(userId: string, file: File, angle: string): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const path = `${userId}/hair/${Date.now()}_${angle}.${ext}`
  const { error } = await supabase.storage.from('health-photos').upload(path, file)
  if (error) return null
  return path
}
