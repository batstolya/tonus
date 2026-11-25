import type { CatalogKey } from '../../../../supabase/functions/_shared/metricCatalog'

export interface HealthRecord {
  type: string
  value: number
  unit: string
  startDate: Date
  endDate: Date
  sourceName: string
}

/** Catalog metrics (docs/superpowers/specs/2026-11-25-metric-catalog-design.md), one optional number each. */
export type CatalogMetrics = Partial<Record<CatalogKey, number>>

export interface DailyMetrics extends CatalogMetrics {
  date: string // YYYY-MM-DD
  heartRate?: { avg: number; min: number; max: number }
  restingHeartRate?: number
  hrv?: number
  walkingHeartRate?: number
  oxygenSaturation?: number
  respiratoryRate?: number
  wristTemperature?: number
  vo2max?: number
  breathingDisturbances?: number // per night, events per hour (Apple Watch)
  daylightMinutes?: number       // personal time in daylight, minutes per day
  sleepHours?: number
  sleepBedtime?: string   // ISO time string
  sleepWakeTime?: string  // ISO time string
  sleepDeep?: number      // hours
  sleepREM?: number       // hours
  sleepCore?: number      // hours
  sleepAwake?: number     // hours awake during the night; undefined = unknown, 0 = measured zero
  steps?: number
  distance?: number
  activeEnergy?: number
  exerciseMinutes?: number
  flightsClimbed?: number
}

export interface HeartRateSample {
  time: Date
  value: number
  sourceName: string
}

export interface CalendarEvent {
  uid: string
  title: string
  start: Date
  end: Date
  description?: string
  location?: string
  source?: string
}

export interface StressMapEntry {
  event: CalendarEvent
  avgHeartRate: number | null
  peakHeartRate: number | null
  baselineHeartRate: number | null
  heartRateDelta: number | null
  sampleCount: number
  isPhysicalActivity: boolean
}

export interface ParseProgress {
  phase: 'reading' | 'parsing' | 'done' | 'error'
  percent: number
  message?: string
}

export type MetricKey = keyof Omit<DailyMetrics, 'date'>
