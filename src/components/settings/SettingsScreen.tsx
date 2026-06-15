import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { CalendarEvent } from '../../types'
import { loadMonthUsage, loadBudget, saveBudget } from '../../lib/aiUsage'
import { supabase } from '../../lib/supabase'
import { parseICS } from '../../parsers/icsParser'

interface Props {
  user: User
  onGoogleSync?: () => void
  googleLoading?: boolean
  googleConnected?: boolean
  lastSync?: string | null
  onCalEvents?: (events: CalendarEvent[]) => void
}

const SOURCE_LABELS: Record<string, string> = {
  chat: '💬 Чат',
  analyze: '🔍 Анализ данных',
  'extract-lab': '🔬 OCR анализов',
}

export function SettingsScreen({ user, onGoogleSync, googleLoading, googleConnected, lastSync, onCalEvents }: Props) {
  const [cost, setCost] = useState<number | null>(null)
  const [tokens, setTokens] = useState(0)
  const [bySource, setBySource] = useState<Record<string, number>>({})
  const [budget, setBudget] = useState(5)
  const [editVal, setEditVal] = useState('')
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [icsUrl, setIcsUrl] = useState('')
  const [icsLoading, setIcsLoading] = useState(false)
  const [icsMsg, setIcsMsg] = useState<string | null>(null)

  useEffect(() => {
    // Load saved ICS url
    supabase.from('profiles').select('cal_ics_url').eq('id', user.id).single()
      .then(({ data }) => { if (data?.cal_ics_url) setIcsUrl(data.cal_ics_url) })
  }, [user.id])

  async function handleIcsSync() {
    if (!icsUrl.trim()) return
    setIcsLoading(true)
    setIcsMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-ics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session!.access_token}` },
        body: JSON.stringify({ url: icsUrl.trim() }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { ics } = await res.json()
      const events = parseICS(ics)
      onCalEvents?.(events)
      setIcsMsg(`✓ Загружено ${events.length} событий`)
    } catch (e: any) {
      setIcsMsg(`Ошибка: ${e.message}`)
    }
    setIcsLoading(false)
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
        <h3 className="settings-section-title">📆 Cal.com / ICS фид</h3>
        <div className="settings-label" style={{ marginBottom: 8 }}>
          URL фида (.ics) — найди в cal.com: Settings → Calendars → Calendar Feed
        </div>
        <div className="settings-ics-row">
          <input
            className="log-input"
            style={{ flex: 1 }}
            type="url"
            placeholder="https://cal.com/username/feed.ics?apiKey=..."
            value={icsUrl}
            onChange={e => setIcsUrl(e.target.value)}
          />
          <button className="btn-primary" onClick={handleIcsSync} disabled={icsLoading || !icsUrl.trim()} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            {icsLoading ? 'Загрузка…' : 'Синхронизировать'}
          </button>
        </div>
        {icsMsg && <div style={{ marginTop: 8, fontSize: 13, color: icsMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{icsMsg}</div>}
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
