import { useState, useEffect } from 'react'
import type { DailyMetrics } from '../../types'
import { runAnalysis, loadAnalyses, type AiAnalysis, type AnalysisPeriod } from '../../lib/aiAnalysis'

interface Props {
  daily: DailyMetrics[]
  userId: string
}

export function AiAnalysisBlock({ daily, userId }: Props) {
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<AnalysisPeriod>('14d')
  const [consented, setConsented] = useState(() => localStorage.getItem('ai_consent') === '1')
  const [showConsent, setShowConsent] = useState(false)

  useEffect(() => {
    loadAnalyses(userId).then(list => { if (list[0]) setAnalysis(list[0]) })
  }, [userId])

  async function handleRun() {
    if (!consented) { setShowConsent(true); return }
    setLoading(true)
    setError(null)
    try {
      const result = await runAnalysis(userId, daily, period)
      setAnalysis(result)
    } catch (e: any) {
      setError(e.message ?? 'Ошибка анализа')
    }
    setLoading(false)
  }

  function handleConsent() {
    localStorage.setItem('ai_consent', '1')
    setConsented(true)
    setShowConsent(false)
    handleRun()
  }

  const fmtDate = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const fmtPeriod = (s: string, e: string) => `${new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${new Date(e).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`

  return (
    <div className="ai-block">
      {showConsent && (
        <div className="ai-consent-overlay" onClick={() => setShowConsent(false)}>
          <div className="ai-consent-card" onClick={e => e.stopPropagation()}>
            <h3>Анализ данных через ИИ</h3>
            <p>Для анализа агрегированный дайджест твоих данных здоровья (средние значения, тренды) будет отправлен в Google Gemini API. Сырые данные и персональная информация не передаются.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Нажимая «Согласен», ты подтверждаешь отправку данных во внешний сервис.</p>
            <div className="ai-consent-btns">
              <button className="btn-primary" onClick={handleConsent}>Согласен</button>
              <button className="btn-ghost" onClick={() => setShowConsent(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      <div className="ai-block-header">
        <h3>ИИ-анализ</h3>
        <div className="ai-controls">
          <div className="presets" style={{ marginBottom: 0 }}>
            {(['14d', '30d'] as AnalysisPeriod[]).map(p => (
              <button key={p} className={period === p ? 'preset active' : 'preset'} onClick={() => setPeriod(p)}>
                {p === '14d' ? '2 нед' : '1 мес'}
              </button>
            ))}
          </div>
          <button className="btn-primary ai-run-btn" onClick={handleRun} disabled={loading}>
            {loading ? <span className="ai-spinner" /> : '✦'} {loading ? 'Анализируем…' : 'Проанализировать'}
          </button>
        </div>
      </div>

      {error && <p className="auth-error" style={{ marginTop: 8 }}>{error}</p>}

      {analysis && (
        <div className="ai-result">
          <p className="ai-meta">
            Анализ от {fmtDate(analysis.created_at)} · {fmtPeriod(analysis.period_start, analysis.period_end)}
          </p>
          <p className="ai-summary">{analysis.summary}</p>
          {analysis.good.length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label good">Что хорошо</span>
              <ul>{analysis.good.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          {analysis.improve.length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label improve">Что улучшить</span>
              <ul>{analysis.improve.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          {analysis.focus.length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label focus">Фокус</span>
              <ul>{analysis.focus.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
