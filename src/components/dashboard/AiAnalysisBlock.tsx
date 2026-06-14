import { useState, useEffect } from 'react'
import type { DailyMetrics } from '../../types'
import { runAnalysis, loadAnalyses, deleteAnalysis, type AiAnalysis, type AnalysisPeriod } from '../../lib/aiAnalysis'

interface Props {
  daily: DailyMetrics[]
  userId: string
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtPeriod(s: string, e: string) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${new Date(s).toLocaleDateString('ru-RU', opts)} — ${new Date(e).toLocaleDateString('ru-RU', opts)}`
}

function AnalysisCard({ item, onDelete }: { item: AiAnalysis; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`ai-card${open ? ' open' : ''}`}>
      <div className="ai-card-header" onClick={() => setOpen(o => !o)}>
        <div className="ai-card-meta">
          <span className="ai-card-date">{fmtDate(item.created_at)}</span>
          <span className="ai-card-period">{fmtPeriod(item.period_start, item.period_end)}</span>
        </div>
        <div className="ai-card-actions">
          <button className="ai-card-delete" onClick={e => { e.stopPropagation(); onDelete(item.id) }} title="Удалить">
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
              <span className="ai-section-label good">Что хорошо</span>
              <ul>{item.good.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          {item.improve.length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label improve">Что улучшить</span>
              <ul>{item.improve.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          {item.focus.length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label focus">Фокус</span>
              <ul>{item.focus.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AiAnalysisBlock({ daily, userId }: Props) {
  const [analyses, setAnalyses] = useState<AiAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<AnalysisPeriod>('14d')
  const [consented, setConsented] = useState(() => localStorage.getItem('ai_consent') === '1')
  const [showConsent, setShowConsent] = useState(false)

  useEffect(() => {
    loadAnalyses(userId).then(setAnalyses)
  }, [userId])

  async function handleRun() {
    if (!consented) { setShowConsent(true); return }
    setLoading(true)
    setError(null)
    try {
      const result = await runAnalysis(userId, daily, period)
      setAnalyses(prev => [result, ...prev])
    } catch (e: any) {
      setError(e.message ?? 'Ошибка анализа')
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    await deleteAnalysis(id)
    setAnalyses(prev => prev.filter(a => a.id !== id))
  }

  function handleConsent() {
    localStorage.setItem('ai_consent', '1')
    setConsented(true)
    setShowConsent(false)
    setTimeout(handleRun, 0)
  }

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
