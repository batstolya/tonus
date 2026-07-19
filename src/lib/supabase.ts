import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getEnv } from './env'

// The client is created on FIRST USE, never at module load: in the
// production bundle this chunk can evaluate before the entry chunk runs
// initEnv() (Rollup hoists chunk imports), and an eager getEnv() here
// blanks the whole app. Becomes an explicit factory in mobile Phase 0b.
let client: SupabaseClient<Database> | null = null

function instance(): SupabaseClient<Database> {
  if (!client) {
    const { supabaseUrl, supabaseAnonKey } = getEnv()
    client = createClient<Database>(supabaseUrl, supabaseAnonKey)
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
