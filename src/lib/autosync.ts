import { supabase } from './supabase'
import { getEnv } from './env'

export interface IngestToken { token: string; mode: 'shadow' | 'live'; last_ingest_at: string | null; last_status: string | null }

function randomToken(): string {
  const a = new Uint8Array(24)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

export async function loadToken(userId: string): Promise<IngestToken | null> {
  const { data } = await supabase.from('ingest_tokens').select('token, mode, last_ingest_at, last_status').eq('user_id', userId).maybeSingle()
  return (data as IngestToken) ?? null
}

export async function ensureToken(userId: string): Promise<IngestToken> {
  const existing = await loadToken(userId)
  if (existing) return existing
  const token = randomToken()
  await supabase.from('ingest_tokens').insert({ user_id: userId, token, mode: 'shadow' })
  return { token, mode: 'shadow', last_ingest_at: null, last_status: null }
}

export async function regenerateToken(userId: string): Promise<IngestToken> {
  const token = randomToken()
  await supabase.from('ingest_tokens').upsert({ user_id: userId, token }, { onConflict: 'user_id' })
  return (await loadToken(userId))!
}

export async function setMode(userId: string, mode: 'shadow' | 'live'): Promise<void> {
  await supabase.from('ingest_tokens').update({ mode }).eq('user_id', userId)
}

export function webhookUrl(token: string): string {
  return `${getEnv().supabaseUrl}/functions/v1/ingest-health?token=${token}`
}

export interface CompareRow { date: string; metric: string; prod: number | null; staging: number | null; match: boolean }

// Сверка staging ↔ боевое за последние N дней по ключевым метрикам.
export async function loadComparison(userId: string, days = 14): Promise<CompareRow[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const sel = 'date, metric, avg_val, sum_val'
  const [prodRes, stgRes] = await Promise.all([
    supabase.from('metrics_daily').select(sel).eq('user_id', userId).gte('date', since),
    supabase.from('metrics_daily_staging').select(sel).eq('user_id', userId).gte('date', since),
  ])
  type CmpRow = { date: string; metric: string; avg_val: number | null; sum_val: number | null }
  const val = (r: CmpRow) => r.sum_val ?? r.avg_val ?? null
  const key = (r: CmpRow) => `${r.date}|${r.metric}`
  const prodMap = new Map((prodRes.data ?? []).map((r) => [key(r), val(r)]))
  const stgMap = new Map((stgRes.data ?? []).map((r) => [key(r), val(r)]))
  const allKeys = new Set([...prodMap.keys(), ...stgMap.keys()])
  const rows: CompareRow[] = []
  for (const k of allKeys) {
    const [date, metric] = k.split('|')
    const prod = prodMap.get(k) ?? null
    const staging = stgMap.get(k) ?? null
    const match = prod != null && staging != null && Math.abs(prod - staging) <= Math.max(1, Math.abs(prod) * 0.05)
    rows.push({ date, metric, prod, staging, match })
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.metric.localeCompare(b.metric))
}
