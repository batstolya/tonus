import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getEnv } from './env'

export interface TonusClientConfig {
  url: string
  anonKey: string
  /** supabase-js options (auth storage, detectSessionInUrl, ...) — the mobile app injects its own. */
  options?: SupabaseClientOptions<'public'>
}

/** Platform-agnostic factory (mobile Phase 0b). The web singleton below uses it with env config. */
export function createTonusClient(config: TonusClientConfig): SupabaseClient<Database> {
  return createClient<Database>(config.url, config.anonKey, config.options)
}

// The web singleton is created on FIRST USE, never at module load: in the
// production bundle this chunk can evaluate before the entry chunk runs
// initEnv() (Rollup hoists chunk imports), and an eager getEnv() here
// blanks the whole app.
let client: SupabaseClient<Database> | null = null

function instance(): SupabaseClient<Database> {
  if (!client) {
    const { supabaseUrl, supabaseAnonKey } = getEnv()
    client = createTonusClient({ url: supabaseUrl, anonKey: supabaseAnonKey })
  }
  return client
}

// Proxy preserves the existing `supabase.*` API while deferring construction.
// Methods are bound to the real instance so their `this` never sees the proxy.
export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop): unknown {
    const inst = instance()
    const value = Reflect.get(inst as object, prop) as unknown
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(inst)
      : value
  },
})
