import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { DailyMetrics } from '../../types'
import { supabase } from '../../lib/supabase'
import { loadResearchData, computeFindings, findingsToText, type Finding } from '../../lib/research'
import { loadNotesSummary } from '../../lib/chat'
import { useT } from '../../lib/i18n'

interface Props { user: User; daily: DailyMetrics[] }

type Period = '14d' | '30d' | '90d'

function FindingRow({ f }: { f: Finding }) {
  const { t } = useT()
  const strong = f.strength >= 0.7
  const med = f.strength >= 0.5
  const color = strong ? 'var(--red)' : med ? '#f59e0b' : 'var(--green)'
  let metric: string
  if (f.kind === 'corr') {
    metric = `r = ${f.r!.toFixed(2)}`
  } else {
    const sign = f.delta! > 0 ? '+' : ''
    metric = `${sign}${f.delta!.toFixed(1)}${f.lag === 1 ? ` (${t('след. день')})` : ''}`
  }
  return (
    <div className="research-finding">
      <div className="research-finding-main">
        <span className="research-finding-pair">{f.a} {f.kind === 'corr' ? '↔' : '→'} {f.b}</span>
        <span className="research-finding-metric" style={{ color }}>{metric}</span>
      </div>
      <span className="research-finding-n">n={f.n}</span>
    </div>
  )
}

export function ResearchScreen({ user, daily }: Props) {
  const { t } = useT()
  const [period, setPeriod] = useState<Period>('90d')
  const [loading, setLoading] = useState(false)
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [reply, setReply] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    setLoading(true); setError(null); setReply(''); setFindings(null)
    try {
      const days = period === '14d' ? 14 : period === '30d' ? 30 : 90
      const data = await loadResearchData(user.id, daily, days)
      const found = computeFindings(data)
      setFindings(found)

      if (found.length === 0) {
        setReply(t('Значимых взаимосвязей не найдено. Нужно больше данных — отмечай препараты, события (кофе/алкоголь) и наблюдения по проблемам, и возвращайся через пару недель.'))
        setLoading(false)
        return
      }

      const notes = await loadNotesSummary(user.id, days)
      const { data: { session } } = await supabase.auth.getSession()
      const url = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${url}/functions/v1/deep-research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session!.access_token}` },
        body: JSON.stringify({ findings: findingsToText(found), periodLabel: `${days} ${t('дн')}`, notes: notes || undefined }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setReply(json.reply ?? '')
    } catch (e: any) {
      setError(e.message ?? t('Ошибка'))
    }
    setLoading(false)
  }

  return (
    <div className="screen">
      <div className="goals-header">
        <h2>{t('Исследования')}</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="presets" style={{ marginBottom: 0 }}>
            {(['14d', '30d', '90d'] as Period[]).map(p => (
              <button key={p} className={period === p ? 'preset active' : 'preset'} onClick={() => setPeriod(p)} disabled={loading}>
                {p.replace('d', ` ${t('дн')}`)}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={handleRun} disabled={loading}>
            {loading ? <><span className="ai-spinner" /> {t('Анализируем…')}</> : `🔍 ${t('Найти взаимосвязи')}`}
          </button>
        </div>
      </div>

      <p className="screen-hint" style={{ marginBottom: 16 }}>
        {t('Считаю статистические связи между сном, пульсом, активностью, препаратами, событиями и проблемами — затем ИИ объясняет находки. Корреляция ≠ причинность.')}
      </p>

      {error && <p className="auth-error">{error}</p>}

      {reply && (
        <div className="insight-card" style={{ marginBottom: 20, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
          {reply}
        </div>
      )}

      {findings && findings.length > 0 && (
        <div className="research-findings">
          <h3 className="goals-section-title">{t('Найденные связи (по силе)')}</h3>
          {findings.map((f, i) => <FindingRow key={i} f={f} />)}
        </div>
      )}
    </div>
  )
}
