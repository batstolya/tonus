import { useState } from 'react'
import type { DailyMetrics } from '../../types'
import { useT } from '../../lib/i18n'
import {
  computeResult, expStatusInfo, effectLabel, effectSegments, metricLabel,
  firstMetricDate, daysBetween, localDate, MIN_N,
  type ExperimentRow, type ExperimentResult,
} from '../../lib/experiments'

interface Props {
  exp: ExperimentRow
  daily: DailyMetrics[]
  aiLoading: boolean
  aiError: string | null
  onExplain: (exp: ExperimentRow, result: ExperimentResult) => void
  onDelete: (id: string) => void
}

const METRIC_ICONS: Record<string, string> = {
  hrv: '💓', restingHeartRate: '🫀', heartRate: '❤️',
  sleepHours: '😴', sleepDeep: '🌙', sleepREM: '💤',
  steps: '👟', activeEnergy: '🔥', oxygenSaturation: '🫁',
}

type T = (ru: string, vars?: Record<string, string | number>) => string

// '2026-06-13' → '13.06'
const fmtD = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`

// Mate-стиль: три числа с тонкими разделителями вместо серых коробок.
function StatsRow({ r, t }: { r: ExperimentResult; t: T }) {
  const improved = r.delta !== null && ((r.betterHigh && r.delta > 0) || (!r.betterHigh && r.delta < 0))
  const worse = r.delta !== null && r.delta !== 0 && !improved
  const dir = improved ? 'good' : worse ? 'bad' : 'flat'
  const sign = r.delta !== null && r.delta > 0 ? '+' : ''
  const segs = effectSegments(r.cohenD)

  return (
    <>
      <div className="expc-stats">
        <div className="expc-stat">
          <span className="expc-stat-label">{t('До')}</span>
          <span className="expc-stat-val">{r.baselineMean}</span>
          <span className="expc-stat-n">n = {r.baselineN}</span>
        </div>
        <div className="expc-stat">
          <span className="expc-stat-label">{t('Во время')}</span>
          <span className="expc-stat-val">{r.expMean}</span>
          <span className="expc-stat-n">n = {r.expN}</span>
        </div>
        <div className={`expc-stat expc-stat-delta expc-${dir}`}>
          <span className="expc-stat-label">{t('Изменение')}</span>
          <span className="expc-stat-val">{sign}{r.delta}</span>
          <span className="expc-stat-n">{sign}{r.deltaPct}%</span>
        </div>
      </div>
      {r.cohenD !== null && (
        <div className="expc-effect">
          <span className="expc-effect-text">
            {t('Размер эффекта')} <b>d = {r.cohenD}</b> · {t(effectLabel(r.cohenD))}
          </span>
          <span className="expc-meter" aria-hidden>
            {[0, 1, 2, 3].map(i => <span key={i} className={`expc-seg${i < segs ? ' on' : ''}`} />)}
          </span>
        </div>
      )}
    </>
  )
}

// Карточка эксперимента: иконка метрики, заголовок, мета-строка и по состоянию —
// прогресс (идёт), дата старта (запланирован), стат-ряд или «недостаточно данных».
export function ExperimentCard({ exp, daily, aiLoading, aiError, onExplain, onDelete }: Props) {
  const { t } = useT()
  const [showAI, setShowAI] = useState(false)
  const st = expStatusInfo(exp)
  // Завершённые: правда одна — вердикт, сохранённый сервером при закрытии
  // (SPEC-EXPERIMENT-LOOP §2.3); пересчёт — фолбэк для старых записей.
  const result = exp.result ?? computeResult(daily, exp)
  const finished = st.kind === 'done' || st.kind === 'cancelled'
  const hasResult = finished && result.insufficient === null
    && result.baselineMean !== null && result.expMean !== null

  const total = Math.max(1, daysBetween(exp.start_date, exp.end_date))
  const elapsed = Math.min(total, Math.max(0, daysBetween(exp.start_date, localDate())))

  const firstDate = result.insufficient ? firstMetricDate(daily, exp.target_metric) : null
  const baseStart = exp.baseline_start ?? exp.start_date
  const insufficientMsg = result.insufficient
    ? (result.insufficient.window === 'baseline'
      ? t('В базовом периоде только {n} из {m} дней с данными.', { n: result.insufficient.n, m: result.insufficient.minN })
      : t('В периоде эксперимента только {n} из {m} дней с данными.', { n: result.insufficient.n, m: result.insufficient.minN }))
    : null
  // Подсказка про начало данных полезна, только если данные начались позже базового окна
  const firstDateHint = firstDate && firstDate > baseStart ? firstDate : null

  return (
    <div className={`expc${st.kind === 'active' ? ' expc-hero' : ''}`}>
      <div className="expc-top">
        <div className="expc-icon" aria-hidden>{METRIC_ICONS[exp.target_metric] ?? '📊'}</div>
        <div className="expc-heading">
          <h3 className="expc-title">{exp.hypothesis}</h3>
          <p className="expc-rule">{exp.change_rule}</p>
        </div>
        <div className="expc-side">
          <span className={`exp-status exp-status-${st.kind}`}>{t(st.label)}</span>
          <button onClick={() => onDelete(exp.id)} className="expc-del" title={t('Удалить')} aria-label={t('Удалить')}>✕</button>
        </div>
      </div>

      <div className="expc-meta">
        {metricLabel(exp.target_metric)} · {fmtD(exp.start_date)} – {fmtD(exp.end_date)} · {t('Базовый')}: {exp.baseline_days} {t('дн')}
      </div>

      {st.kind === 'active' && (
        <div className="expc-progress">
          <div className="exp-progress-bar"><span style={{ width: `${Math.round((elapsed / total) * 100)}%` }} /></div>
          <p className="expc-progress-text">
            <b>{t('День {d} из {n}', { d: elapsed, n: total })}</b> · {t('Результаты появятся после завершения')}
          </p>
        </div>
      )}

      {st.kind === 'planned' && (
        <p className="expc-note">{t('Начнётся {d}', { d: fmtD(exp.start_date) })}</p>
      )}

      {finished && (hasResult
        ? <StatsRow r={result} t={t} />
        : (
          <div className="expc-nodata">
            <div className="expc-nodata-head">
              <span>{t('Недостаточно данных')}</span>
              {result.insufficient && (
                <span className="expc-dots" aria-hidden>
                  {Array.from({ length: MIN_N }, (_, i) => (
                    <span key={i} className={`expc-dot${i < result.insufficient!.n ? ' on' : ''}`} />
                  ))}
                </span>
              )}
            </div>
            <p>
              {insufficientMsg ?? t('Недостаточно данных для сравнения.')}
              {firstDateHint && <> {t('Данные по метрике начинаются {d}.', { d: fmtD(firstDateHint) })}</>}
            </p>
          </div>
        )
      )}

      {hasResult && exp.ai_explanation && (
        <div className="expc-ai">
          <button className="expc-ai-toggle" onClick={() => setShowAI(s => !s)}>
            <span className="expc-ai-badge" aria-hidden>✨</span>
            {t('Разбор ИИ')}
            <span className="expc-ai-chevron" aria-hidden>{showAI ? '▴' : '▾'}</span>
          </button>
          {showAI && <p className="expc-ai-text">{exp.ai_explanation}</p>}
        </div>
      )}
      {hasResult && !exp.ai_explanation && (
        <div className="expc-foot">
          <span className="expc-caveat">{t('Наблюдение, не доказательство. Другие факторы могут объяснять изменение.')}</span>
          <button className="expc-ai-btn" disabled={aiLoading} onClick={() => onExplain(exp, result)}>
            {aiLoading ? t('Объясняет ИИ…') : <>✨ {t('Объяснить результат (ИИ)')}</>}
          </button>
        </div>
      )}
      {aiError && <p className="expc-ai-error">{aiError}</p>}
    </div>
  )
}
