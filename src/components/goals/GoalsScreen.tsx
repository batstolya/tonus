import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import type { DailyMetrics } from '../../types'
import {
  loadGoals, createGoal, updateGoalStatus, deleteGoal,
  loadRecommendations, updateRecommendationStatus,
  computeBaseline, computeProgress,
  METRIC_CONFIG,
  type Goal, type Recommendation,
} from '../../lib/goals'
import { supabase } from '../../lib/supabase'

interface Props {
  user: User
  daily: DailyMetrics[]
}

function ProgressRing({ pct, size = 52, color }: { pct: number; size?: number; color: string }) {
  const r = (size - 7) / 2
  const circ = 2 * Math.PI * r
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="5.5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5.5"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(pct, 100) / 100)}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">
        {pct}%
      </text>
    </svg>
  )
}

const STATUS_COLOR: Record<string, string> = {
  on_track: 'var(--green)',
  achieved: 'var(--green)',
  behind: '#f59e0b',
  no_data: 'var(--text-muted)',
}

const TREND_ICON: Record<string, string> = {
  improving: '↗',
  stable: '→',
  worsening: '↘',
}

const DURATION_OPTIONS = [
  { label: '1 неделя', days: 7 },
  { label: '2 недели', days: 14 },
  { label: '4 недели', days: 28 },
]

function fmtVal(val: number, metric: string): string {
  const cfg = METRIC_CONFIG[metric]
  if (!cfg) return String(val)
  return `${val.toFixed(cfg.decimals ?? 0)} ${cfg.unit}`
}

function endDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function GoalsScreen({ user, daily }: Props) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [showForm, setShowForm] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)

  // Form state
  const [fMetric, setFMetric] = useState('sleep_hours')
  const [fTarget, setFTarget] = useState('')
  const [fDays, setFDays] = useState(14)
  const [fTitle, setFTitle] = useState('')
  const [fSaving, setFSaving] = useState(false)

  const baseline = computeBaseline(daily, fMetric)
  const cfg = METRIC_CONFIG[fMetric]

  const reload = useCallback(async () => {
    const [g, r] = await Promise.all([loadGoals(user.id), loadRecommendations(user.id)])
    setGoals(g)
    setRecs(r)
  }, [user.id])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (fMetric && METRIC_CONFIG[fMetric]) {
      setFTitle(METRIC_CONFIG[fMetric].label)
    }
  }, [fMetric])

  async function handleCreate() {
    const tv = parseFloat(fTarget)
    if (isNaN(tv) || !fTitle.trim()) return
    setFSaving(true)
    const cfg = METRIC_CONFIG[fMetric]
    await createGoal(user.id, {
      metric: fMetric,
      title: fTitle.trim(),
      baseline_value: baseline,
      target_value: tv,
      direction: cfg?.direction ?? 'up',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: endDate(fDays),
      status: 'active',
      recommendation_id: null,
      step_size: null,
    })
    setFTarget(''); setFTitle(''); setShowForm(false)
    await reload()
    setFSaving(false)
  }

  async function handleAcceptRec(rec: Recommendation) {
    if (!rec.suggested_target) return
    const cfg = METRIC_CONFIG[rec.metric]
    if (!cfg) return
    await createGoal(user.id, {
      metric: rec.metric,
      title: cfg.label,
      baseline_value: computeBaseline(daily, rec.metric),
      target_value: rec.suggested_target,
      direction: cfg.direction,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: endDate(14),
      status: 'active',
      recommendation_id: rec.id,
      step_size: null,
    })
    await updateRecommendationStatus(rec.id, 'accepted')
    await reload()
  }

  async function handleGenerate() {
    setGenLoading(true)
    setGenMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const url = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${url}/functions/v1/generate-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session!.access_token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      const { count } = await res.json()
      setGenMsg(`Получено ${count} рекомендаций`)
      await reload()
    } catch (e: any) {
      setGenMsg(`Ошибка: ${e.message}`)
    }
    setGenLoading(false)
  }

  const activeGoals = goals.filter(g => g.status === 'active')

  return (
    <div className="screen">
      {/* Header */}
      <div className="goals-header">
        <h2>Цели и прогресс</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={handleGenerate} disabled={genLoading}>
            {genLoading ? '⏳ Анализ…' : '✨ Предложить ИИ'}
          </button>
          <button className="btn-primary" onClick={() => setShowForm(s => !s)}>
            {showForm ? 'Отмена' : '+ Цель'}
          </button>
        </div>
      </div>
      {genMsg && <div style={{ fontSize: 13, color: genMsg.startsWith('Ошибка') ? 'var(--red)' : 'var(--green)', marginBottom: 12 }}>{genMsg}</div>}

      {/* Create form */}
      {showForm && (
        <div className="goals-form">
          <div className="goals-form-row">
            <div className="goals-form-field">
              <label className="settings-label">Показатель</label>
              <select className="log-input" value={fMetric} onChange={e => setFMetric(e.target.value)}>
                {Object.entries(METRIC_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="goals-form-field">
              <label className="settings-label">Название цели</label>
              <input className="log-input" value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="Например: Улучшить сон" />
            </div>
          </div>
          <div className="goals-form-row">
            <div className="goals-form-field">
              <label className="settings-label">
                Целевое значение {cfg ? `(${cfg.unit})` : ''}
                {baseline !== null && <span className="goals-baseline-hint"> — текущая база: {fmtVal(baseline, fMetric)}</span>}
              </label>
              <input className="log-input" type="number" step="0.1" value={fTarget}
                onChange={e => setFTarget(e.target.value)} placeholder={baseline !== null ? String(Math.round(baseline * 10) / 10) : '0'} />
            </div>
            <div className="goals-form-field">
              <label className="settings-label">Срок</label>
              <div className="goals-duration-tabs">
                {DURATION_OPTIONS.map(o => (
                  <button key={o.days} className={`goals-dur-btn${fDays === o.days ? ' active' : ''}`}
                    onClick={() => setFDays(o.days)}>{o.label}</button>
                ))}
              </div>
            </div>
          </div>
          <button className="btn-primary" onClick={handleCreate} disabled={fSaving || !fTarget || !fTitle.trim()}>
            {fSaving ? 'Сохраняем…' : 'Создать цель'}
          </button>
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="goals-recs-section">
          <h3 className="goals-section-title">💡 Рекомендации ИИ</h3>
          {recs.map(rec => (
            <div key={rec.id} className="goal-rec-card">
              <div className="goal-rec-body">
                <div className="goal-rec-text">{rec.text}</div>
                {rec.rationale && <div className="goal-rec-rationale">{rec.rationale}</div>}
              </div>
              <div className="goal-rec-actions">
                {rec.suggested_target && METRIC_CONFIG[rec.metric] && (
                  <button className="btn-primary" style={{ fontSize: 13, padding: '6px 14px' }}
                    onClick={() => handleAcceptRec(rec)}>
                    Сделать целью
                  </button>
                )}
                <button className="btn-ghost" style={{ fontSize: 13 }}
                  onClick={() => { updateRecommendationStatus(rec.id, 'snoozed'); setRecs(r => r.filter(x => x.id !== rec.id)) }}>
                  Позже
                </button>
                <button className="btn-ghost" style={{ fontSize: 13, color: 'var(--text-muted)' }}
                  onClick={() => { updateRecommendationStatus(rec.id, 'dismissed'); setRecs(r => r.filter(x => x.id !== rec.id)) }}>
                  Скрыть
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active goals */}
      {activeGoals.length === 0 && !showForm && recs.length === 0 && (
        <div className="goals-empty">
          <p>Целей пока нет.</p>
          <p>Нажми <b>+ Цель</b> чтобы создать вручную или <b>✨ Предложить ИИ</b> для автоматических рекомендаций.</p>
        </div>
      )}

      {activeGoals.length > 0 && (
        <>
          <h3 className="goals-section-title">Активные цели</h3>
          <div className="goals-list">
            {activeGoals.map(goal => {
              const prog = computeProgress(goal, daily)
              const color = STATUS_COLOR[prog.status]
              const cfg = METRIC_CONFIG[goal.metric]
              const daysLeft = Math.max(0, Math.ceil((new Date(goal.end_date).getTime() - Date.now()) / 86400000))

              return (
                <div key={goal.id} className="goal-card">
                  <div className="goal-card-left">
                    <ProgressRing pct={prog.pct} color={color} />
                  </div>
                  <div className="goal-card-body">
                    <div className="goal-card-title">
                      {goal.title}
                      {prog.trend && <span className="goal-trend" title={prog.trend}>{TREND_ICON[prog.trend]}</span>}
                    </div>
                    <div className="goal-card-meta">
                      {cfg && goal.baseline_value !== null &&
                        <span>База: {fmtVal(goal.baseline_value, goal.metric)}</span>}
                      {cfg && <span>Цель: {fmtVal(goal.target_value, goal.metric)}</span>}
                      {prog.currentAvg !== null && cfg &&
                        <span>Сейчас: <b>{fmtVal(prog.currentAvg, goal.metric)}</b></span>}
                    </div>
                    <div className="goal-card-stat">
                      <span style={{ color }}>
                        {prog.daysOnTarget} из {prog.daysWithData} дн. в цели
                      </span>
                      <span className="goals-days-left">{daysLeft > 0 ? `ещё ${daysLeft} дн.` : 'срок истёк'}</span>
                    </div>
                  </div>
                  <div className="goal-card-actions">
                    <button className="supp-delete" title="Пауза"
                      onClick={() => { updateGoalStatus(goal.id, 'paused'); setGoals(g => g.filter(x => x.id !== goal.id)) }}>
                      ⏸
                    </button>
                    <button className="supp-delete" title="Удалить"
                      onClick={() => { deleteGoal(goal.id); setGoals(g => g.filter(x => x.id !== goal.id)) }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
