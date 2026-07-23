import type { DailyMetrics } from '../types'

export interface Insight {
  id: string
  text: string
  metric: string
}

export function generateInsights(daily: DailyMetrics[]): Insight[] {
  if (daily.length < 7) return []
  const insights: Insight[] = []
  const recent = daily.slice(-7)
  const prev = daily.slice(-14, -7)

  // Resting HR trend
  const recentRHR = recent.filter(d => d.restingHeartRate).map(d => d.restingHeartRate!)
  const prevRHR = prev.filter(d => d.restingHeartRate).map(d => d.restingHeartRate!)
  if (recentRHR.length >= 3 && prevRHR.length >= 3) {
    const avgRecent = recentRHR.reduce((a, b) => a + b, 0) / recentRHR.length
    const avgPrev = prevRHR.reduce((a, b) => a + b, 0) / prevRHR.length
    const delta = Math.round(avgRecent - avgPrev)
    if (Math.abs(delta) >= 3) {
      insights.push({
        id: 'rhr-trend',
        metric: 'Пульс покоя',
        text: delta > 0
          ? `Пульс покоя за последнюю неделю вырос на ${delta} уд/мин по сравнению с предыдущей — это наблюдение, не диагноз.`
          : `Пульс покоя за последнюю неделю снизился на ${Math.abs(delta)} уд/мин — возможно, тело лучше восстанавливается.`,
      })
    }
  }

  // HRV trend
  const recentHRV = recent.filter(d => d.hrv).map(d => d.hrv!)
  const prevHRV = prev.filter(d => d.hrv).map(d => d.hrv!)
  if (recentHRV.length >= 3 && prevHRV.length >= 3) {
    const avgR = recentHRV.reduce((a, b) => a + b, 0) / recentHRV.length
    const avgP = prevHRV.reduce((a, b) => a + b, 0) / prevHRV.length
    const delta = Math.round(avgR - avgP)
    if (Math.abs(delta) >= 5) {
      insights.push({
        id: 'hrv-trend',
        metric: 'ВСР (HRV)',
        text: delta > 0
          ? `Вариабельность пульса выросла на ${delta} мс — как правило, признак хорошего восстановления.`
          : `Вариабельность пульса снизилась на ${Math.abs(delta)} мс — стоит обратить внимание на сон и нагрузки.`,
      })
    }
  }

  // Sleep
  const recentSleep = recent.filter(d => d.sleepHours).map(d => d.sleepHours!)
  if (recentSleep.length >= 3) {
    const avg = recentSleep.reduce((a, b) => a + b, 0) / recentSleep.length
    if (avg < 6.5) {
      insights.push({
        id: 'sleep-low',
        metric: 'Сон',
        text: `Средний сон за неделю — ${avg.toFixed(1)} ч. Рекомендуется не менее 7–8 часов.`,
      })
    }
  }

  return insights
}
