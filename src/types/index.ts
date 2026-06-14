export interface HealthRecord {
  type: string
  value: number
  unit: string
  startDate: Date
  endDate: Date
  sourceName: string
}

export interface DailyMetrics {
  date: string // YYYY-MM-DD
  heartRate?: { avg: number; min: number; max: number }
  restingHeartRate?: number
  hrv?: number
  walkingHeartRate?: number
  oxygenSaturation?: number
  respiratoryRate?: number
  wristTemperature?: number
  vo2max?: number
  sleepHours?: number
  sleepBedtime?: string   // ISO time string
  sleepWakeTime?: string  // ISO time string
  sleepDeep?: number      // hours
  sleepREM?: number       // hours
  sleepCore?: number      // hours
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
