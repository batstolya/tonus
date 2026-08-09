import { parseHAE, parseHRSamples, type HaePayload } from '../_shared/hae.ts'
import { adaptVitalPortPayload, isVitalPortPayload } from '../_shared/vitalport.ts'

export function normalizeHealthPayload(value: unknown, timezone: string): HaePayload {
  if (!isVitalPortPayload(value)) return value as HaePayload
  return adaptVitalPortPayload(value, timezone) ?? { data: { metrics: [] } }
}

interface HealthPayloadDependencies {
  storeRaw: (value: unknown) => Promise<void>
  loadTimezone: () => Promise<unknown>
}

export async function storeNormalizeAndParseHealthPayload(
  userId: string,
  value: unknown,
  includeHeartRate: boolean,
  dependencies: HealthPayloadDependencies,
) {
  await dependencies.storeRaw(value)

  let timezone = 'UTC'
  if (isVitalPortPayload(value)) {
    const storedTimezone = await dependencies.loadTimezone()
    if (typeof storedTimezone === 'string' && storedTimezone.trim()) timezone = storedTimezone.trim()
  }

  const normalizedPayload = normalizeHealthPayload(value, timezone)
  const { metrics, sleep } = parseHAE(userId, normalizedPayload)
  const hrSamples = includeHeartRate ? parseHRSamples(userId, normalizedPayload) : []
  return { metrics, sleep, hrSamples }
}
