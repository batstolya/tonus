import type { DailyMetrics } from '../../types'

// Сводка шапки экрана пульса. Считается строго по переданным дням (выбранный
// период), а не по всей истории — иначе цифры не бьются с графиком и таблицей.
export function computePeriodStats(days: DailyMetrics[]): {
  avg: number | null
  resting: number | null
  max: number | null
} {
  const withHR = days.filter(d => d.heartRate)
  const withRHR = days.filter(d => d.restingHeartRate)
  return {
    avg: withHR.length
      ? Math.round(withHR.reduce((a, d) => a + d.heartRate!.avg, 0) / withHR.length)
      : null,
    resting: withRHR.length
      ? Math.round(withRHR.reduce((a, d) => a + d.restingHeartRate!, 0) / withRHR.length)
      : null,
    max: withHR.length ? Math.round(Math.max(...withHR.map(d => d.heartRate!.max))) : null,
  }
}
