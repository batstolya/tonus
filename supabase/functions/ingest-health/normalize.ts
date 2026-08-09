import { parseHAE, parseHRSamples, type HaePayload, type MetricRow, type SleepRow } from '../_shared/hae.ts'
import { adaptVitalPortPayload, isVitalPortPayload } from '../_shared/vitalport.ts'

export function normalizeHealthPayload(value: unknown, timezone: string): HaePayload {
  if (!isVitalPortPayload(value)) return value as HaePayload
  return adaptVitalPortPayload(value, timezone) ?? { data: { metrics: [] } }
}

interface HealthPayloadDependencies {
  storeRaw: (value: unknown) => Promise<void>
  loadTimezone: () => Promise<unknown>
}

interface HealthPayloadWriteDependencies extends HealthPayloadDependencies {
  writeMetricsStaging: (rows: (MetricRow & { updated_at: string })[]) => Promise<string | null>
  writeSleepStaging: (rows: (SleepRow & { updated_at: string })[]) => Promise<string | null>
  writeMetricsLive: (rows: MetricRow[]) => Promise<boolean>
  writeSleepLive: (rows: SleepRow[]) => Promise<boolean>
  writeHeartRateSamples: (rows: ReturnType<typeof parseHRSamples>) => Promise<void>
}

export async function storeNormalizeAndParseHealthPayload(
  userId: string,
  value: unknown,
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
  return { metrics, sleep, normalizedPayload }
}

export async function processHealthPayload(
  userId: string,
  value: unknown,
  mode: string,
  dependencies: HealthPayloadWriteDependencies,
) {
  const { metrics, sleep, normalizedPayload } = await storeNormalizeAndParseHealthPayload(userId, value, dependencies)

  let mErr: string | null = null
  let sErr: string | null = null
  if (metrics.length) {
    mErr = await dependencies.writeMetricsStaging(
      metrics.map(row => ({ ...row, updated_at: new Date().toISOString() })),
    )
  }
  if (sleep.length) {
    sErr = await dependencies.writeSleepStaging(
      sleep.map(row => ({ ...row, updated_at: new Date().toISOString() })),
    )
  }

  let promoted = 0
  if (mode === 'live') {
    if (metrics.length && await dependencies.writeMetricsLive(metrics.map(row => ({ ...row })))) promoted += metrics.length
    if (sleep.length && await dependencies.writeSleepLive(sleep.map(row => ({ ...row })))) promoted += sleep.length

    const hrSamples = parseHRSamples(userId, normalizedPayload)
    for (let i = 0; i < hrSamples.length; i += 500) {
      await dependencies.writeHeartRateSamples(hrSamples.slice(i, i + 500))
    }
  }

  return { metrics, sleep, mErr, sErr, promoted }
}
