import { supabase } from '../supabase'
import type { EnvDay } from '../correlations'

// environment_daily data access (see scripts/components-db-guard.test.mjs).
// RLS scopes rows to the current user, so no explicit user filter is needed.

export type { EnvDay }

export async function getEnvironmentDays(sinceDate: string): Promise<EnvDay[]> {
  const { data } = await supabase.from('environment_daily')
    .select('date, temp_c, pressure_hpa, daylight_minutes, precipitation_mm, kp_index')
    .gte('date', sinceDate)
    .order('date')
  return (data ?? []) as EnvDay[]
}
