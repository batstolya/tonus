import type { HaePayload } from './hae.ts'

const ENVELOPE_KEYS = ['snapshots', 'dailySnapshots', 'days'] as const
const MEASUREMENT_KEYS = new Set([
  'stepCount',
  'walkingRunningDistanceMeters',
  'activeEnergyKcal',
  'exerciseMinutes',
  'restingHeartRate',
  'hrv',
  'bloodOxygenSaturationPercent',
  'respiratoryRate',
  'vo2Max',
  'sleepHours',
  'sleepBreakdown',
])
const SOURCE = 'VitalPort · Apple Health'

const METRICS = [
  { field: 'stepCount', name: 'step_count', units: 'count', min: 0, max: 200000, round: true },
  { field: 'walkingRunningDistanceMeters', name: 'distance_walking_running', units: 'm', min: 0, max: 500000 },
  { field: 'activeEnergyKcal', name: 'active_energy', units: 'kcal', min: 0, max: 20000 },
  { field: 'exerciseMinutes', name: 'apple_exercise_time', units: 'min', min: 0, max: 1440, round: true },
  { field: 'restingHeartRate', name: 'resting_heart_rate', units: 'count/min', min: 20, max: 250 },
  { field: 'hrv', name: 'heart_rate_variability', units: 'ms', min: 0, max: 1000 },
  { field: 'bloodOxygenSaturationPercent', name: 'blood_oxygen_saturation', units: '%', min: 0, max: 100 },
  { field: 'respiratoryRate', name: 'respiratory_rate', units: 'count/min', min: 1, max: 100 },
  { field: 'vo2Max', name: 'vo2_max', units: 'mL/kg/min', min: 1, max: 100 },
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSnapshot(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.date !== 'string') return false
  if (Number.isNaN(Date.parse(value.date))) return false
  return [...MEASUREMENT_KEYS].some(key => key in value)
}

function snapshotsFrom(value: unknown): Record<string, unknown>[] | null {
  if (!isRecord(value)) return null
  for (const key of ENVELOPE_KEYS) {
    const snapshots = value[key]
    if (Array.isArray(snapshots) && snapshots.length > 0 && snapshots.every(isSnapshot)) return snapshots
  }
  return null
}

export function isVitalPortPayload(value: unknown): boolean {
  return snapshotsFrom(value) !== null
}

function localDay(date: string, timezone: string): string {
  const instant = new Date(date)
  const options: Intl.DateTimeFormatOptions = { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-CA', options)
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' })
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function validNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
}

function sleepHours(snapshot: Record<string, unknown>): number | null {
  const breakdown = isRecord(snapshot.sleepBreakdown) ? snapshot.sleepBreakdown : {}
  const candidates = [
    breakdown.asleepSeconds,
    typeof snapshot.sleepHours === 'number' ? snapshot.sleepHours * 3600 : null,
    breakdown.inBedSeconds,
  ]
  for (const seconds of candidates) {
    const valid = validNumber(seconds, 0, 57600)
    if (valid !== null && valid > 0) return valid / 3600
  }
  return null
}

export function adaptVitalPortPayload(value: unknown, timezone: string): HaePayload | null {
  const snapshots = snapshotsFrom(value)
  if (!snapshots) return null

  const metrics = METRICS.flatMap(metric => {
    const data = snapshots.flatMap(snapshot => {
      const quantity = validNumber(snapshot[metric.field], metric.min, metric.max)
      if (quantity === null) return []
      return [{ date: localDay(String(snapshot.date), timezone), source: SOURCE, qty: metric.round ? Math.round(quantity) : quantity }]
    })
    return data.length ? [{ name: metric.name, units: metric.units, data }] : []
  })
  const sleep = snapshots.flatMap(snapshot => {
    const totalSleep = sleepHours(snapshot)
    return totalSleep === null ? [] : [{ date: localDay(String(snapshot.date), timezone), source: SOURCE, totalSleep }]
  })
  if (sleep.length) metrics.push({ name: 'sleep_analysis', units: 'hr', data: sleep })
  return { data: { metrics } }
}
