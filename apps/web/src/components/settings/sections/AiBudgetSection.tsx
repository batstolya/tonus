import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../../lib/i18n'
import { loadMonthUsage, loadBudget, saveBudget } from '../../../lib/aiUsage'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

// These three strings are translation keys, not standalone JSX text: each
// emoji is baked into the ru/uk/en dictionary entries in
// lib/translations/settings.ts and rendered only via `t(SOURCE_LABELS[src])`
// below. Splitting the emoji off into an <Icon> would change the key text
// and silently regress uk/en users to the Russian fallback (translate()
// falls back to source on a missing key) — out of scope here, left for the
// i18n pass, same rationale as QuickLog.tsx's EVENT_TYPES labels. No call
// site in this file renders these glyphs outside of `t()`, so the file does
// not import the icon registry and needs no noEmoji.test.ts exemption.
const SOURCE_LABELS: Record<string, string> = {
  chat: '💬 Чат',
  analyze: '🔍 Анализ данных',
  'extract-lab': '🔬 OCR анализов',
}

export function AiBudgetSection({ archived, onArchive, user }: SectionProps & { user: User }) {
  const { t, locale } = useT()
  const [cost, setCost] = useState<number | null>(null)
  const [tokens, setTokens] = useState(0)
  const [bySource, setBySource] = useState<Record<string, number>>({})
  const [budget, setBudget] = useState(5)
  const [editVal, setEditVal] = useState('')
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadMonthUsage(user.id).then(u => {
      setCost(u.costUsd)
      setTokens(u.totalTokens)
      setBySource(u.bySource)
    })
    loadBudget(user.id).then(setBudget)
  }, [user.id])

  async function handleSaveBudget() {
    const val = parseFloat(editVal)
    if (!isNaN(val) && val > 0) {
      await saveBudget(user.id, val)
      setBudget(val)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setEditing(false)
  }

  const pct = cost !== null ? Math.min((cost / budget) * 100, 100) : 0
  const barColor = pct >= 90 ? 'var(--red)' : pct >= 60 ? '#f59e0b' : 'var(--green)'
  const monthName = new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="ai" onArchive={onArchive} />
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        {t('AI расходы')} — {monthName}
      </h3>

      <div className="settings-budget-bar-track">
        <div className="settings-budget-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>

      <div className="settings-budget-row">
        <span style={{ color: barColor, fontWeight: 600 }}>
          ${cost?.toFixed(3) ?? '—'} {t('потрачено')}
        </span>
        <span className="settings-muted">${Math.max(budget - (cost ?? 0), 0).toFixed(2)} {t('осталось')}</span>
      </div>

      <div className="settings-tokens-row">
        <span className="settings-muted">{tokens.toLocaleString()} {t('токенов использовано')}</span>
      </div>

      {Object.keys(bySource).length > 0 && (
        <div className="settings-by-source">
          {Object.entries(bySource)
            .sort((a, b) => b[1] - a[1])
            .map(([src, tok]) => {
              const srcPct = tokens > 0 ? (tok / tokens) * 100 : 0
              return (
                <div key={src} className="settings-source-item">
                  <div className="settings-source-row">
                    <span>{t(SOURCE_LABELS[src] ?? src)}</span>
                    <span className="settings-muted">{tok.toLocaleString()} {t('токенов')} · {srcPct.toFixed(0)}%</span>
                  </div>
                  <div className="settings-source-bar-track">
                    <div className="settings-source-bar-fill" style={{ width: `${srcPct}%` }} />
                  </div>
                </div>
              )
            })}
        </div>
      )}

      <div className="settings-budget-edit-row">
        <span className="settings-label">{t('Бюджет на месяц')}</span>
        {editing ? (
          <div className="settings-budget-edit">
            <span>$</span>
            <input
              className="settings-budget-input"
              type="number"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveBudget()}
              autoFocus
              min="0.5"
              step="0.5"
            />
            <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={handleSaveBudget}>
              {t('Сохранить')}
            </button>
            <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setEditing(false)}>
              {t('Отмена')}
            </button>
          </div>
        ) : (
          <div className="settings-budget-display">
            <span className="settings-budget-val">${budget.toFixed(2)}</span>
            <button className="link-btn" onClick={() => { setEditVal(String(budget)); setEditing(true) }}>
              {t('Изменить')}
            </button>
            {saved && <span style={{ color: 'var(--green)', fontSize: 13 }}>{t('сохранено')} ✓</span>}
          </div>
        )}
      </div>
    </section>
  )
}
