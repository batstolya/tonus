import type { DailyMetrics } from '../types'

export interface AvailableMetrics {
  hasHeartRate: boolean
  hasSleep: boolean
  hasActivity: boolean
  hasStress: boolean   // needs heartRate samples + calendar
  hasHRV: boolean
  hasSpO2: boolean
  hasRespiratoryRate: boolean
  hasWristTemp: boolean
}

export function detectAvailableMetrics(daily: DailyMetrics[]): AvailableMetrics {
  const check = (fn: (d: DailyMetrics) => boolean) => daily.some(fn)

  return {
    hasHeartRate: check(d => d.heartRate != null || d.restingHeartRate != null),
    hasSleep: check(d => (d.sleepHours ?? 0) > 0),
    hasActivity: check(d => (d.steps ?? 0) > 0 || (d.activeEnergy ?? 0) > 0 || (d.exerciseMinutes ?? 0) > 0),
    hasStress: check(d => d.heartRate != null || d.restingHeartRate != null), // stress needs HR, shown regardless
    hasHRV: check(d => d.hrv != null),
    hasSpO2: check(d => d.oxygenSaturation != null),
    hasRespiratoryRate: check(d => d.respiratoryRate != null),
    hasWristTemp: check(d => d.wristTemperature != null),
  }
}
