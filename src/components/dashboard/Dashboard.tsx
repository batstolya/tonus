import type { DailyMetrics, HeartRateSample, CalendarEvent } from '../../types'
import type { AppView } from '../../store/appStore'
import { generateInsights } from '../../utils/insights'

interface Props {
  daily: DailyMetrics[]
  heartRateSamples: HeartRateSample[]
  events: CalendarEvent[]
  onNavigate: (view: AppView) => void
}

function last<T>(arr: T[]): T | undefined { return arr[arr.length - 1] }

export function Dashboard({ daily, events, onNavigate }: Props) {
  const today = last(daily)
  const insights = generateInsights(daily)

  const totalDays = daily.length
  const avgRHR = daily.filter(d => d.restingHeartRate).map(d => d.restingHeartRate!)
  const avgRHRVal = avgRHR.length
    ? Math.round(avgRHR.reduce((a, b) => a + b, 0) / avgRHR.length)
    : null

  const cards: { label: string; value: string | number | null; unit?: string; view: AppView }[] = [
    { label: 'Пульс покоя (сегодня)', value: today?.restingHeartRate ? Math.round(today.restingHeartRate) : null, unit: 'уд/мин', view: 'heart-rate' },
    { label: 'Средний пульс покоя', value: avgRHRVal, unit: 'уд/мин', view: 'heart-rate' },
    { label: 'HRV (сегодня)', value: today?.hrv ? Math.round(today.hrv) : null, unit: 'мс', view: 'metrics' },
    { label: 'Сон (вчера)', value: daily.at(-2)?.sleepHours ? daily.at(-2)!.sleepHours!.toFixed(1) : null, unit: 'ч', view: 'sleep' },
    { label: 'Шаги (сегодня)', value: today?.steps ? Math.round(today.steps).toLocaleString() : null, view: 'metrics' },
    { label: 'Событий в календаре', value: events.length || null, view: 'stress-map' },
  ]

  return (
    <div className="dashboard">
      <h2>Дашборд</h2>
      <p className="dashboard-period">Данных за {totalDays} дней</p>

      <div className="cards-grid">
        {cards.map(c => (
          <button key={c.label} className="metric-card" onClick={() => onNavigate(c.view)}>
            <div className="card-label">{c.label}</div>
            <div className="card-value">
              {c.value !== null ? <>{c.value} <span className="card-unit">{c.unit}</span></> : '—'}
            </div>
          </button>
        ))}
      </div>

      {insights.length > 0 && (
        <div className="insights-preview">
          <h3>Инсайты</h3>
          {insights.map(i => (
            <div key={i.id} className="insight-item">
              <span className="insight-metric">{i.metric}</span>
              <p>{i.text}</p>
            </div>
          ))}
        </div>
      )}

      <nav className="dash-nav">
        <button onClick={() => onNavigate('heart-rate')}>Пульс за период →</button>
        <button onClick={() => onNavigate('metrics')}>Все показатели →</button>
        <button onClick={() => onNavigate('stress-map')}>Карта стресса →</button>
        <button onClick={() => onNavigate('sleep')}>Сон →</button>
        <button onClick={() => onNavigate('insights')}>Инсайты →</button>
      </nav>
    </div>
  )
}
