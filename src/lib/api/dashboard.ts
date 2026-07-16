import { supabase } from '../supabase'

// Dashboard-feature data access (see scripts/components-db-guard.test.mjs).
// health_alerts are written by ingest-health; the dashboard only reads and acks.

export interface HealthAlert {
  id: string
  level: 'yellow' | 'red'
  message: string
  created_at: string
}

export async function getOpenHealthAlerts(
  userId: string,
  opts: { sinceHours: number; limit: number; type?: string },
): Promise<HealthAlert[]> {
  const since = new Date(Date.now() - opts.sinceHours * 3600_000).toISOString()
  let q = supabase.from('health_alerts')
    .select('id, level, message, created_at')
    .eq('user_id', userId)
  if (opts.type) q = q.eq('type', opts.type)
  const { data } = await q
    .is('acknowledged_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(opts.limit)
  return (data ?? []) as HealthAlert[]
}

export async function acknowledgeHealthAlert(alertId: string): Promise<void> {
  await supabase.from('health_alerts')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', alertId)
}
