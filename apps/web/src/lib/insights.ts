import type { DailyMetrics } from '../types'

// Наблюдения считаются здесь, а переводятся на месте отрисовки: модуль не
// React'овый и до t() не дотягивается. Поэтому наружу едет ключ словаря с
// плейсхолдером {n} и его значение — раньше тут лежал готовый русский текст,
// и украиноязычный пользователь читал наблюдения по-русски.
export interface Insight {
  id: string
  key: string
  vars: Record<string, string | number>
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
        key: delta > 0
          ? 'Пульс покоя за последнюю неделю вырос на {n} уд/мин по сравнению с предыдущей — это наблюдение, не диагноз.'
          : 'Пульс покоя за последнюю неделю снизился на {n} уд/мин — возможно, тело лучше восстанавливается.',
        vars: { n: Math.abs(delta) },
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
        key: delta > 0
          ? 'Вариабельность пульса выросла на {n} мс — как правило, признак хорошего восстановления.'
          : 'Вариабельность пульса снизилась на {n} мс — стоит обратить внимание на сон и нагрузки.',
        vars: { n: Math.abs(delta) },
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
        key: 'Средний сон за неделю — {n} ч. Рекомендуется не менее 7–8 часов.',
        vars: { n: avg.toFixed(1) },
      })
    }
  }

  return insights
}
