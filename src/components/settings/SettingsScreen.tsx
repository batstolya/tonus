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
  calLastSync?: string | null
  onCalEvents?: (events: CalendarEvent[]) => void
  onNavigate?: (view: any) => void
}

const SOURCE_LABELS: Record<string, string> = {
  chat: '💬 Чат',
  analyze: '🔍 Анализ данных',
  'extract-lab': '🔬 OCR анализов',
}

export function SettingsScreen({ user, onGoogleSync, googleLoading, googleConnected, lastSync, calLastSync, onCalEvents, onNavigate }: Props) {
  const [cost, setCost] = useState<number | null>(null)
  const [tokens, setTokens] = useState(0)
  const [bySource, setBySource] = useState<Record<string, number>>({})
  const [budget, setBudget] = useState(5)
  const [editVal, setEditVal] = useState('')
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [calToken, setCalToken] = useState('')
  const [calLoading, setCalLoading] = useState(false)
  const [calMsg, setCalMsg] = useState<string | null>(null)
  const [tgLinked, setTgLinked] = useState(false)
  const [tgUsername, setTgUsername] = useState<string | null>(null)
  const [tgLinking, setTgLinking] = useState(false)
  const [tgMsg, setTgMsg] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('telegram_links').select('telegram_chat_id, telegram_username, status')
      .eq('user_id', user.id).eq('status', 'active').maybeSingle()
      .then(({ data }) => {
        if (data) { setTgLinked(true); setTgUsername(data.telegram_username) }
      })
  }, [user.id])

  async function handleTgConnect() {
    setTgLinking(true)
    setTgMsg(null)
    try {
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      await supabase.from('telegram_link_tokens').insert({ token, user_id: user.id, expires_at: expires })
      const botName = import.meta.env.VITE_TELEGRAM_BOT_NAME ?? 'tonus_health_bot'
      const url = `https://t.me/${botName}?start=${token}`
      window.open(url, '_blank')
      setTgMsg('Открыли Telegram. После нажатия Start аккаунт привяжется автоматически.')
      // Poll for 60s
      const interval = setInterval(async () => {
        const { data } = await supabase.from('telegram_links').select('telegram_username').eq('user_id', user.id).eq('status', 'active').maybeSingle()
        if (data) { setTgLinked(true); setTgUsername(data.telegram_username); setTgMsg(null); clearInterval(interval) }
      }, 3000)
      setTimeout(() => clearInterval(interval), 60000)
    } catch (e: any) {
      setTgMsg(`Ошибка: ${e.message}`)
    }
    setTgLinking(false)
  }

  async function handleTgDisconnect() {
    await supabase.from('telegram_links').update({ status: 'paused' }).eq('user_id', user.id)
    setTgLinked(false)
    setTgUsername(null)
    setTgMsg('Telegram отключён.')
  }

  async function handleCalSync() {
    const token = calToken.trim()
    if (!token) return
    setCalLoading(true)
    setCalMsg(null)
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
      setCalMsg(`✓ Загружено ${count} событий`)
      setCalToken('')
      setTimeout(() => onNavigate?.('stress-map'), 1500)
    } catch (e: any) {
      setCalMsg(`Ошибка: ${e.message}`)
    }
    setCalLoading(false)
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

      <section className="settings-section">
        <h3 className="settings-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Telegram
        </h3>
        <div className="settings-cal-row">
          <div>
            {tgLinked
              ? <div className="settings-label">✓ Подключён{tgUsername ? ` (@${tgUsername})` : ''}</div>
              : <div className="settings-label">Получать двухнедельные отчёты в Telegram</div>
            }
            <div className="settings-muted" style={{ fontSize: 12, marginTop: 4 }}>
              {tgLinked ? 'Команды: /report /last /status /pause' : 'Нажми — откроется бот, нажми Start'}
            </div>
          </div>
          {tgLinked ? (
            <button className="btn-secondary" onClick={handleTgDisconnect} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              Отключить
            </button>
          ) : (
            <button className="btn-primary" onClick={handleTgConnect} disabled={tgLinking} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {tgLinking ? 'Открываем…' : 'Подключить Telegram'}
            </button>
          )}
        </div>
        {tgMsg && <div style={{ marginTop: 8, fontSize: 13, color: tgMsg.startsWith('Ошибка') ? 'var(--red)' : 'var(--text-muted)' }}>{tgMsg}</div>}
      </section>

      {onGoogleSync && (
        <section className="settings-section">
          <h3 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Google Calendar
          </h3>
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
        <h3 className="settings-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01"/></svg>
          Cal.beskarstaff.com
        </h3>
        {calLastSync && (
          <div className="settings-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Последняя синхронизация: {calLastSync}
          </div>
        )}
        <div className="settings-muted" style={{ marginBottom: 12, fontSize: 12, lineHeight: 1.5 }}>
          F12 → Application → Cookies → <b>__Secure-next-auth.session-token</b>. Токен очищается после загрузки — можно вставить второй аккаунт следом.
        </div>
        <div className="settings-ics-row">
          <input
            className="log-input"
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
            type="password"
            placeholder="eyJhbGci..."
            value={calToken}
            onChange={e => setCalToken(e.target.value)}
          />
          <button className="btn-primary" onClick={handleCalSync} disabled={calLoading || !calToken.trim()} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            {calLoading ? 'Загрузка…' : 'Синхронизировать'}
          </button>
        </div>
        {calMsg && <div style={{ marginTop: 8, fontSize: 13, color: calMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{calMsg}</div>}
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          AI расходы — {monthName}
        </h3>

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
