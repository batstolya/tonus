import { supabase } from './supabase'
import { isDemoActive } from './demo'
import { demoList, demoInsert, demoUpdate, demoRemove, demoId } from './demoDb'
import type { Database } from './database.types'

type HealthConcernInsert = Database['public']['Tables']['health_concerns']['Insert']

export interface HealthConcern {
  id: string
  user_id: string
  name: string
  category: string
  status: 'active' | 'improving' | 'resolved'
  started_at: string | null
  notes: string | null
  is_private: boolean
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
  if (isDemoActive()) return (demoList('health_concerns') as HealthConcern[]).filter(c => c.status !== 'resolved')
  const { data, error } = await supabase.from('health_concerns').select('*')
    .eq('user_id', userId).neq('status', 'resolved').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as HealthConcern[]
}

export async function loadAllConcerns(userId: string): Promise<HealthConcern[]> {
  if (isDemoActive()) return demoList('health_concerns') as HealthConcern[]
  const { data, error } = await supabase.from('health_concerns').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as HealthConcern[]
}

export async function addConcern(userId: string, c: Partial<HealthConcern>): Promise<HealthConcern | null> {
  if (isDemoActive()) {
    return demoInsert('health_concerns', {
      id: demoId('demo-concern'), user_id: userId, name: c.name ?? '', category: c.category ?? 'other',
      status: c.status ?? 'active', started_at: c.started_at ?? null, notes: c.notes ?? null,
      is_private: c.is_private ?? false, created_at: new Date().toISOString(),
    }) as HealthConcern
  }
  const { data } = await supabase.from('health_concerns').insert({ user_id: userId, ...c } as HealthConcernInsert).select().single()
  return data as HealthConcern | null
}

export async function updateConcern(id: string, updates: Partial<HealthConcern>): Promise<void> {
  if (isDemoActive()) return demoUpdate('health_concerns', id, updates)
  await supabase.from('health_concerns').update(updates).eq('id', id)
}

export async function loadLogs(concernId: string): Promise<ConcernLog[]> {
  if (isDemoActive()) {
    return (demoList('concern_logs') as ConcernLog[])
      .filter(l => l.concern_id === concernId)
      .sort((a, b) => a.date.localeCompare(b.date))
  }
  const { data } = await supabase.from('concern_logs').select('*')
    .eq('concern_id', concernId).order('date', { ascending: true })
  return (data ?? []) as ConcernLog[]
}

export async function addLog(userId: string, log: Omit<ConcernLog, 'id' | 'created_at'>): Promise<ConcernLog | null> {
  if (isDemoActive()) {
    return demoInsert('concern_logs', {
      id: demoId('demo-clog'), user_id: userId, created_at: new Date().toISOString(), ...log,
    }) as ConcernLog
  }
  const { data } = await supabase.from('concern_logs').insert({ user_id: userId, ...log }).select().single()
  return data as ConcernLog | null
}

export async function deleteLog(id: string): Promise<void> {
  if (isDemoActive()) return demoRemove('concern_logs', id)
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
  if (isDemoActive()) {
    return (demoList('hair_entries') as HairEntry[]).sort((a, b) => b.date.localeCompare(a.date))
  }
  const { data } = await supabase.from('hair_entries').select('*')
    .eq('user_id', userId).order('date', { ascending: false })
  return (data ?? []) as HairEntry[]
}

export async function saveHairEntry(userId: string, entry: Partial<HairEntry>): Promise<HairEntry | null> {
  if (isDemoActive()) {
    const existing = (demoList('hair_entries') as HairEntry[]).find(h => h.date === entry.date)
    if (existing) { demoUpdate('hair_entries', existing.id, entry); return { ...existing, ...entry } as HairEntry }
    return demoInsert('hair_entries', {
      id: demoId('demo-hair'), user_id: userId, date: entry.date ?? new Date().toISOString().slice(0, 10),
      shedding_level: null, density_rating: null, hairline_rating: null, scalp_note: null,
      photo_top: null, photo_hairline: null, photo_temples: null, notes: null,
      created_at: new Date().toISOString(), ...entry,
    }) as HairEntry
  }
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
