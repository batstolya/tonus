import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { DailyMetrics } from '../../types'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/edgeFunctions'
import { useT } from '../../lib/i18n'

interface Props { user: User; daily: DailyMetrics[] }

interface Experiment {
  id: string
  hypothesis: string
  change_rule: string
  target_metric: string
  baseline_days: number
  baseline_start: string | null
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'cancelled'
  result: ExperimentResult | null
  ai_explanation: string | null
  created_at: string
}

interface ExperimentResult {
  baselineMean: number | null
  expMean: number | null
  delta: number | null
  deltaPct: number | null
  cohenD: number | null
  baselineN: number
  expN: number
  betterHigh: boolean
}

const METRIC_OPTIONS: { key: string; label: string; betterHigh: boolean }[] = [
  { key: 'hrv', label: 'HRV', betterHigh: true },
  { key: 'restingHeartRate', label: 'Пульс покоя', betterHigh: false },
  { key: 'sleepHours', label: 'Длительность сна', betterHigh: true },
  { key: 'sleepDeep', label: 'Глубокий сон', betterHigh: true },
  { key: 'sleepREM', label: 'REM сон', betterHigh: true },
  { key: 'steps', label: 'Шаги', betterHigh: true },
  { key: 'activeEnergy', label: 'Активные калории', betterHigh: true },
  { key: 'oxygenSaturation', label: 'SpO₂', betterHigh: true },
  { key: 'heartRate', label: 'ЧСС средняя', betterHigh: false },
]

function today() { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10)
}

