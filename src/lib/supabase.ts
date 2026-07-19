import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getEnv } from './env'

// Module-load read: both entries (env.web.ts, vitest.env-setup.ts) run
// initEnv() before lib modules load. Becomes a factory in Phase 0b.
const { supabaseUrl, supabaseAnonKey } = getEnv()

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
