import type { SupabaseClient } from '@supabase/supabase-js'
import { createTonusClient } from '@tonus/shared'
import type { Database } from './database.types'
import { getEnv } from './env'

// The factory itself lives in @tonus/shared (the mobile app builds its own
// client from it); this module owns the web singleton and re-exports the
// factory so existing web imports keep working.
export { createTonusClient }
export type { TonusClientConfig } from '@tonus/shared'

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
