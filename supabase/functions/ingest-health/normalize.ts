import type { HaePayload } from '../_shared/hae.ts'
import { adaptVitalPortPayload, isVitalPortPayload } from '../_shared/vitalport.ts'

export function normalizeHealthPayload(value: unknown, timezone: string): HaePayload {
  if (!isVitalPortPayload(value)) return value as HaePayload
  return adaptVitalPortPayload(value, timezone) ?? { data: { metrics: [] } }
}
