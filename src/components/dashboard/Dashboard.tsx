import type { User } from '@supabase/supabase-js'
import type { DailyMetrics, HeartRateSample, CalendarEvent } from '../../types'
import type { AppView } from '../../store/appStore'
import { generateInsights } from '../../utils/insights'
import { AiAnalysisBlock } from './AiAnalysisBlock'

interface Props {
  daily: DailyMetrics[]
  heartRateSamples: HeartRateSample[]
  events: CalendarEvent[]
  onNavigate: (view: AppView) => void
  user?: User
}

// Find most recent day that has a value for given key
function recent<K extends keyof DailyMetrics>(daily: DailyMetrics[], key: K): DailyMetrics[K] | undefined {
  for (let i = daily.length - 1; i >= 0; i--) {
    const v = daily[i][key]
    if (v !== undefined && v !== null) return v
  }
  return undefined
}

function recentEntry(daily: DailyMetrics[], key: keyof DailyMetrics): DailyMetrics | undefined {
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i][key] !== undefined && daily[i][key] !== null) return daily[i]
  }
  return undefined
}

function avg(daily: DailyMetrics[], key: 'restingHeartRate' | 'hrv', days = 30): number | null {
  const slice = daily.slice(-days).filter(d => d[key] != null)
  if (!slice.length) return null
  return Math.round(slice.reduce((a, d) => a + (d[key] as number), 0) / slice.length)
}

function greeting(user: User): string {
  const name = user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'привет'
  const h = new Date().getHours()
  const time = h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'
  return `${time}, ${name}`
}

export function Dashboard({ daily, events, onNavigate, user }: Props) {
  const insights = generateInsights(daily)
  const totalDays = daily.length

  const rhrToday = recentEntry(daily, 'restingHeartRate')
  const hrvToday = recentEntry(daily, 'hrv')
  const sleepEntry = recentEntry(daily, 'sleepHours')
  const stepsEntry = recentEntry(daily, 'steps')

  const avgRHR = avg(daily, 'restingHeartRate')
  const avgHRV = avg(daily, 'hrv')

  const recentSleep = recent(daily, 'sleepHours')
  const recentSteps = recent(daily, 'steps')

  const cards: { label: string; sub?: string; value: string | number | null; unit?: string; view: AppView; color?: string }[] = [
    {
      label: 'Пульс покоя',
      sub: rhrToday ? rhrToday.date : undefined,
      value: rhrToday?.restingHeartRate ? Math.round(rhrToday.restingHeartRate) : null,
      unit: 'уд/мин',
      view: 'heart-rate',
    },
    {
      label: 'Средний ЧСС покоя',
      sub: 'за 30 дней',
      value: avgRHR,
      unit: 'уд/мин',
      view: 'heart-rate',
    },
    {
      label: 'HRV',
      sub: hrvToday ? hrvToday.date : undefined,
      value: hrvToday?.hrv ? Math.round(hrvToday.hrv) : null,
      unit: 'мс',
      view: 'metrics',
    },
    {
      label: 'Средний HRV',
      sub: 'за 30 дней',
      value: avgHRV,
      unit: 'мс',
      view: 'metrics',
      color: avgHRV && avgHRV > 50 ? 'var(--green)' : undefined,
    },
    {
      label: 'Сон',
      sub: sleepEntry ? sleepEntry.date : undefined,
      value: recentSleep ? recentSleep.toFixed(1) : null,
      unit: 'ч',
      view: 'sleep',
      color: recentSleep && recentSleep >= 7 ? 'var(--green)' : recentSleep && recentSleep < 6 ? 'var(--red)' : undefined,
    },
    {
      label: 'Шаги',
      sub: stepsEntry ? stepsEntry.date : undefined,
      value: recentSteps ? Math.round(recentSteps).toLocaleString('ru-RU') : null,
      view: 'activity',
    },
    {
      label: 'Событий в календаре',
      value: events.length || null,
      view: 'stress-map',
    },
    {
      label: 'Дней данных',
      value: totalDays,
      view: 'metrics',
    },
  ]

  return (
    <div className="dashboard">
      {user && <p className="dashboard-greeting">{greeting(user)}</p>}
      <h2>Дашборд</h2>

      <div className="cards-grid">
        {cards.map(c => (
          <button key={c.label} className="metric-card" onClick={() => onNavigate(c.view)}>
            <div className="card-label">{c.label}</div>
            {c.sub && <div className="card-sub">{c.sub}</div>}
            <div className="card-value" style={c.color ? { color: c.color } : undefined}>
              {c.value !== null ? <>{c.value} <span className="card-unit">{c.unit}</span></> : <span className="card-empty">—</span>}
            </div>
          </button>
        ))}
      </div>

      {insights.length > 0 && (
        <div className="insights-preview">
          <h3>Инсайты</h3>
          {insights.slice(0, 3).map(i => (
            <div key={i.id} className="insight-item">
              <span className="insight-metric">{i.metric}</span>
              <p>{i.text}</p>
            </div>
          ))}
        </div>
      )}

      {user && <AiAnalysisBlock daily={daily} userId={user.id} />}

      <nav className="dash-nav">
        <button onClick={() => onNavigate('heart-rate')}>Пульс →</button>
        <button onClick={() => onNavigate('metrics')}>Показатели →</button>
        <button onClick={() => onNavigate('stress-map')}>Стресс →</button>
        <button onClick={() => onNavigate('sleep')}>Сон →</button>
        <button onClick={() => onNavigate('insights')}>Инсайты →</button>
      </nav>
    </div>
  )
}
