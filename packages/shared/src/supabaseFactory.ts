import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js'
import type { Database } from './database.types'

export interface TonusClientConfig {
  url: string
  anonKey: string
  /** supabase-js options (auth storage, detectSessionInUrl, ...) — each platform injects its own. */
  options?: SupabaseClientOptions<'public'>
}

/**
 * Platform-agnostic client factory. The web app wraps it in a lazy singleton
 * (see apps/web/src/lib/supabase.ts); the mobile app builds its own client with
 * Keychain-backed auth storage.
 */
export function createTonusClient(config: TonusClientConfig): SupabaseClient<Database> {
  return createClient<Database>(config.url, config.anonKey, config.options)
}
