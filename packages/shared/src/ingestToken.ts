import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Токен автосинка: по нему `ingest-health` узнаёт пользователя, потому что
// функция принимает данные БЕЗ JWT (её дёргает Health Auto Export, у которого
// сессии нет и быть не может). Один токен на пользователя — им пользуются оба
// отправителя, HAE и телефон, и по полю `source` внутри payload'а мы потом их
// различаем.
//
// Клиент передаётся аргументом, а не берётся синглтоном: так модуль живёт
// одинаково в вебе и в приложении и тестируется поддельным клиентом.

export type IngestMode = 'shadow' | 'live'

export interface IngestToken {
  token: string
  mode: IngestMode
  last_ingest_at: string | null
  last_status: string | null
}

type Client = SupabaseClient<Database>

const COLUMNS = 'token, mode, last_ingest_at, last_status'

/**
 * Случайный токен. `crypto.getRandomValues` есть и в браузере, и в рантайме
 * Expo — но если однажды не окажется, лучше упасть здесь, чем выдать
 * предсказуемый токен, по которому кто угодно пишет чужие данные.
 */
function randomToken(): string {
  const bytes = new Uint8Array(24)
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('crypto.getRandomValues is unavailable — refusing to generate a guessable ingest token')
  }
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export async function loadIngestToken(client: Client, userId: string): Promise<IngestToken | null> {
  const { data } = await client
    .from('ingest_tokens').select(COLUMNS).eq('user_id', userId).maybeSingle()
  return (data as IngestToken | null) ?? null
}

export async function ensureIngestToken(client: Client, userId: string): Promise<IngestToken> {
  const existing = await loadIngestToken(client, userId)
  if (existing) return existing
  const token = randomToken()
  await client.from('ingest_tokens').insert({ user_id: userId, token, mode: 'shadow' })
  return { token, mode: 'shadow', last_ingest_at: null, last_status: null }
}

/**
 * Новый токен вместо старого. Осторожно: отправители, у которых остался
 * прежний, замолкают — им нужен новый адрес вебхука.
 */
export async function regenerateIngestToken(client: Client, userId: string): Promise<IngestToken> {
  const token = randomToken()
  await client.from('ingest_tokens').upsert({ user_id: userId, token }, { onConflict: 'user_id' })
  return (await loadIngestToken(client, userId))!
}

export async function setIngestMode(client: Client, userId: string, mode: IngestMode): Promise<void> {
  await client.from('ingest_tokens').update({ mode }).eq('user_id', userId)
}

/** Адрес приёмника. Он же — вебхук для HAE, он же — то, куда постит телефон. */
export function ingestUrl(supabaseUrl: string, token: string): string {
  return `${supabaseUrl}/functions/v1/ingest-health?token=${token}`
}
