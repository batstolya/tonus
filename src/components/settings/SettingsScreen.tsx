import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { loadMonthUsage, loadBudget, saveBudget } from '../../lib/aiUsage'

interface Props { user: User }

const SOURCE_LABELS: Record<string, string> = {
  chat: '💬 Чат',
  analyze: '🔍 Анализ данных',
  'extract-lab': '🔬 OCR анализов',
}

export function SettingsScreen({ user }: Props) {
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
  const now = new Date()
  const monthName = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  return (
    <div className="settings-screen">
      <h2>Настройки</h2>

      <section className="settings-section">
        <h3 className="settings-section-title">🤖 AI расходы — {monthName}</h3>

        <div className="settings-budget-bar-track">
          <div className="settings-budget-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
        </div>

        <div className="settings-budget-row">
          <span style={{ color: barColor, fontWeight: 600 }}>
            ${cost?.toFixed(3) ?? '—'} потрачено
          </span>
          <span className="settings-muted">${Math.max(budget - (cost ?? 0), 0).toFixed(2)} осталось</span>
        </div>

        <div className="settings-tokens-row">
          <span className="settings-muted">{tokens.toLocaleString()} токенов использовано</span>
        </div>

        {Object.keys(bySource).length > 0 && (
          <div className="settings-by-source">
            {Object.entries(bySource).map(([src, t]) => (
              <div key={src} className="settings-source-row">
                <span>{SOURCE_LABELS[src] ?? src}</span>
                <span className="settings-muted">{t.toLocaleString()} токенов</span>
              </div>
            ))}
          </div>
        )}

        <div className="settings-budget-edit-row">
          <span className="settings-label">Бюджет на месяц</span>
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
                Сохранить
              </button>
              <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setEditing(false)}>
                Отмена
              </button>
            </div>
          ) : (
            <div className="settings-budget-display">
              <span className="settings-budget-val">${budget.toFixed(2)}</span>
              <button className="settings-edit-btn" onClick={() => { setEditVal(String(budget)); setEditing(true) }}>
                Изменить
              </button>
              {saved && <span style={{ color: 'var(--green)', fontSize: 12 }}>сохранено ✓</span>}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
