import type { User } from '@supabase/supabase-js'
import React, { useState, useEffect, useRef } from 'react'
import type { DailyMetrics, HeartRateSample, CalendarEvent } from '../../types'
import type { AppView } from '../../store/appStore'
import { generateInsights } from '../../utils/insights'
import { AiAnalysisBlock } from './AiAnalysisBlock'
import { DataGaps } from '../ui/DataGaps'
import { computeReadiness, computeEarlyWarning } from '../../lib/readiness'
import { baselineDeviations } from '../../lib/scores'
import { loadTodayNote, saveNote } from '../../lib/contextNotes'
import { loadFocus, loadCheckins, checkInToday, removeCheckinToday, type CoachFocus } from '../../lib/coach'
import { useT } from '../../lib/i18n'

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

function greeting(user: User, t: (s: string) => string): string {
  const name = user.user_metadata?.name ?? user.email?.split('@')[0] ?? t('привет')
  const h = new Date().getHours()
  const time = h < 12 ? t('Доброе утро') : h < 18 ? t('Добрый день') : t('Добрый вечер')
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
  const { t } = useT()
  const r = computeReadiness(daily)
  if (!r) return null

  const devs = baselineDeviations(daily)
  const labels: Record<string, string> = { hrv: 'HRV', rhr: t('Пульс покоя'), sleep: t('Сон'), steps: t('Шаги') }
  // для HRV/сна/шагов рост = хорошо (зелёный), для пульса покоя рост = плохо (красный)
  const goodUp: Record<string, boolean> = { hrv: true, sleep: true, steps: true, rhr: false }

  return (
    <div className="readiness-card">
      <div className="readiness-top">
        <div className="readiness-left">
          <div className="readiness-label">{t('Готовность дня')}</div>
          <div className="readiness-score" style={{ color: r.color }}>{r.score}</div>
          <div className="readiness-sublabel" style={{ color: r.color }}>{t(r.label)}</div>
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
              <span>{t('ЧСС')}</span>
              <div className="r-bar-track"><div className="r-bar-fill" style={{ width: `${(r.components.rhr / 30) * 100}%`, background: r.color }} /></div>
            </div>
          )}
          {r.components.sleep != null && (
            <div className="r-bar-row">
              <span>{t('Сон')}</span>
              <div className="r-bar-track"><div className="r-bar-fill" style={{ width: `${(r.components.sleep / 30) * 100}%`, background: r.color }} /></div>
            </div>
          )}
        </div>
      </div>
      {devs.length > 0 && (
        <div className="readiness-baseline">
          <div className="readiness-baseline-title">{t('Относительно вашей нормы (30 дней)')}</div>
          <div className="readiness-baseline-row">
            {devs.filter(d => Math.abs(d.pct) >= 5).map(d => {
              const positive = goodUp[d.metric] ? d.pct > 0 : d.pct < 0
              const color = positive ? 'var(--green)' : 'var(--red)'
              return (
                <span key={d.metric} className="readiness-dev" style={{ color }}>
                  {labels[d.metric]} {d.pct > 0 ? '+' : ''}{d.pct}%
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StressDaysCard({ daily }: { daily: DailyMetrics[] }) {
  const { t, lang } = useT()
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthDays = daily.filter(d => d.date >= monthStart && d.hrv != null)
  if (monthDays.length < 3) return null

  const sorted = [...monthDays].sort((a, b) => (a.hrv ?? 0) - (b.hrv ?? 0))
  const mostStressed = sorted[0]
  const leastStressed = sorted[sorted.length - 1]

  const locale = lang === 'en' ? 'en-GB' : lang === 'uk' ? 'uk-UA' : 'ru-RU'
  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  }

  return (
    <div className="stress-days-card">
      <div className="sd-item sd-bad">
        <div className="sd-icon">😓</div>
        <div className="sd-info">
          <div className="sd-label">{t('Самый стрессовый')}</div>
          <div className="sd-date">{fmtDate(mostStressed.date)}</div>
          <div className="sd-hrv">HRV {mostStressed.hrv!.toFixed(0)} {t('мс')}{mostStressed.restingHeartRate ? ` · ${t('ЧСС')} ${Math.round(mostStressed.restingHeartRate)}` : ''}</div>
        </div>
      </div>
      <div className="sd-divider" />
      <div className="sd-item sd-good">
        <div className="sd-icon">😌</div>
        <div className="sd-info">
          <div className="sd-label">{t('Самый спокойный')}</div>
          <div className="sd-date">{fmtDate(leastStressed.date)}</div>
          <div className="sd-hrv">HRV {leastStressed.hrv!.toFixed(0)} {t('мс')}{leastStressed.restingHeartRate ? ` · ${t('ЧСС')} ${Math.round(leastStressed.restingHeartRate)}` : ''}</div>
        </div>
      </div>
    </div>
  )
}

function EarlyWarningBanner({ daily }: { daily: DailyMetrics[] }) {
  const { t } = useT()
  const w = computeEarlyWarning(daily)
  if (!w.active) return null
  return (
    <div className="early-warning">
      <span className="ew-icon">⚠</span>
      <div>
        <strong>{t('Организм под нагрузкой')}</strong>
        <ul className="ew-list">
          {w.signals.map((s, i) => <li key={i}>{t(s.key, s.vars)}</li>)}
        </ul>
        <span className="ew-hint">{t('Возможно стоит снизить нагрузку или проверить самочувствие.')}</span>
      </div>
    </div>
  )
}

function CoachFocusCard({ user }: { user: User }) {
  const { t } = useT()
  const [focus, setFocus] = useState<CoachFocus | null>(null)
  const [checkins, setCheckins] = useState<string[]>([])
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    loadFocus(user.id).then(f => {
      setFocus(f)
      if (f) loadCheckins(user.id, f.set_at).then(setCheckins)
    })
  }, [user.id])

  if (!focus) return null
  const doneToday = checkins.includes(today)

  async function toggle() {
    if (doneToday) {
      setCheckins(c => c.filter(d => d !== today))
      await removeCheckinToday(user.id)
    } else {
      setCheckins(c => [today, ...c])
      await checkInToday(user.id)
    }
  }

  return (
    <div className="coach-focus-card">
      <div className="coach-focus-head">
        <span className="coach-focus-label">🎯 {t('Фокус недели')}</span>
        <span className="coach-focus-count">{checkins.length} {t('из 7 дней')}</span>
      </div>
      <div className="coach-focus-text">{focus.text}</div>
      <button className={`coach-focus-btn${doneToday ? ' done' : ''}`} onClick={toggle}>
        {doneToday ? `✓ ${t('Сегодня держусь')}` : t('Отметить сегодня')}
      </button>
    </div>
  )
}

function ContextJournal({ user }: { user: User }) {
  const { t } = useT()
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
        <span className="cj-label">{t('Заметка дня')}</span>
        {saved && <span className="cj-saved">{t('сохранено')} ✓</span>}
      </div>
      <textarea
        className="cj-textarea"
        placeholder={t('Как прошёл день? Важные события, самочувствие, стресс… (используется как контекст в ИИ-анализе)')}
        value={note}
        onChange={e => handleChange(e.target.value)}
        rows={3}
      />
    </div>
  )
}

export function Dashboard({ daily, events, onNavigate, user, quickLog }: Props) {
  const { t } = useT()
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
      {user && <p className="dashboard-greeting">{greeting(user, t)}</p>}
      <h2>{t('Дашборд')}</h2>

      <EarlyWarningBanner daily={daily} />
      {user && <CoachFocusCard user={user} />}
      <ReadinessCard daily={daily} />
      <StressDaysCard daily={daily} />

      <div className="cards-grid">
        {cards.map(c => (
          <button key={c.label} className="metric-card" onClick={() => onNavigate(c.view)}>
            <div className="card-label">{t(c.label)}</div>
            {c.sub && <div className="card-sub">{t(c.sub)}</div>}
            <div className="card-value" style={c.color ? { color: c.color } : undefined}>
              {c.value !== null ? <>{c.value} <span className="card-unit">{c.unit ? t(c.unit) : ''}</span></> : <span className="card-empty">—</span>}
            </div>
          </button>
        ))}
        {quickLog && <div className="metric-card quicklog-card" style={{ cursor: 'default' }}>{quickLog}</div>}
      </div>

      <nav className="dash-nav">
        <button onClick={() => onNavigate('heart-rate')}>{t('Пульс')} →</button>
        <button onClick={() => onNavigate('metrics')}>{t('Показатели')} →</button>
        <button onClick={() => onNavigate('stress-map')}>{t('Стресс')} →</button>
        <button onClick={() => onNavigate('sleep')}>{t('Сон')} →</button>
        <button onClick={() => onNavigate('insights')}>{t('Инсайты')} →</button>
      </nav>

      {user && <ContextJournal user={user} />}

      {insights.length > 0 && (
        <div className="insights-preview">
          <h3>{t('Инсайты')}</h3>
          {insights.slice(0, 3).map(i => (
            <div key={i.id} className="insight-item">
              <span className="insight-metric">{i.metric}</span>
              <p>{i.text}</p>
            </div>
          ))}
        </div>
      )}

      <DataGaps daily={daily} days={14} />
      {user && <AiAnalysisBlock daily={daily} userId={user.id} />}
    </div>
  )
}
