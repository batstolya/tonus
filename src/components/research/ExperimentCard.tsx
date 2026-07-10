import { useState } from 'react'
import type { DailyMetrics } from '../../types'
import { useT } from '../../lib/i18n'
import {
  computeResult, expStatusInfo, effectLabel, effectSegments, metricLabel,
  firstMetricDate, daysBetween, localDate,
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

type T = (ru: string, vars?: Record<string, string | number>) => string

// Тройка «До → Во время → Изменение» + шкала размера эффекта. Рендерится
// только когда данных достаточно (родительская карточка это гарантирует).
function ResultRow({ r, t }: { r: ExperimentResult; t: T }) {
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

// Полноширинная карточка эксперимента: заголовок, чипы, и по состоянию —
// прогресс (идёт), дата старта (запланирован), результат или «мало данных».
export function ExperimentCard({ exp, daily, aiLoading, aiError, onExplain, onDelete }: Props) {
  const { t } = useT()
  const [showAI, setShowAI] = useState(false)
  const st = expStatusInfo(exp)
  const result = computeResult(daily, exp)
  const finished = st.kind === 'done' || st.kind === 'cancelled'
  const hasResult = finished && result.insufficient === null
    && result.baselineMean !== null && result.expMean !== null

  const total = Math.max(1, daysBetween(exp.start_date, exp.end_date))
  const elapsed = Math.min(total, Math.max(0, daysBetween(exp.start_date, localDate())))

  const firstDate = result.insufficient ? firstMetricDate(daily, exp.target_metric) : null
  const insufficientMsg = result.insufficient
    ? (result.insufficient.window === 'baseline'
      ? t('Мало данных: {n} из {m} дней в базовом периоде.', { n: result.insufficient.n, m: result.insufficient.minN })
      : t('Мало данных: {n} из {m} дней в периоде эксперимента.', { n: result.insufficient.n, m: result.insufficient.minN }))
    : null

  return (
    <div className={`expd-card${st.kind === 'active' ? ' expd-card-hero' : ''}`}>
      <div className="exp-detail-head">
        <div className="exp-detail-head-main">
          <h3 className="exp-detail-title">{exp.hypothesis}</h3>
          <p className="exp-detail-rule">{t('Меняем')}: {exp.change_rule}</p>
        </div>
        <div className="exp-detail-head-side">
          <span className={`exp-status exp-status-${st.kind}`}>{t(st.label)}</span>
          <button onClick={() => onDelete(exp.id)} className="concern-del-btn" title={t('Удалить')}>✕</button>
        </div>
      </div>

      <div className="exp-chips">
        <span className="exp-chip">{metricLabel(exp.target_metric)}</span>
        <span className="exp-chip">{t('Базовый')}: {exp.baseline_days} {t('дн')}</span>
        <span className="exp-chip">{exp.start_date} – {exp.end_date}</span>
      </div>

      {st.kind === 'active' && (
        <div className="exp-progress">
          <div className="exp-progress-bar"><span style={{ width: `${Math.round((elapsed / total) * 100)}%` }} /></div>
          <p className="exp-progress-text">
            {t('День {d} из {n}', { d: elapsed, n: total })}. {t('Результаты появятся после завершения')}.
          </p>
        </div>
      )}

      {st.kind === 'planned' && (
        <p className="settings-muted expd-note">{t('Начнётся {d}', { d: exp.start_date })}</p>
      )}

      {finished && (hasResult
        ? <ResultRow r={result} t={t} />
        : (
          <div className="expd-nodata">
            <span>
              {insufficientMsg ?? t('Недостаточно данных для сравнения.')}
              {firstDate && <> {t('Данные по метрике начинаются {d}.', { d: firstDate })}</>}
            </span>
          </div>
        )
      )}

      {hasResult && exp.ai_explanation && (
        <div className="exp-ai-card">
          <button className="exp-ai-card-head expd-ai-toggle" onClick={() => setShowAI(s => !s)}>
            {t('Разбор ИИ')} {showAI ? '▴' : '▾'}
          </button>
          {showAI && <p>{exp.ai_explanation}</p>}
        </div>
      )}
      {hasResult && !exp.ai_explanation && (
        <>
          <button className="btn btn-secondary exp-ai-btn" disabled={aiLoading}
            onClick={() => onExplain(exp, result)}>
            {aiLoading ? t('Объясняет ИИ…') : t('Объяснить результат (ИИ)')}
          </button>
          {aiError && <p className="expd-ai-error">{aiError}</p>}
        </>
      )}
    </div>
  )
}
