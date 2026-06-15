import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { CalendarEvent } from '../../types'
import { loadMonthUsage, loadBudget, saveBudget } from '../../lib/aiUsage'
import { supabase } from '../../lib/supabase'

interface Props {
  user: User
  onGoogleSync?: () => void
  googleLoading?: boolean
  googleConnected?: boolean
  lastSync?: string | null
  onCalEvents?: (events: CalendarEvent[]) => void
  onNavigate?: (view: any) => void
}

const SOURCE_LABELS: Record<string, string> = {
  chat: '💬 Чат',
  analyze: '🔍 Анализ данных',
  'extract-lab': '🔬 OCR анализов',
}

export function SettingsScreen({ user, onGoogleSync, googleLoading, googleConnected, lastSync, onCalEvents, onNavigate }: Props) {
  const [cost, setCost] = useState<number | null>(null)
  const [tokens, setTokens] = useState(0)
  const [bySource, setBySource] = useState<Record<string, number>>({})
  const [budget, setBudget] = useState(5)
  const [editVal, setEditVal] = useState('')
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  interface CalAccount { label: string; token: string; loading: boolean; msg: string | null }
  const [calAccounts, setCalAccounts] = useState<CalAccount[]>([{ label: 'Аккаунт 1', token: '', loading: false, msg: null }])

  async function handleCalSync(idx: number) {
    const token = calAccounts[idx].token.trim()
    if (!token) return
    setCalAccounts(prev => prev.map((a, i) => i === idx ? { ...a, loading: true, msg: null } : a))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-cal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session!.access_token}` },
        body: JSON.stringify({ sessionToken: token }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { events, count } = await res.json()
      onCalEvents?.(events)
      setCalAccounts(prev => prev.map((a, i) => i === idx ? { ...a, loading: false, msg: `✓ Загружено ${count} событий` } : a))
      setTimeout(() => onNavigate?.('stress-map'), 1500)
    } catch (e: any) {
      setCalAccounts(prev => prev.map((a, i) => i === idx ? { ...a, loading: false, msg: `Ошибка: ${e.message}` } : a))
    }
  }

  function addCalAccount() {
    setCalAccounts(prev => [...prev, { label: `Аккаунт ${prev.length + 1}`, token: '', loading: false, msg: null }])
  }

  function removeCalAccount(idx: number) {
    setCalAccounts(prev => prev.filter((_, i) => i !== idx))
  }

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

      {onGoogleSync && (
        <section className="settings-section">
          <h3 className="settings-section-title">📅 Google Calendar</h3>
          <div className="settings-cal-row">
            <div>
              <div className="settings-label">Загрузить события из Google Calendar</div>
              {lastSync && <div className="settings-muted" style={{ fontSize: 12, marginTop: 4 }}>Последняя синхронизация: {lastSync}</div>}
            </div>
            <button
              className={`btn-primary ${googleConnected ? 'btn-success' : ''}`}
              onClick={onGoogleSync}
              disabled={googleLoading}
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {googleLoading ? 'Загрузка…' : googleConnected ? '✓ Синхронизировано' : 'Подключить'}
            </button>
          </div>
        </section>
      )}

      <section className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 className="settings-section-title" style={{ margin: 0 }}>📆 Cal.beskarstaff.com</h3>
          <button className="settings-edit-btn" onClick={addCalAccount}>+ Добавить аккаунт</button>
        </div>
        <div className="settings-muted" style={{ marginBottom: 16, fontSize: 12, lineHeight: 1.5 }}>
          F12 → Application → Cookies → <b>__Secure-next-auth.session-token</b>
        </div>
        {calAccounts.map((acc, idx) => (
          <div key={idx} className="cal-account-row">
            <div className="cal-account-header">
              <span className="settings-label">{acc.label}</span>
              {calAccounts.length > 1 && (
                <button className="log-delete" onClick={() => removeCalAccount(idx)}>×</button>
              )}
            </div>
            <div className="settings-ics-row">
              <input
                className="log-input"
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                type="password"
                placeholder="eyJhbGci..."
                value={acc.token}
                onChange={e => setCalAccounts(prev => prev.map((a, i) => i === idx ? { ...a, token: e.target.value } : a))}
              />
              <button className="btn-primary" onClick={() => handleCalSync(idx)} disabled={acc.loading || !acc.token.trim()} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                {acc.loading ? 'Загрузка…' : 'Синхр.'}
              </button>
            </div>
            {acc.msg && <div style={{ marginTop: 6, fontSize: 12, color: acc.msg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{acc.msg}</div>}
          </div>
        ))}
      </section>

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
