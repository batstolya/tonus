import type { User } from '@supabase/supabase-js'
import React, { useState, useEffect, useRef } from 'react'
import type { DailyMetrics, HeartRateSample, CalendarEvent } from '../../types'
import type { AppView } from '../../store/appStore'
import { generateInsights } from '../../utils/insights'
import { AiAnalysisBlock } from './AiAnalysisBlock'
import { computeReadiness, computeEarlyWarning } from '../../lib/readiness'
import { loadTodayNote, saveNote } from '../../lib/contextNotes'

interface Props {
  daily: DailyMetrics[]
  heartRateSamples: HeartRateSample[]
  events: CalendarEvent[]
  onNavigate: (view: AppView) => void
  user?: User
  quickLog?: React.ReactNode
}

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

function avgN(daily: DailyMetrics[], key: 'restingHeartRate' | 'hrv', days = 30): number | null {
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

// Color helpers
function rhrColor(v: number | null): string | undefined {
  if (v == null) return undefined
  if (v < 55) return 'var(--green)'
  if (v > 80) return 'var(--red)'
  return undefined
}
function hrvColor(v: number | null): string | undefined {
  if (v == null) return undefined
  if (v > 60) return 'var(--green)'
  if (v < 35) return 'var(--red)'
  return undefined
}
function stepsColor(v: number | null): string | undefined {
  if (v == null) return undefined
  if (v >= 8000) return 'var(--green)'
  if (v < 4000) return 'var(--red)'
  return undefined
}
function sleepColor(v: number | null): string | undefined {
  if (v == null) return undefined
  if (v >= 7) return 'var(--green)'
  if (v < 6) return 'var(--red)'
  return undefined
}
function spo2Color(v: number | null): string | undefined {
  if (v == null) return undefined
  if (v >= 98) return 'var(--green)'
  if (v < 95) return 'var(--red)'
  return undefined
}

function ReadinessCard({ daily }: { daily: DailyMetrics[] }) {
  const r = computeReadiness(daily)
  if (!r) return null

  return (
    <div className="readiness-card">
      <div className="readiness-top">
        <div className="readiness-left">
          <div className="readiness-label">Готовность дня</div>
          <div className="readiness-score" style={{ color: r.color }}>{r.score}</div>
          <div className="readiness-sublabel" style={{ color: r.color }}>{r.label}</div>
        </div>
        <div className="readiness-bars">
          {r.components.hrv != null && (
            <div className="r-bar-row">
              <span>HRV</span>
              <div className="r-bar-track"><div className="r-bar-fill" style={{ width: `${(r.components.hrv / 40) * 100}%`, background: r.color }} /></div>
            </div>
          )}
          {r.components.rhr != null && (
            <div className="r-bar-row">
              <span>ЧСС</span>
              <div className="r-bar-track"><div className="r-bar-fill" style={{ width: `${(r.components.rhr / 30) * 100}%`, background: r.color }} /></div>
            </div>
          )}
          {r.components.sleep != null && (
            <div className="r-bar-row">
              <span>Сон</span>
              <div className="r-bar-track"><div className="r-bar-fill" style={{ width: `${(r.components.sleep / 30) * 100}%`, background: r.color }} /></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StressDaysCard({ daily }: { daily: DailyMetrics[] }) {
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthDays = daily.filter(d => d.date >= monthStart && d.hrv != null)
  if (monthDays.length < 3) return null

  const sorted = [...monthDays].sort((a, b) => (a.hrv ?? 0) - (b.hrv ?? 0))
  const mostStressed = sorted[0]
  const leastStressed = sorted[sorted.length - 1]

  function fmtDate(d: string) {
    const dt = new Date(d + 'T00:00:00')
    return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="stress-days-card">
      <div className="sd-item sd-bad">
        <div className="sd-icon">😓</div>
        <div className="sd-info">
          <div className="sd-label">Самый стрессовый</div>
          <div className="sd-date">{fmtDate(mostStressed.date)}</div>
          <div className="sd-hrv">HRV {mostStressed.hrv} мс{mostStressed.restingHeartRate ? ` · ЧСС ${mostStressed.restingHeartRate}` : ''}</div>
        </div>
      </div>
      <div className="sd-divider" />
      <div className="sd-item sd-good">
        <div className="sd-icon">😌</div>
        <div className="sd-info">
          <div className="sd-label">Самый спокойный</div>
          <div className="sd-date">{fmtDate(leastStressed.date)}</div>
          <div className="sd-hrv">HRV {leastStressed.hrv} мс{leastStressed.restingHeartRate ? ` · ЧСС ${leastStressed.restingHeartRate}` : ''}</div>
        </div>
      </div>
    </div>
  )
}

function EarlyWarningBanner({ daily }: { daily: DailyMetrics[] }) {
  const w = computeEarlyWarning(daily)
  if (!w.active) return null
  return (
    <div className="early-warning">
      <span className="ew-icon">⚠</span>
      <div>
        <strong>Организм под нагрузкой</strong>
        <ul className="ew-list">
          {w.signals.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
        <span className="ew-hint">Возможно стоит снизить нагрузку или проверить самочувствие.</span>
      </div>
    </div>
  )
}

function ContextJournal({ user }: { user: User }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadTodayNote(user.id, todayStr).then(setNote)
  }, [user.id, todayStr])

  function handleChange(val: string) {
    setNote(val)
    setSaved(false)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      await saveNote(user.id, todayStr, val)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 800)
  }

  return (
    <div className="context-journal">
      <div className="cj-header">
        <span className="cj-label">Заметка дня</span>
        {saved && <span className="cj-saved">сохранено ✓</span>}
      </div>
      <textarea
        className="cj-textarea"
        placeholder="Как прошёл день? Важные события, самочувствие, стресс… (используется как контекст в ИИ-анализе)"
        value={note}
        onChange={e => handleChange(e.target.value)}
        rows={3}
      />
    </div>
  )
}

export function Dashboard({ daily, events, onNavigate, user, quickLog }: Props) {
  const insights = generateInsights(daily)
  const totalDays = daily.length

  const rhrToday = recentEntry(daily, 'restingHeartRate')
  const hrvToday = recentEntry(daily, 'hrv')
  const sleepEntry = recentEntry(daily, 'sleepHours')
  const stepsEntry = recentEntry(daily, 'steps')
  const spo2Entry = recentEntry(daily, 'oxygenSaturation')

  const avgRHR = avgN(daily, 'restingHeartRate')
  const avgHRV = avgN(daily, 'hrv')

  const recentSleep = recent(daily, 'sleepHours') as number | undefined
  const recentSteps = recent(daily, 'steps') as number | undefined

  const cards: { label: string; sub?: string; value: string | number | null; unit?: string; view: AppView; color?: string }[] = [
    {
      label: 'Пульс покоя',
      sub: rhrToday?.date,
      value: rhrToday?.restingHeartRate ? Math.round(rhrToday.restingHeartRate) : null,
      unit: 'уд/мин',
      view: 'heart-rate',
      color: rhrColor(rhrToday?.restingHeartRate ?? null),
    },
    {
      label: 'Средний ЧСС покоя',
      sub: 'за 30 дней',
      value: avgRHR,
      unit: 'уд/мин',
      view: 'heart-rate',
      color: rhrColor(avgRHR),
    },
    {
      label: 'HRV',
      sub: hrvToday?.date,
      value: hrvToday?.hrv ? Math.round(hrvToday.hrv) : null,
      unit: 'мс',
      view: 'metrics',
      color: hrvColor(hrvToday?.hrv ?? null),
    },
    {
      label: 'Средний HRV',
      sub: 'за 30 дней',
      value: avgHRV,
      unit: 'мс',
      view: 'metrics',
      color: hrvColor(avgHRV),
    },
    {
      label: 'Сон',
      sub: sleepEntry?.date,
      value: recentSleep != null ? recentSleep.toFixed(1) : null,
      unit: 'ч',
      view: 'sleep',
      color: sleepColor(recentSleep ?? null),
    },
    {
      label: 'Шаги',
      sub: stepsEntry?.date,
      value: recentSteps != null ? Math.round(recentSteps).toLocaleString('ru-RU') : null,
      view: 'activity',
      color: stepsColor(recentSteps ?? null),
    },
    {
      label: 'SpO₂',
      sub: spo2Entry?.date,
      value: spo2Entry?.oxygenSaturation ? (spo2Entry.oxygenSaturation * 100).toFixed(1) : null,
      unit: '%',
      view: 'metrics',
      color: spo2Color(spo2Entry?.oxygenSaturation ? spo2Entry.oxygenSaturation * 100 : null),
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

      <EarlyWarningBanner daily={daily} />
      <ReadinessCard daily={daily} />
      <StressDaysCard daily={daily} />

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
        {quickLog && <div className="metric-card quicklog-card" style={{ cursor: 'default' }}>{quickLog}</div>}
      </div>

      {user && <ContextJournal user={user} />}

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

      <nav className="dash-nav">
        <button onClick={() => onNavigate('heart-rate')}>Пульс →</button>
        <button onClick={() => onNavigate('metrics')}>Показатели →</button>
        <button onClick={() => onNavigate('stress-map')}>Стресс →</button>
        <button onClick={() => onNavigate('sleep')}>Сон →</button>
        <button onClick={() => onNavigate('insights')}>Инсайты →</button>
      </nav>

      {user && <AiAnalysisBlock daily={daily} userId={user.id} />}
    </div>
  )
}
