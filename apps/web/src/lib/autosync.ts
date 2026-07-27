import {
  ensureIngestToken,
  ingestUrl,
  loadIngestToken,
  regenerateIngestToken,
  setIngestMode,
  type IngestToken,
} from '@tonus/shared'
import { supabase } from './supabase'
import { getEnv } from './env'

// Работа с токеном автосинка переехала в @tonus/shared: тот же токен теперь
// берёт мобильное приложение, а два экземпляра этой логики разошлись бы при
// первой же правке. Здесь остались фасад с подставленным клиентом и сверка
// staging ↔ боевое — она нужна только вебу.

export type { IngestToken }

export const loadToken = (userId: string) => loadIngestToken(supabase, userId)
export const ensureToken = (userId: string) => ensureIngestToken(supabase, userId)
export const regenerateToken = (userId: string) => regenerateIngestToken(supabase, userId)
export const setMode = (userId: string, mode: 'shadow' | 'live') => setIngestMode(supabase, userId, mode)
export const webhookUrl = (token: string) => ingestUrl(getEnv().supabaseUrl, token)

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
