import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Shared per-run context passed to every section module.
// НЕ ReturnType<typeof createClient>: тот инстанцирует дефолтные генерики
// (schema=never) и не совместим с реальным клиентом.
export type Ctx = {
  supabase: SupabaseClient
  nowMs: number
}
