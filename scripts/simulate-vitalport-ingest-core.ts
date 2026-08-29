import { parseHAE } from '../supabase/functions/_shared/hae.ts'
import { normalizeHealthPayload } from '../supabase/functions/ingest-health/normalize.ts'

export function simulateVitalPortIngest(payload: unknown, userId: string, timezone: string) {
  return parseHAE(userId, normalizeHealthPayload(payload, timezone))
}
