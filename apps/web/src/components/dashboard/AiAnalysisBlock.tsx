import { useState, useEffect, useMemo } from 'react'
import type { DailyMetrics } from '../../types'
import { runAnalysis, loadAnalyses, deleteAnalysis, type AiAnalysis, type AnalysisPeriod } from '../../lib/aiAnalysis'
import { useT } from '../../lib/i18n'
import { isAiConsentRequiredError, loadAiConsent } from '../../lib/aiConsent'
import { Icon } from '../../lib/icons'
import { computeGaps } from '../../lib/dataCompleteness'

interface Props {
  daily: DailyMetrics[]
  userId: string
}

function fmtDate(s: string, locale: string) {
  return new Date(s).toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtPeriod(s: string, e: string, locale: string) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${new Date(s).toLocaleDateString(locale, opts)} — ${new Date(e).toLocaleDateString(locale, opts)}`
}

function AnalysisCard({ item, onDelete }: { item: AiAnalysis; onDelete: (id: string) => void }) {
  const { t, locale } = useT()
  const [open, setOpen] = useState(false)

  return (
    <div className={`ai-card${open ? ' open' : ''}`}>
      <div className="ai-card-header" onClick={() => setOpen(o => !o)}>
        <div className="ai-card-meta">
          <span className="ai-card-date">{fmtDate(item.created_at, locale)}</span>
          <span className="ai-card-period">{fmtPeriod(item.period_start, item.period_end, locale)}</span>
        </div>
        <div className="ai-card-actions">
          <button className="ai-card-delete" onClick={e => { e.stopPropagation(); onDelete(item.id) }} title={t('Удалить')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
          <span className="ai-card-chevron">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {open ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
            </svg>
          </span>
        </div>
      </div>
      <p className="ai-card-preview">{item.summary.split('.')[0]}.</p>
      {open && (
        <div className="ai-card-body">
          <p className="ai-summary">{item.summary}</p>
          {item.good.length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label good">{t('Что хорошо')}</span>
              <ul>{item.good.map((txt, i) => <li key={i}>{txt}</li>)}</ul>
            </div>
          )}
          {item.improve.length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label improve">{t('Что улучшить')}</span>
              <ul>{item.improve.map((txt, i) => <li key={i}>{txt}</li>)}</ul>
            </div>
          )}
          {item.focus.length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label focus">{t('Фокус')}</span>
              <ul>{item.focus.map((txt, i) => <li key={i}>{txt}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AiAnalysisBlock({ daily, userId }: Props) {
  const gaps = useMemo(() => computeGaps(daily).filter(g => g.missingDays >= 3), [daily])
  const { t } = useT()
  const [analyses, setAnalyses] = useState<AiAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<AnalysisPeriod>('14d')
  const [consented, setConsented] = useState<boolean | null>(null)
  const [showConsent, setShowConsent] = useState(false)

  useEffect(() => {
    loadAnalyses(userId).then(setAnalyses)
  }, [userId])

  useEffect(() => {
    let active = true
    loadAiConsent(userId)
      .then(status => { if (active) setConsented(status.granted) })
      .catch(() => { if (active) setConsented(false) })
    return () => { active = false }
  }, [userId])

  async function handleRun() {
    if (consented !== true) { setShowConsent(true); return }
    setLoading(true)
    setError(null)
    try {
      const result = await runAnalysis(userId, daily, period)
      setAnalyses(prev => [result, ...prev])
    } catch (e) {
      if (isAiConsentRequiredError(e)) {
        setConsented(false)
        setShowConsent(true)
        setError(t('Согласие на обработку данных ИИ не активно.'))
      } else {
        setError((e as Error)?.message ?? t('Ошибка анализа'))
      }
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    await deleteAnalysis(id)
    setAnalyses(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="ai-block">
      {showConsent && (
        <div className="ai-consent-overlay" onClick={() => setShowConsent(false)}>
          <div className="ai-consent-card" onClick={e => e.stopPropagation()}>
            <h3>{t('Анализ данных через ИИ')}</h3>
            <p>{t('Чтобы использовать функции ИИ, открой Настройки → Обработка данных ИИ и дай согласие на обработку через Google Gemini.')}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('Согласие хранится в аккаунте, действует на всех устройствах и может быть отозвано в любое время.')}</p>
            <div className="ai-consent-btns">
              <button className="btn-primary" onClick={() => setShowConsent(false)}>{t('Закрыть')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="ai-block-header">
        <h3>{t('ИИ-анализ')}</h3>
        <div className="ai-controls">
          <div className="presets" style={{ marginBottom: 0 }}>
            {(['14d', '30d'] as AnalysisPeriod[]).map(p => (
              <button key={p} className={period === p ? 'preset active' : 'preset'} onClick={() => setPeriod(p)}>
                {p === '14d' ? t('2 нед') : t('1 мес')}
              </button>
            ))}
          </div>
          <button className="btn-primary ai-run-btn" onClick={handleRun} disabled={loading || consented === null}>
            {loading ? <span className="ai-spinner" /> : <Icon name="analyze" size={14} />} {loading ? t('Анализируем…') : t('Проанализировать')}
          </button>
        </div>
      </div>

      {/* The caveat sits with the result it qualifies, not in a topbar popover:
          it only means anything at the moment someone is about to trust the
          analysis. Which metrics are missing is the bell's job. */}
      {gaps.length > 0 && (
        <p className="ai-gaps-caveat">
          <Icon name="warningPlain" size={13} /> {t('Выводы ИИ менее точны при пробелах в данных.')}
        </p>
      )}

      {error && <p className="auth-error" style={{ marginTop: 8 }}>{error}</p>}

      {analyses.length > 0 && (
        <div className="ai-feed">
          {analyses.map(a => (
            <AnalysisCard key={a.id} item={a} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
