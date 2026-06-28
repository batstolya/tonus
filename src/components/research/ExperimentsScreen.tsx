import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { DailyMetrics } from '../../types'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/edgeFunctions'
import { EXPERIMENT_PREFILL_KEY, type ExperimentPrefill } from '../../lib/levers'
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

// Предложение от ИИ (edge-функция suggest-experiments). target_metric валидируем по METRIC_OPTIONS.
interface Suggestion {
  hypothesis: string
  change_rule: string
  target_metric: string
  rationale?: string
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

const isValidMetric = (k: string) => METRIC_OPTIONS.some(m => m.key === k)
const metricLabel = (k: string) => METRIC_OPTIONS.find(m => m.key === k)?.label ?? k

function today() { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10)
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

type StatusKind = 'done' | 'active' | 'planned' | 'cancelled'
// Состояние эксперимента для бейджа (RU-ключ переводим на месте через t()).
function expStatusInfo(exp: Experiment): { kind: StatusKind; label: string } {
  const td = today()
  if (exp.status === 'cancelled') return { kind: 'cancelled', label: 'Отменён' }
  if (exp.status === 'completed' || exp.end_date < td) return { kind: 'done', label: 'Завершён' }
  if (exp.start_date > td) return { kind: 'planned', label: 'Запланирован' }
  return { kind: 'active', label: 'Идёт' }
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

function effectSegments(d: number | null): number {
  if (d === null) return 0
  const a = Math.abs(d)
  if (a >= 0.8) return 4
  if (a >= 0.5) return 3
  if (a >= 0.2) return 2
  if (a > 0) return 1
  return 0
}

// Hero «До → Во время → Изменение» + шкала размера эффекта. Предполагает, что
// данных достаточно (родитель решает, что показать при пустых средних).
function ResultBlock({ r }: { r: ExperimentResult }) {
  const { t } = useT()
  const improved = r.delta !== null && ((r.betterHigh && r.delta > 0) || (!r.betterHigh && r.delta < 0))
  const worse = r.delta !== null && r.delta !== 0 && !improved
  const color = improved ? 'var(--green)' : worse ? 'var(--red)' : 'var(--text-muted)'
  const bg = improved
    ? 'color-mix(in srgb, var(--green) 12%, transparent)'
    : worse ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'var(--surface2)'
  const sign = r.delta !== null && r.delta > 0 ? '+' : ''
  const segs = effectSegments(r.cohenD)

  return (
    <div className="exp-result">
      <div className="exp-compare">
        <div className="exp-cmp-cell">
          <div className="exp-cmp-label">{t('До')}</div>
          <div className="exp-cmp-val">{r.baselineMean}</div>
          <div className="exp-cmp-n">n = {r.baselineN}</div>
        </div>
        <div className="exp-cmp-arrow" aria-hidden>→</div>
        <div className="exp-cmp-cell">
          <div className="exp-cmp-label">{t('Во время')}</div>
          <div className="exp-cmp-val">{r.expMean}</div>
          <div className="exp-cmp-n">n = {r.expN}</div>
        </div>
        <div className="exp-cmp-cell exp-cmp-delta" style={{ background: bg }}>
          <div className="exp-cmp-label" style={{ color }}>{t('Изменение')}</div>
          <div className="exp-cmp-val" style={{ color }}>{sign}{r.delta}</div>
          <div className="exp-cmp-pct" style={{ color }}>{sign}{r.deltaPct}%</div>
        </div>
      </div>
      {r.cohenD !== null && (
        <div className="exp-effect">
          <span>{t('Размер эффекта')} <b>d = {r.cohenD}</b> · {t(effectLabel(r.cohenD))}</span>
          <span className="exp-effect-meter" aria-hidden>
            {[0, 1, 2, 3].map(i => <span key={i} className={`exp-seg${i < segs ? ' on' : ''}`} />)}
          </span>
        </div>
      )}
      <p className="exp-result-caveat">{t('Наблюдение, не доказательство. Другие факторы могут объяснять изменение.')}</p>
    </div>
  )
}

// Прогресс для идущего эксперимента — вместо пустого блока.
function ProgressBlock({ exp }: { exp: Experiment }) {
  const { t } = useT()
  const total = Math.max(1, daysBetween(exp.start_date, exp.end_date))
  const elapsed = Math.min(total, Math.max(0, daysBetween(exp.start_date, today())))
  const pct = Math.round((elapsed / total) * 100)
  return (
    <div className="exp-progress">
      <div className="exp-progress-bar"><span style={{ width: `${pct}%` }} /></div>
      <p className="exp-progress-text">
        {t('День {d} из {n}', { d: elapsed, n: total })}. {t('Результаты появятся после завершения')}.
      </p>
    </div>
  )
}

export function ExperimentsScreen({ user, daily }: Props) {
  const { t } = useT()
  const [exps, setExps] = useState<Experiment[]>([])
  const [showForm, setShowForm] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState<string | null>(null)

  // ИИ-предложения (кнопка «Подобрать») и ассистент-формулировщик внутри формы
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [refineIdea, setRefineIdea] = useState('')
  const [refineLoading, setRefineLoading] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)

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

  useEffect(() => {
    const raw = sessionStorage.getItem(EXPERIMENT_PREFILL_KEY)
    if (!raw) return
    sessionStorage.removeItem(EXPERIMENT_PREFILL_KEY)
    try {
      const p = JSON.parse(raw) as ExperimentPrefill
      setForm(prev => ({
        ...prev,
        hypothesis: p.hypothesis,
        change_rule: p.change_rule,
        target_metric: isValidMetric(p.target_metric) ? p.target_metric : prev.target_metric,
      }))
      setShowForm(true)
    } catch { /* битый prefill — игнорируем */ }
  }, [])

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

  // «Подобрать (ИИ)» — генерим гипотезы из 30 дней метрик
  async function handleSuggest() {
    setSuggestLoading(true); setSuggestError(null)
    try {
      const json = await callFunction<{ suggestions?: Suggestion[]; message?: string }>('suggest-experiments', { mode: 'generate' })
      const valid = (json.suggestions ?? []).filter(s => isValidMetric(s.target_metric))
      setSuggestions(valid)
      if (!valid.length) setSuggestError(json.message ?? t('Пока недостаточно данных для предложений.'))
    } catch (e: any) {
      setSuggestError(e.message)
    }
    setSuggestLoading(false)
  }

  // Ассистент: текст идеи → структурированная гипотеза, заполняем форму
  async function handleRefine() {
    if (refineIdea.trim().length < 2) return
    setRefineLoading(true); setRefineError(null)
    try {
      const json = await callFunction<{ suggestions?: Suggestion[] }>('suggest-experiments', { mode: 'refine', idea: refineIdea })
      const s = json.suggestions?.[0]
      if (!s) throw new Error(t('Не удалось уточнить. Попробуй переформулировать.'))
      applyToForm(s)
    } catch (e: any) {
      setRefineError(e.message)
    }
    setRefineLoading(false)
  }

  function applyToForm(s: Suggestion) {
    setForm(f => ({
      ...f,
      hypothesis: s.hypothesis,
      change_rule: s.change_rule,
      target_metric: isValidMetric(s.target_metric) ? s.target_metric : f.target_metric,
    }))
  }

  // «Применить» на карточке-предложении: открыть форму, заполнить, прокрутить к ней
  function applySuggestion(s: Suggestion) {
    applyToForm(s)
    setShowForm(true)
    setRefineError(null)
    requestAnimationFrame(() => {
      document.querySelector('.exp-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  async function handleAI(exp: Experiment) {
    const result = computeResult(daily, exp)
    setAiLoading(exp.id)
    try {
      const metaLabel = metricLabel(exp.target_metric)
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
        <div className="exp-header-actions">
          <button className="btn-suggest" onClick={handleSuggest} disabled={suggestLoading}>
            {suggestLoading
              ? <><span className="ai-spinner" />{t('Подбираю…')}</>
              : <><span aria-hidden>✨</span>{t('Подобрать (ИИ)')}</>}
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
            {showForm ? t('Отмена') : t('+ Новый')}
          </button>
        </div>
      </div>
      <p className="settings-muted" style={{ marginBottom: 16 }}>
        {t('Активная проверка гипотезы: что изменилось, когда ты поменял привычку? До/после с размером эффекта.')}
      </p>

      {suggestError && !suggestions.length && (
        <p className="settings-muted" style={{ marginBottom: 16 }}>{suggestError}</p>
      )}

      {suggestions.length > 0 && (
        <div className="exp-suggest-block">
          <div className="exp-suggest-head">
            <span><span aria-hidden>✨</span> {t('Предложено ИИ на основе твоих данных')}</span>
            <button className="exp-suggest-hide" onClick={() => setSuggestions([])}>{t('Скрыть')}</button>
          </div>
          <div className="exp-suggest-grid">
            {suggestions.map((s, i) => (
              <div key={i} className="exp-suggest-card">
                <span className="exp-suggest-metric">{metricLabel(s.target_metric)}</span>
                <div className="exp-suggest-hyp">{s.hypothesis}</div>
                <div className="exp-suggest-change">{t('Меняем')}: {s.change_rule}</div>
                {s.rationale && <div className="exp-suggest-why">{s.rationale}</div>}
                <button className="btn btn-secondary exp-suggest-apply" onClick={() => applySuggestion(s)}>
                  {t('Применить')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <form className="exp-form" onSubmit={handleCreate}>
          <div className="exp-ai-row">
            <div className="exp-ai-row-head"><span aria-hidden>✨</span> {t('ИИ-ассистент')}</div>
            <div className="exp-ai-row-input">
              <input className="settings-input" placeholder={t('Опиши идею своими словами…')}
                value={refineIdea} onChange={e => setRefineIdea(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRefine() } }} />
              <button type="button" className="btn btn-secondary"
                disabled={refineLoading || refineIdea.trim().length < 2} onClick={handleRefine}>
                {refineLoading ? t('Думаю…') : t('Уточнить')}
              </button>
            </div>
            {refineError && <p className="settings-muted" style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{refineError}</p>}
          </div>

          <label className="settings-label">{t('Гипотеза')}
            <input className="settings-input" required placeholder={t('Без кофе после 16:00 улучшится сон')}
              value={form.hypothesis} onChange={e => setForm(f => ({ ...f, hypothesis: e.target.value }))} />
          </label>
          <label className="settings-label">{t('Что меняем')}
            <input className="settings-input" required placeholder={t('Перестал пить кофе после 16:00')}
              value={form.change_rule} onChange={e => setForm(f => ({ ...f, change_rule: e.target.value }))} />
          </label>
          <div className="exp-form-grid">
            <label className="settings-label">{t('За какой метрикой следим')}
              <select className="settings-input" value={form.target_metric}
                onChange={e => setForm(f => ({ ...f, target_metric: e.target.value }))}>
                {METRIC_OPTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <label className="settings-label">{t('Начало')}
              <input type="date" className="settings-input" required value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </label>
            <label className="settings-label">{t('Конец')}
              <input type="date" className="settings-input" required value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </label>
            <label className="settings-label">{t('Базовый период (дней)')}
              <input type="number" className="settings-input" min={7} max={90} value={form.baseline_days}
                onChange={e => setForm(f => ({ ...f, baseline_days: +e.target.value }))} />
            </label>
          </div>
          <button type="submit" className="btn btn-primary">{t('Создать')}</button>
        </form>
      )}

      {exps.length === 0 && !showForm ? (
        <div className="exp-empty">
          <div className="exp-empty-emoji" aria-hidden>🧪</div>
          <p>{t('Нет экспериментов. Создай первый — проверь гипотезу с цифрами.')}</p>
        </div>
      ) : (
      <div className="research-layout">
        <div className="research-runs">
          {exps.map(exp => {
            const st = expStatusInfo(exp)
            const qr = exp.result ?? computeResult(daily, exp)
            const hasData = qr.baselineMean !== null && qr.expMean !== null
            const improved = qr.delta !== null && ((qr.betterHigh && qr.delta > 0) || (!qr.betterHigh && qr.delta < 0))
            const worse = qr.delta !== null && qr.delta !== 0 && !improved
            const tagColor = !hasData ? 'var(--text-muted)' : improved ? 'var(--green)' : worse ? 'var(--red)' : 'var(--text-muted)'
            const tag = hasData ? `${qr.delta! > 0 ? '+' : ''}${qr.deltaPct}%` : st.kind === 'active' ? t('Идёт') : '—'
            return (
              <button key={exp.id} className={`research-run-btn${activeId === exp.id ? ' active' : ''}`}
                onClick={() => setActiveId(exp.id)}>
                <span className="research-run-label">{exp.hypothesis}</span>
                <span className="exp-run-foot">
                  <span className="research-run-meta">{metricLabel(exp.target_metric)} · {exp.start_date} – {exp.end_date}</span>
                  <span className="exp-run-tag" style={{ color: tagColor }}>{tag}</span>
                </span>
              </button>
            )
          })}
        </div>

        {active && (() => {
          const result = active.result ?? computeResult(daily, active)
          const st = expStatusInfo(active)
          const hasData = result.baselineMean !== null && result.expMean !== null
          return (
            <div className="research-detail exp-detail">
              <div className="exp-detail-head">
                <div className="exp-detail-head-main">
                  <h3 className="exp-detail-title">{active.hypothesis}</h3>
                  <p className="exp-detail-rule">{active.change_rule}</p>
                </div>
                <div className="exp-detail-head-side">
                  <span className={`exp-status exp-status-${st.kind}`}>{t(st.label)}</span>
                  <button onClick={() => handleDelete(active.id)} className="concern-del-btn" title={t('Удалить')}>✕</button>
                </div>
              </div>

              <div className="exp-chips">
                <span className="exp-chip">{metricLabel(active.target_metric)}</span>
                <span className="exp-chip">{t('Базовый')}: {active.baseline_days} {t('дн')}</span>
                <span className="exp-chip">{active.start_date} – {active.end_date}</span>
              </div>

              {hasData
                ? <ResultBlock r={result} />
                : st.kind === 'active'
                  ? <ProgressBlock exp={active} />
                  : <p className="settings-muted" style={{ marginTop: 8 }}>{t('Недостаточно данных для сравнения.')}</p>}

              {active.ai_explanation ? (
                <div className="exp-ai-card">
                  <div className="exp-ai-card-head">{t('Разбор ИИ')}</div>
                  <p>{active.ai_explanation}</p>
                </div>
              ) : hasData ? (
                <button className="btn btn-secondary exp-ai-btn"
                  disabled={aiLoading === active.id}
                  onClick={() => handleAI(active)}>
                  {aiLoading === active.id ? t('Объясняет ИИ…') : t('Объяснить результат (ИИ)')}
                </button>
              ) : null}
            </div>
          )
        })()}
      </div>
      )}
    </div>
  )
}
