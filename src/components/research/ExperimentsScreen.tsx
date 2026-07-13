import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { DailyMetrics } from '../../types'
import type { Json } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/edgeFunctions'
import { EXPERIMENT_PREFILL_KEY, type ExperimentPrefill } from '../../lib/levers'
import { useT } from '../../lib/i18n'
import {
  METRIC_OPTIONS, isValidMetric, metricLabel, localDate, addDays,
  computeBaselineStart, expStatusInfo, effectLabel,
  type ExperimentRow, type ExperimentResult,
} from '../../lib/experiments'
import { ExperimentCard } from './ExperimentCard'
import { LoadError } from '../ui/LoadError'
import { isDemoActive } from '../../lib/demo'
import { makeDemoExperiments } from '../../lib/demoFixture'

interface Props { user: User; daily: DailyMetrics[] }

// Предложение от ИИ (edge-функция suggest-experiments). target_metric валидируем по METRIC_OPTIONS.
interface Suggestion {
  hypothesis: string
  change_rule: string
  target_metric: string
  rationale?: string
}

export function ExperimentsScreen({ user, daily }: Props) {
  const { t } = useT()
  const [exps, setExps] = useState<ExperimentRow[]>(() => isDemoActive() ? makeDemoExperiments() : [])
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiError, setAiError] = useState<{ id: string; msg: string } | null>(null)

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
    start_date: addDays(localDate(), -14),
    end_date: localDate(),
  })

  function loadExps() {
    if (isDemoActive()) return // фикстура уже в начальном стейте
    supabase.from('experiments').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setLoadError(true)
        else { setExps((data ?? []) as ExperimentRow[]); setLoadError(false) }
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadExps() }, [user.id])

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
    if (isDemoActive()) {
      setExps(prev => [{
        id: `demo-${Date.now()}`,
        hypothesis: form.hypothesis,
        change_rule: form.change_rule,
        target_metric: form.target_metric,
        baseline_days: form.baseline_days,
        baseline_start: computeBaselineStart(form.start_date, form.baseline_days),
        start_date: form.start_date,
        end_date: form.end_date,
        status: form.end_date < localDate() ? 'completed' : 'active',
        result: null, ai_explanation: null, created_at: new Date().toISOString(),
      }, ...prev])
      setShowForm(false)
      return
    }
    const { data, error } = await supabase.from('experiments').insert({
      user_id: user.id,
      hypothesis: form.hypothesis,
      change_rule: form.change_rule,
      target_metric: form.target_metric,
      baseline_days: form.baseline_days,
      baseline_start: computeBaselineStart(form.start_date, form.baseline_days),
      start_date: form.start_date,
      end_date: form.end_date,
      status: form.end_date < localDate() ? 'completed' : 'active',
    }).select().single()
    if (!error && data) {
      setExps(prev => [data as ExperimentRow, ...prev])
      setShowForm(false)
    }
  }

  // «Подобрать (ИИ)» — генерим гипотезы из 30 дней метрик
  async function handleSuggest() {
    setSuggestLoading(true); setSuggestError(null)
    if (isDemoActive()) {
      setTimeout(() => {
        setSuggestions([
          { hypothesis: 'Отказ от экрана за час до сна ускорит засыпание', change_rule: 'Телефон в другой комнате после 22:30', target_metric: 'sleepHours', rationale: 'В демо-данных поздний отбой связан с недосыпом.' },
          { hypothesis: '8000+ шагов в день поднимут HRV', change_rule: 'Прогулка в обед минимум 30 минут', target_metric: 'hrv', rationale: 'Активные дни в демо-данных предшествуют более высокому HRV.' },
        ])
        setSuggestLoading(false)
      }, 500)
      return
    }
    try {
      const json = await callFunction<{ suggestions?: Suggestion[]; message?: string }>('suggest-experiments', { mode: 'generate' })
      const valid = (json.suggestions ?? []).filter(s => isValidMetric(s.target_metric))
      setSuggestions(valid)
      if (!valid.length) setSuggestError(json.message ?? t('Пока недостаточно данных для предложений.'))
    } catch (e) {
      setSuggestError((e as Error)?.message)
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
    } catch (e) {
      setRefineError((e as Error)?.message)
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

  async function handleAI(exp: ExperimentRow, result: ExperimentResult) {
    setAiLoading(exp.id); setAiError(null)
    if (isDemoActive()) {
      const explanation = `Средние за периоды: ${result.baselineMean} → ${result.expMean} (${result.deltaPct}%). Размер эффекта ${effectLabel(result.cohenD)}. В демо-режиме это заглушка — в приложении разбор пишет ИИ на основе твоих данных.`
      setTimeout(() => {
        setExps(prev => prev.map(e => e.id === exp.id ? { ...e, result, ai_explanation: explanation } : e))
        setAiLoading(null)
      }, 500)
      return
    }
    try {
      const prompt = `Эксперимент: "${exp.hypothesis}". Изменение: "${exp.change_rule}". Метрика: ${metricLabel(exp.target_metric)}. До: ${result.baselineMean} (n=${result.baselineN}). Во время: ${result.expMean} (n=${result.expN}). Дельта: ${result.delta} (${result.deltaPct}%). d Коэна: ${result.cohenD} (${effectLabel(result.cohenD)}). Объясни результат кратко: что наблюдается, возможные объяснения, оговорки. На русском, 3-5 предложений.`
      const json = await callFunction<{ reply?: string }>('deep-research', { findings: prompt, periodLabel: `${exp.baseline_days} дн` })
      const explanation = json.reply ?? ''
      if (!explanation) throw new Error('empty reply')
      await supabase.from('experiments').update({ result: result as unknown as Json, ai_explanation: explanation }).eq('id', exp.id)
      setExps(prev => prev.map(e => e.id === exp.id ? { ...e, result, ai_explanation: explanation } : e))
    } catch {
      setAiError({ id: exp.id, msg: t('Не удалось получить разбор. Попробуй ещё раз.') })
    }
    setAiLoading(null)
  }

  async function handleDelete(id: string) {
    if (!isDemoActive()) await supabase.from('experiments').delete().eq('id', id)
    setExps(prev => prev.filter(e => e.id !== id))
  }

  const active = exps.filter(e => expStatusInfo(e).kind === 'active')
  const planned = exps.filter(e => expStatusInfo(e).kind === 'planned')
  const finished = exps.filter(e => ['done', 'cancelled'].includes(expStatusInfo(e).kind))

  const renderCards = (list: ExperimentRow[]) => list.map(exp => (
    <ExperimentCard key={exp.id} exp={exp} daily={daily}
      aiLoading={aiLoading === exp.id}
      aiError={aiError?.id === exp.id ? aiError.msg : null}
      onExplain={handleAI} onDelete={handleDelete} />
  ))

  return (
    <div className="screen">
      <div className="expd-header">
        <div className="expd-header-text">
          <h2>{t('Эксперименты')}</h2>
          <p>{t('Активная проверка гипотезы: что изменилось, когда ты поменял привычку? До/после с размером эффекта.')}</p>
        </div>
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

      {loadError && <LoadError onRetry={loadExps} />}

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
                <div className="exp-suggest-body">
                  <span className="exp-suggest-metric">{metricLabel(s.target_metric)}</span>
                  <div className="exp-suggest-hyp">{s.hypothesis}</div>
                  <div className="exp-suggest-change">{t('Меняем')}: {s.change_rule}</div>
                  {s.rationale && <div className="exp-suggest-why">{s.rationale}</div>}
                </div>
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
        <div className="expd-sections">
          {active.length > 0 && <>
            <h3 className="expd-section-title">{t('Идёт сейчас')}</h3>
            <div className="expd-list">{renderCards(active)}</div>
          </>}
          {planned.length > 0 && <>
            <h3 className="expd-section-title">{t('Запланированные')}<span className="expd-count">{planned.length}</span></h3>
            <div className="expd-grid">{renderCards(planned)}</div>
          </>}
          {finished.length > 0 && <>
            <h3 className="expd-section-title">{t('Завершённые')}<span className="expd-count">{finished.length}</span></h3>
            <div className="expd-grid">{renderCards(finished)}</div>
          </>}
        </div>
      )}
    </div>
  )
}
