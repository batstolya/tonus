import type { DailyMetrics } from '../../types'
import { computeDailyScores, type DailyScore } from '../../lib/scores'

// Табы живой демо-панели в hero. Лейблы — русские ключи i18n (переводит t()).
export const DEMO_TABS = ['readiness', 'sleep', 'heart', 'insights'] as const
export type DemoTab = (typeof DEMO_TABS)[number]

export const TAB_LABELS: Record<DemoTab, string> = {
  readiness: 'Готовность',
  sleep: 'Сон',
  heart: 'Пульс',
  insights: 'Инсайты',
}

// Демо-инсайты лендинга (показываются в панели hero и в сцене «AI находит связи»)
export const DEMO_INSIGHTS: { title: string; text: string }[] = [
  { title: '☕ Кофе после 15:00', text: '→ сон на 1.5 ч короче' },
  { title: '🍽️ Поздняя еда', text: '→ HRV падает на 15%' },
  { title: '💼 Стрессовые дни', text: '→ пульс покоя выше на 8 уд/мин' },
]

export interface LiveDemoData {
  score: DailyScore
  sleep14: { date: string; deep: number | null; rem: number | null; core: number | null }[]
  heart14: { date: string; resting: number | null; max: number | null }[]
}

// Готовит данные панели из daily-метрик (демо-фикстура). Скор — той же
// формулой, что и в приложении, чтобы лендинг показывал настоящий продукт.
export function prepareLiveDemoData(daily: DailyMetrics[]): LiveDemoData {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const scores = computeDailyScores(sorted)
  const score = scores[scores.length - 1]
  const last14 = sorted.slice(-14)
  return {
    score,
    sleep14: last14.map(d => ({
      date: d.date.slice(5),
      deep: d.sleepDeep != null ? Math.round(d.sleepDeep * 10) / 10 : null,
      rem: d.sleepREM != null ? Math.round(d.sleepREM * 10) / 10 : null,
      core: d.sleepCore != null ? Math.round(d.sleepCore * 10) / 10 : null,
    })),
    heart14: last14.map(d => ({
      date: d.date.slice(5),
      resting: d.restingHeartRate != null ? Math.round(d.restingHeartRate) : null,
      max: d.heartRate ? Math.round(d.heartRate.max) : null,
    })),
  }
}
