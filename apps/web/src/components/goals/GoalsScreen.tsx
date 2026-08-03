import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import type { DailyMetrics } from '../../types'
import { useT } from '../../lib/i18n'
import { Icon, type IconName } from '../../lib/icons'
import {
  loadGoals, createGoal, updateGoalStatus, deleteGoal, finalizeExpiredGoals,
  loadRecommendations, updateRecommendationStatus,
  computeBaseline, computeProgress,
  METRIC_CONFIG,
  type Goal, type Recommendation,
} from '../../lib/goals'
import { callFunction } from '../../lib/edgeFunctions'
import { LoadError } from '../ui/LoadError'
import { startEffect } from '../../lib/startEffect'

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
  behind: 'var(--warn)',
  no_data: 'var(--text-muted)',
}

// 'stable' stays a literal '→': it's not in Extended_Pictographic (unlike its
// diagonal siblings below) so it never needed a registry entry.
const TREND_ICON: Record<'improving' | 'worsening', IconName> = {
  improving: 'arrowUpRight',
  worsening: 'arrowDownRight',
}

const DURATION_OPTIONS = [
  { label: '1 неделя', days: 7 },
  { label: '2 недели', days: 14 },
  { label: '4 недели', days: 28 },
]

type T = (ru: string, vars?: Record<string, string | number>) => string

// Единица метрики хранится по-русски (это ключ словаря) — переводим на месте.
function fmtVal(val: number, metric: string, t: T): string {
  const cfg = METRIC_CONFIG[metric]
  if (!cfg) return String(val)
  return `${val.toFixed(cfg.decimals ?? 0)} ${t(cfg.unit)}`
}

function endDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function GoalsScreen({ user, daily }: Props) {
  const { t } = useT()
  const [goals, setGoals] = useState<Goal[]>([])
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [showForm, setShowForm] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)

  // Form state
  const [fMetric, setFMetric] = useState('sleep_hours')
  const [fTarget, setFTarget] = useState('')
  const [fDays, setFDays] = useState(14)
  const [fTitle, setFTitle] = useState<string | null>(null) // null — заголовок по метрике
  const [fSaving, setFSaving] = useState(false)

  const baseline = computeBaseline(daily, fMetric)
  const cfg = METRIC_CONFIG[fMetric]

  const [loadError, setLoadError] = useState(false)
  const reload = useCallback(async () => {
    try {
      const [g, r] = await Promise.all([loadGoals(user.id), loadRecommendations(user.id)])
      setGoals(await finalizeExpiredGoals(g, daily))
      setRecs(r)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [user.id, daily])

  useEffect(() => { startEffect(reload) }, [reload])

  // Пока юзер не тронул поле, заголовок = название метрики (на языке интерфейса).
  const title = fTitle ?? (cfg ? t(cfg.label) : '')

  async function handleCreate() {
    const tv = parseFloat(fTarget)
    if (isNaN(tv) || !title.trim()) return
    setFSaving(true)
    const cfg = METRIC_CONFIG[fMetric]
    await createGoal(user.id, {
      metric: fMetric,
      title: title.trim(),
      baseline_value: baseline,
      target_value: tv,
      direction: cfg?.direction ?? 'up',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: endDate(fDays),
      status: 'active',
      recommendation_id: null,
      step_size: null,
    })
    setFTarget(''); setFTitle(null); setShowForm(false)
    await reload()
    setFSaving(false)
  }

  async function handleAcceptRec(rec: Recommendation) {
    if (!rec.suggested_target) return
    const cfg = METRIC_CONFIG[rec.metric]
    if (!cfg) return
    await createGoal(user.id, {
      metric: rec.metric,
      title: t(cfg.label),
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
      const { count } = await callFunction<{ count: number }>('generate-recommendations')
      setGenMsg(t('Получено {n} рекомендаций', { n: count }))
      await reload()
    } catch (e) {
      setGenMsg(`${t('Ошибка')}: ${(e as Error).message}`)
    }
    setGenLoading(false)
  }

  const activeGoals = goals.filter(g => g.status === 'active')
  const finishedGoals = goals.filter(g => g.status === 'achieved' || g.status === 'failed')

  return (
    <div className="screen">
      {/* Header */}
      <div className="goals-header">
        <h2>{t('Цели и прогресс')}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={handleGenerate} disabled={genLoading}>
            {genLoading ? <><Icon name="pending" size={14} /> {t('Анализ…')}</> : <><Icon name="magic" size={14} /> {t('Предложить ИИ')}</>}
          </button>
          <button className="btn-primary" onClick={() => setShowForm(s => !s)}>
            {showForm ? t('Отмена') : `+ ${t('Цель')}`}
          </button>
        </div>
      </div>
      {genMsg && <div style={{ fontSize: 13, color: genMsg.startsWith('Ошибка') ? 'var(--red)' : 'var(--green)', marginBottom: 12 }}>{genMsg}</div>}
      {loadError && <LoadError onRetry={reload} />}

      {/* Create form */}
      {showForm && (
        <div className="goals-form">
          <div className="goals-form-row">
            <div className="goals-form-field">
              <label className="settings-label">{t('Показатель')}</label>
              <select className="log-input" value={fMetric}
                onChange={e => { setFMetric(e.target.value); setFTitle(null) }}>
                {Object.entries(METRIC_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{t(v.label)}</option>
                ))}
              </select>
            </div>
            <div className="goals-form-field">
              <label className="settings-label">{t('Название цели')}</label>
              <input className="log-input" value={title} onChange={e => setFTitle(e.target.value)} placeholder={t('Например: Улучшить сон')} />
            </div>
          </div>
          <div className="goals-form-row">
            <div className="goals-form-field">
              <label className="settings-label">
                {t('Целевое значение')} {cfg ? `(${t(cfg.unit)})` : ''}
                {baseline !== null && <span className="goals-baseline-hint"> — {t('текущая база:')} {fmtVal(baseline, fMetric, t)}</span>}
              </label>
              <input className="log-input" type="number" step="0.1" value={fTarget}
                onChange={e => setFTarget(e.target.value)} placeholder={baseline !== null ? String(Math.round(baseline * 10) / 10) : '0'} />
            </div>
            <div className="goals-form-field">
              <label className="settings-label">{t('Срок')}</label>
              <div className="goals-duration-tabs">
                {DURATION_OPTIONS.map(o => (
                  <button key={o.days} className={`goals-dur-btn${fDays === o.days ? ' active' : ''}`}
                    onClick={() => setFDays(o.days)}>{t(o.label)}</button>
                ))}
              </div>
            </div>
          </div>
          <button className="btn-primary" onClick={handleCreate} disabled={fSaving || !fTarget || !title.trim()}>
            {fSaving ? t('Сохраняем…') : t('Создать цель')}
          </button>
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="goals-recs-section">
          <h3 className="goals-section-title"><Icon name="idea" size={16} /> {t('Рекомендации ИИ')}</h3>
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
                    {t('Сделать целью')}
                  </button>
                )}
                <button className="btn-ghost" style={{ fontSize: 13 }}
                  onClick={() => { updateRecommendationStatus(rec.id, 'snoozed'); setRecs(r => r.filter(x => x.id !== rec.id)) }}>
                  {t('Позже')}
                </button>
                <button className="btn-ghost" style={{ fontSize: 13, color: 'var(--text-muted)' }}
                  onClick={() => { updateRecommendationStatus(rec.id, 'dismissed'); setRecs(r => r.filter(x => x.id !== rec.id)) }}>
                  {t('Скрыть')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active goals */}
      {activeGoals.length === 0 && !showForm && recs.length === 0 && (
        <div className="goals-empty">
          <p>{t('Целей пока нет.')}</p>
          <p>{t('Нажми')} <b>+ {t('Цель')}</b> {t('чтобы создать вручную или')} <b><Icon name="magic" size={14} /> {t('Предложить ИИ')}</b> {t('для автоматических рекомендаций.')}</p>
        </div>
      )}

      {activeGoals.length > 0 && (
        <>
          <h3 className="goals-section-title">{t('Активные цели')}</h3>
          <div className="goals-list">
            {activeGoals.map(goal => {
              const prog = computeProgress(goal, daily)
              const color = STATUS_COLOR[prog.status]
              const cfg = METRIC_CONFIG[goal.metric]
              const daysLeft = Math.max(0, Math.ceil((new Date(goal.end_date).getTime() - new Date().getTime()) / 86400000))

              return (
                <div key={goal.id} className="goal-card">
                  <div className="goal-card-left">
                    <ProgressRing pct={prog.pct} color={color} />
                  </div>
                  <div className="goal-card-body">
                    <div className="goal-card-title">
                      {goal.title}
                      {prog.trend && (
                        <span className="goal-trend" title={prog.trend}>
                          {prog.trend === 'stable' ? '→' : <Icon name={TREND_ICON[prog.trend]} size={12} />}
                        </span>
                      )}
                    </div>
                    <div className="goal-card-meta">
                      {cfg && goal.baseline_value !== null &&
                        <span>{t('База:')} {fmtVal(goal.baseline_value, goal.metric, t)}</span>}
                      {cfg && <span>{t('Цель:')} {fmtVal(goal.target_value, goal.metric, t)}</span>}
                      {prog.currentAvg !== null && cfg &&
                        <span>{t('Сейчас:')} <b>{fmtVal(prog.currentAvg, goal.metric, t)}</b></span>}
                    </div>
                    <div className="goal-card-stat">
                      <span style={{ color }}>
                        {t('{a} из {b} дн. в цели', { a: prog.daysOnTarget, b: prog.daysWithData })}
                      </span>
                      <span className="goals-days-left">{daysLeft > 0 ? t('ещё {n} дн.', { n: daysLeft }) : t('срок истёк')}</span>
                    </div>
                  </div>
                  <div className="goal-card-actions">
                    <button className="supp-delete" title={t('Пауза')}
                      onClick={() => { updateGoalStatus(goal.id, 'paused'); setGoals(g => g.filter(x => x.id !== goal.id)) }}>
                      <Icon name="pause" size={13} title={t('Пауза')} />
                    </button>
                    <button className="supp-delete" title={t('Удалить')}
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

      {finishedGoals.length > 0 && (
        <>
          <h3 className="goals-section-title">{t('Завершённые')}</h3>
          <div className="goals-list">
            {finishedGoals.map(goal => {
              const prog = computeProgress(goal, daily)
              const achieved = goal.status === 'achieved'
              return (
                <div key={goal.id} className="goal-card goal-card-finished">
                  <div className="goal-card-left" style={{ width: 52, textAlign: 'center' }}>
                    {achieved
                      ? <span style={{ color: 'var(--warn)' }}><Icon name="trophy" size={26} /></span>
                      : <span aria-hidden style={{ fontSize: 26 }}>✕</span>}
                  </div>
                  <div className="goal-card-body">
                    <div className="goal-card-title">{goal.title}</div>
                    <div className="goal-card-meta">
                      <span>{t('Цель:')} {fmtVal(goal.target_value, goal.metric, t)}</span>
                      {prog.currentAvg !== null &&
                        <span>{t('Итог:')} <b>{fmtVal(prog.currentAvg, goal.metric, t)}</b></span>}
                      <span>{goal.start_date} — {goal.end_date}</span>
                    </div>
                    <div className="goal-card-stat">
                      <span style={{ color: achieved ? 'var(--green)' : 'var(--text-muted)' }}>
                        {achieved ? t('Достигнута') : t('Не достигнута')}
                      </span>
                    </div>
                  </div>
                  <div className="goal-card-actions">
                    <button className="supp-delete" title={t('Удалить')}
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
