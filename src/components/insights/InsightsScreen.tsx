import type { DailyMetrics } from '../../types'
import { generateInsights } from '../../utils/insights'

interface Props {
  daily: DailyMetrics[]
}

export function InsightsScreen({ daily }: Props) {
  const insights = generateInsights(daily)

  return (
    <div className="screen">
      <h2>Инсайты и тренды</h2>
      {insights.length === 0 ? (
        <p className="empty-hint">Нужно хотя бы 14 дней данных для генерации инсайтов.</p>
      ) : (
        <div className="insights-list">
          {insights.map(i => (
            <div key={i.id} className="insight-card">
              <div className="insight-tag">{i.metric}</div>
              <p>{i.text}</p>
            </div>
          ))}
        </div>
      )}
      <p className="caveat">Всё выше — наблюдения на основе данных, не медицинские рекомендации.</p>
    </div>
  )
}
