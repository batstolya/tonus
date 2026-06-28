import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { DailyMetrics } from '../../types'
import { callFunction } from '../../lib/edgeFunctions'
import {
  loadResearchData, computeFindings, findingsToText,
  saveResearchRun, loadResearchRuns, deleteResearchRun,
  type Finding, type ResearchRun,
} from '../../lib/research'
import { loadNotesSummary } from '../../lib/chat'
import { computeLevers, confidenceBadge, buildExperimentPrefill, EXPERIMENT_PREFILL_KEY, type Lever } from '../../lib/levers'
import type { AppView } from '../../store/appStore'
import { useT } from '../../lib/i18n'

interface Props { user: User; daily: DailyMetrics[]; onNavigate?: (view: AppView) => void }

type Period = '14d' | '30d' | '90d'

const BADGE: Record<'high' | 'medium' | 'low', { icon: string; title: string }> = {
  high: { icon: '🟢', title: 'высокая уверенность' },
  medium: { icon: '🟡', title: 'средняя уверенность' },
  low: { icon: '🔴', title: 'мало данных' },
}

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
        <span className="research-finding-pair">
          {f.a} {f.kind === 'corr' ? '↔' : '→'} {f.b}
          {f.modifiable === false && <span title={t('внешний фактор')} style={{ marginLeft: 4 }}>🌍</span>}
        </span>
        <span className="research-finding-metric" style={{ color }}>{metric}</span>
      </div>
      <span className="research-finding-n">
        {(() => { const b = BADGE[confidenceBadge(f)]; return <span title={b.title} style={{ marginRight: 6 }}>{b.icon}</span> })()}
        n={f.n}
      </span>
    </div>
  )
}

function LeversBlock({ levers, onTry }: { levers: Lever[]; onTry: (l: Lever) => void }) {
  const { t } = useT()
  if (!levers.length) return null
  return (
    <div className="research-findings" style={{ marginBottom: 20 }}>
      <h3 className="goals-section-title">{t('Что важнее всего')}</h3>
      {levers.map((l, i) => {
        const b = BADGE[l.badge]
        return (
          <div key={i} className="research-finding">
            <div className="research-finding-main">
              <span className="research-finding-pair">{l.factorLabel} → {l.outcomeLabel}</span>
              <span className="research-finding-metric" style={{ color: l.direction === 'neg' ? 'var(--red)' : 'var(--green)' }}>{l.impactText}</span>
            </div>
            <span title={b.title} style={{ marginRight: 8 }}>{b.icon}</span>
            <button className="preset" onClick={() => onTry(l)}>{t('Проверить экспериментом')}</button>
          </div>
        )
      })}
    </div>
  )
}

export function ResearchScreen({ user, daily, onNavigate }: Props) {
  const { t, lang } = useT()
  const [period, setPeriod] = useState<Period>('90d')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runs, setRuns] = useState<ResearchRun[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  useEffect(() => {
    loadResearchRuns(user.id).then(rs => {
      setRuns(rs)
      if (rs.length) setActiveId(rs[0].id)
    }).catch(() => {})
  }, [user.id])

  const active = runs.find(r => r.id === activeId) ?? null
  const levers = active ? computeLevers(active.findings).levers : []

  function tryExperiment(l: Lever) {
    sessionStorage.setItem(EXPERIMENT_PREFILL_KEY, JSON.stringify(buildExperimentPrefill(l)))
    onNavigate?.('experiments')
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'uk' ? 'uk-UA' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  async function handleRun() {
    setLoading(true); setError(null)
    try {
      const days = period === '14d' ? 14 : period === '30d' ? 30 : 90
      const data = await loadResearchData(user.id, daily, days)
      const found = computeFindings(data)

      let reply = ''
      if (found.length === 0) {
        reply = t('Значимых взаимосвязей не найдено. Нужно больше данных — отмечай препараты, события (кофе/алкоголь) и наблюдения по проблемам, и возвращайся через пару недель.')
      } else {
        const notes = await loadNotesSummary(user.id, days)
        const json = await callFunction<{ reply?: string }>('deep-research', {
          findings: findingsToText(found), periodLabel: `${days} ${t('дн')}`, notes: notes || undefined,
        })
        reply = json.reply ?? ''
      }

      const saved = await saveResearchRun(user.id, days, found, reply)
      if (saved) {
        setRuns(prev => [saved, ...prev])
        setActiveId(saved.id)
      } else {
        // таблицы нет — покажем результат без сохранения + подсказку про миграцию
        setMigrationNeeded(true)
        const local: ResearchRun = { id: 'local', period_days: days, findings: found, reply, created_at: new Date().toISOString() }
        setRuns(prev => [local, ...prev.filter(r => r.id !== 'local')])
        setActiveId('local')
      }
    } catch (e: any) {
      setError(e.message ?? t('Ошибка'))
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (id !== 'local') await deleteResearchRun(id)
    setRuns(prev => {
      const next = prev.filter(r => r.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
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

      {migrationNeeded && (
        <div className="auth-error" style={{ marginBottom: 16, fontSize: 13 }}>
          ⚠️ {t('Архив не сохраняется — запусти research.sql в Supabase SQL Editor.')}
        </div>
      )}
      {error && <p className="auth-error">{error}</p>}

      {/* Archive selector */}
      {runs.length > 0 && (
        <div className="research-archive">
          {runs.map(r => (
            <button
              key={r.id}
              className={`research-archive-chip${activeId === r.id ? ' active' : ''}`}
              onClick={() => setActiveId(r.id)}
            >
              <span>{fmtDate(r.created_at)}</span>
              <span className="research-archive-period">{r.period_days} {t('дн')}</span>
              <span className="research-archive-del" onClick={e => { e.stopPropagation(); handleDelete(r.id) }}>✕</span>
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          {active.reply && (
            <div className="insight-card" style={{ marginBottom: 20, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
              {active.reply}
            </div>
          )}
          <LeversBlock levers={levers} onTry={tryExperiment} />
          {active.findings.length > 0 && (
            <div className="research-findings">
              <h3 className="goals-section-title">{t('Найденные связи (по силе)')}</h3>
              {active.findings.map((f, i) => <FindingRow key={i} f={f} />)}
            </div>
          )}
        </>
      )}

      {runs.length === 0 && !loading && (
        <p className="empty-hint">{t('Пока нет исследований. Нажми «Найти взаимосвязи».')}</p>
      )}
    </div>
  )
}