function std(vals: number[]): number {
  if (vals.length < 2) return 0
  const m = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.sqrt(vals.reduce((s, x) => s + (x - m) ** 2, 0) / (vals.length - 1))
}
function mean(vals: number[]): number | null {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

function computeResult(daily: DailyMetrics[], exp: Experiment): ExperimentResult {
  const meta = METRIC_OPTIONS.find(m => m.key === exp.target_metric)
  const betterHigh = meta?.betterHigh ?? true

  const getValue = (d: DailyMetrics): number | null => {
    const key = exp.target_metric as keyof DailyMetrics
    const v = d[key]
    if (typeof v === 'number') return exp.target_metric === 'oxygenSaturation' ? v * 100 : v
    if (typeof v === 'object' && v !== null && 'avg' in v) return (v as any).avg
    return null
  }

  const baseStart = exp.baseline_start ?? daysAgo(exp.baseline_days + 7)
  const baselineVals = daily
    .filter(d => d.date >= baseStart && d.date < exp.start_date)
    .map(getValue).filter((v): v is number => v !== null)

  const expVals = daily
    .filter(d => d.date >= exp.start_date && d.date <= exp.end_date)
    .map(getValue).filter((v): v is number => v !== null)

  const bm = mean(baselineVals)
  const em = mean(expVals)
  const delta = bm !== null && em !== null ? em - bm : null
  const deltaPct = bm !== null && delta !== null && bm !== 0 ? (delta / bm) * 100 : null

  const pooledStd = (() => {
    const s1 = std(baselineVals), s2 = std(expVals)
    const n1 = baselineVals.length, n2 = expVals.length
    if (n1 < 2 || n2 < 2) return null
    return Math.sqrt(((n1 - 1) * s1 ** 2 + (n2 - 1) * s2 ** 2) / (n1 + n2 - 2))
  })()

  const cohenD = pooledStd && pooledStd > 0 && delta !== null ? delta / pooledStd : null

  return {
    baselineMean: bm !== null ? +bm.toFixed(1) : null,
    expMean: em !== null ? +em.toFixed(1) : null,
    delta: delta !== null ? +delta.toFixed(1) : null,
    deltaPct: deltaPct !== null ? +deltaPct.toFixed(1) : null,
    cohenD: cohenD !== null ? +cohenD.toFixed(2) : null,
    baselineN: baselineVals.length,
    expN: expVals.length,
    betterHigh,
  }
}

function effectLabel(d: number | null): string {
  if (d === null) return '—'
  const abs = Math.abs(d)
  if (abs >= 0.8) return 'сильный'
  if (abs >= 0.5) return 'средний'
  if (abs >= 0.2) return 'слабый'
  return 'нет эффекта'
}

function ResultBlock({ r }: { r: ExperimentResult; metric?: string }) {
  const { t } = useT()
  if (r.baselineMean === null || r.expMean === null) {
    return <p className="settings-muted">{t('Недостаточно данных для сравнения.')}</p>
  }
  const improved = r.delta !== null && ((r.betterHigh && r.delta > 0) || (!r.betterHigh && r.delta < 0))
  const color = improved ? 'var(--green)' : r.delta !== 0 ? 'var(--red)' : 'var(--text-muted)'
  const sign = r.delta !== null && r.delta > 0 ? '+' : ''

  return (
    <div className="exp-result">
      <div className="exp-result-row">
        <div className="exp-result-cell">
          <div className="exp-result-label">{t('До')}</div>
          <div className="exp-result-val">{r.baselineMean} <span className="exp-result-n">n={r.baselineN}</span></div>
        </div>
        <div className="exp-result-arrow" style={{ color }}>{improved ? '→ ↑' : '→ ↓'}</div>
        <div className="exp-result-cell">
          <div className="exp-result-label">{t('Во время')}</div>
          <div className="exp-result-val">{r.expMean} <span className="exp-result-n">n={r.expN}</span></div>
        </div>
        <div className="exp-result-cell">
          <div className="exp-result-label">{t('Изменение')}</div>
          <div className="exp-result-val" style={{ color }}>{sign}{r.delta} ({sign}{r.deltaPct}%)</div>
        </div>
      </div>
      {r.cohenD !== null && (
        <div className="exp-result-cohen">
          {t('Размер эффекта')}: <b>d = {r.cohenD}</b> — {t(effectLabel(r.cohenD))}
          {Math.abs(r.cohenD) < 0.2 && <span className="settings-muted"> ({t('вероятно случайность')})</span>}
        </div>
      )}
      <p className="exp-result-caveat">{t('Наблюдение, не доказательство. Другие факторы могут объяснять изменение.')}</p>
    </div>
  )
}

export function ExperimentsScreen({ user, daily }: Props) {
  const { t } = useT()
  const [exps, setExps] = useState<Experiment[]>([])
  const [showForm, setShowForm] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState<string | null>(null)

  const [form, setForm] = useState({
    hypothesis: '',
    change_rule: '',
    target_metric: 'hrv',
    baseline_days: 14,
    start_date: daysAgo(14),
    end_date: today(),
  })

  useEffect(() => {
    supabase.from('experiments').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => setExps((data ?? []) as Experiment[]))
  }, [user.id])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase.from('experiments').insert({
      user_id: user.id,
      hypothesis: form.hypothesis,
      change_rule: form.change_rule,
      target_metric: form.target_metric,
      baseline_days: form.baseline_days,
      baseline_start: daysAgo(form.baseline_days + Math.max(0, Math.ceil((new Date(form.start_date).getTime() - Date.now()) / 86400000) * -1 + form.baseline_days)),
      start_date: form.start_date,
      end_date: form.end_date,
      status: new Date(form.end_date) <= new Date() ? 'completed' : 'active',
    }).select().single()
    if (!error && data) {
      setExps(prev => [data as Experiment, ...prev])
      setActiveId(data.id)
      setShowForm(false)
    }
  }

  async function handleAI(exp: Experiment) {
    const result = computeResult(daily, exp)
    setAiLoading(exp.id)
    try {
      const metaLabel = METRIC_OPTIONS.find(m => m.key === exp.target_metric)?.label ?? exp.target_metric
      const prompt = `Эксперимент: "${exp.hypothesis}". Изменение: "${exp.change_rule}". Метрика: ${metaLabel}. До: ${result.baselineMean} (n=${result.baselineN}). Во время: ${result.expMean} (n=${result.expN}). Дельта: ${result.delta} (${result.deltaPct}%). d Коэна: ${result.cohenD} (${effectLabel(result.cohenD)}). Объясни результат кратко: что наблюдается, возможные объяснения, оговорки. На русском, 3-5 предложений.`
      const json = await callFunction<{ reply?: string }>('deep-research', { findings: prompt, periodLabel: `${exp.baseline_days} дн` })
      const explanation = json.reply ?? ''
      await supabase.from('experiments').update({ result, ai_explanation: explanation }).eq('id', exp.id)
      setExps(prev => prev.map(e => e.id === exp.id ? { ...e, result, ai_explanation: explanation } : e))
    } catch {}
    setAiLoading(null)
  }

  async function handleDelete(id: string) {
    await supabase.from('experiments').delete().eq('id', id)
    setExps(prev => { const next = prev.filter(e => e.id !== id); setActiveId(next[0]?.id ?? null); return next })
  }

  const active = exps.find(e => e.id === activeId) ?? null

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>{t('Эксперименты')}</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? t('Отмена') : t('+ Новый')}
        </button>
      </div>
      <p className="settings-muted" style={{ marginBottom: 16 }}>
        {t('Активная проверка гипотезы: что изменилось, когда ты поменял привычку? До/после с размером эффекта.')}
      </p>

      {showForm && (
        <form className="exp-form" onSubmit={handleCreate}>
          <label className="settings-label">{t('Гипотеза')}
            <input className="settings-input" required placeholder={t('Без кофе после 16:00 улучшится сон')}
              value={form.hypothesis} onChange={e => setForm(f => ({ ...f, hypothesis: e.target.value }))} />
          </label>
          <label className="settings-label">{t('Что меняем')}
            <input className="settings-input" required placeholder={t('Перестал пить кофе после 16:00')}
              value={form.change_rule} onChange={e => setForm(f => ({ ...f, change_rule: e.target.value }))} />
          </label>
          <label className="settings-label">{t('За какой метрикой следим')}
            <select className="settings-input" value={form.target_metric}
              onChange={e => setForm(f => ({ ...f, target_metric: e.target.value }))}>
              {METRIC_OPTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="settings-label" style={{ flex: 1, minWidth: 140 }}>{t('Начало')}
              <input type="date" className="settings-input" required value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </label>
            <label className="settings-label" style={{ flex: 1, minWidth: 140 }}>{t('Конец')}
              <input type="date" className="settings-input" required value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </label>
            <label className="settings-label" style={{ flex: 1, minWidth: 140 }}>{t('Базовый период (дней)')}
              <input type="number" className="settings-input" min={7} max={90} value={form.baseline_days}
                onChange={e => setForm(f => ({ ...f, baseline_days: +e.target.value }))} />
            </label>
          </div>
          <button type="submit" className="btn btn-primary">{t('Создать')}</button>
        </form>
      )}

      <div className="research-layout">
        <div className="research-runs">
          {exps.length === 0 && !showForm && (
            <p className="settings-muted">{t('Нет экспериментов. Создай первый — проверь гипотезу с цифрами.')}</p>
          )}
          {exps.map(exp => {
            const metaLabel = METRIC_OPTIONS.find(m => m.key === exp.target_metric)?.label ?? exp.target_metric
            return (
              <button key={exp.id} className={`research-run-btn${activeId === exp.id ? ' active' : ''}`}
                onClick={() => setActiveId(exp.id)}>
                <span className="research-run-label">{exp.hypothesis}</span>
                <span className="research-run-meta">{metaLabel} · {exp.start_date} – {exp.end_date}</span>
              </button>
            )
          })}
        </div>

        {active && (() => {
          const result = active.result ?? computeResult(daily, active)
          const metaLabel = METRIC_OPTIONS.find(m => m.key === active.target_metric)?.label ?? active.target_metric
          return (
            <div className="research-detail">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div>
                  <h3 style={{ marginBottom: 4 }}>{active.hypothesis}</h3>
                  <p className="settings-muted" style={{ fontSize: 13 }}>{active.change_rule}</p>
                </div>
                <button onClick={() => handleDelete(active.id)} className="concern-del-btn" title={t('Удалить')}>✕</button>
              </div>

              <div className="exp-meta-row">
                <span className="subnav-btn" style={{ cursor: 'default' }}>{metaLabel}</span>
                <span className="settings-muted" style={{ fontSize: 12 }}>
                  {t('Базовый')}: {active.baseline_days} {t('дн')} · {t('Эксперимент')}: {active.start_date} – {active.end_date}
                </span>
              </div>

              <ResultBlock r={result} metric={metaLabel} />

              {active.ai_explanation ? (
                <div className="ai-block" style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 14, lineHeight: 1.6 }}>{active.ai_explanation}</p>
                </div>
              ) : (
                <button className="btn btn-secondary" style={{ marginTop: 12 }}
                  disabled={aiLoading === active.id}
                  onClick={() => handleAI(active)}>
                  {aiLoading === active.id ? t('Объясняет ИИ…') : t('Объяснить результат (ИИ)')}
                </button>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
