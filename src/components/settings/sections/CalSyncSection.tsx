import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { CalendarEvent } from '../../../types'
import type { AppView } from '../../../store/appStore'
import { useT } from '../../../lib/i18n'
import { getCalSyncStatus, type CalSyncStatus } from '../../../lib/api/settings'
import { callFunction } from '../../../lib/edgeFunctions'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

interface Props extends SectionProps {
  user: User
  onCalEvents?: (events: CalendarEvent[]) => void
  onNavigate?: (view: AppView) => void
}

export function CalSyncSection({ archived, onArchive, user, onCalEvents, onNavigate }: Props) {
  const { t, locale } = useT()
  const [calToken, setCalToken] = useState('')
  const [calLoading, setCalLoading] = useState(false)
  const [calMsg, setCalMsg] = useState<string | null>(null)
  const [calEmail, setCalEmail] = useState('')
  const [calPassword, setCalPassword] = useState('')
  const [calStatus, setCalStatus] = useState<CalSyncStatus | null>(null)
  const [editingCal, setEditingCal] = useState(false)

  async function handleCalSync() {
    const token = calToken.trim()
    if (!token) return
    setCalLoading(true)
    setCalMsg(null)
    try {
      const { events, count } = await callFunction<{ events: CalendarEvent[]; count: number }>('fetch-cal', { sessionToken: token })
      onCalEvents?.(events)
      setCalMsg(`✓ ${t('Загружено')} ${count} ${t('событий')}`)
      setCalToken('')
      setTimeout(() => onNavigate?.('stress-map'), 1500)
    } catch (e) {
      setCalMsg(`${t('Ошибка')}: ${(e as Error).message}`)
    }
    setCalLoading(false)
  }

  async function refreshCalStatus() {
    setCalStatus(await getCalSyncStatus(user.id))
  }

  async function handleCalSaveAndSync() {
    if (!calEmail.trim() || !calPassword) return
    setCalLoading(true); setCalMsg(null)
    try {
      const { count, events } = await callFunction<{ count: number; events: CalendarEvent[] }>('sync-cal', { email: calEmail.trim(), password: calPassword })
      onCalEvents?.(events)
      setCalMsg(`✓ ${t('Сохранено и загружено')} ${count} ${t('событий')}`)
      setCalPassword('')
      setEditingCal(false)
      await refreshCalStatus()
      setTimeout(() => onNavigate?.('stress-map'), 1500)
    } catch (e) {
      setCalMsg(`${t('Ошибка')}: ${(e as Error).message}`)
    }
    setCalLoading(false)
  }

  async function handleCalSyncNow() {
    setCalLoading(true); setCalMsg(null)
    try {
      const { count, events } = await callFunction<{ count: number; events: CalendarEvent[] }>('sync-cal', {})
      onCalEvents?.(events)
      setCalMsg(`✓ ${t('Загружено')} ${count} ${t('событий')}`)
      setTimeout(() => onNavigate?.('stress-map'), 1500)
    } catch (e) {
      setCalMsg(`${t('Ошибка')}: ${(e as Error).message}`)
    }
    setCalLoading(false)
  }

  async function handleCalToggle(enabled: boolean) {
    setCalStatus(s => s ? { ...s, enabled } : s)
    try { await callFunction('sync-cal', { enabled }) } catch { /* status reloads on next mount */ }
  }

  useEffect(() => {
    getCalSyncStatus(user.id).then(setCalStatus)
  }, [user.id])

  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="cal" onArchive={onArchive} />
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01"/></svg>
        Cal.beskarstaff.com
      </h3>
      {calStatus?.cal_email && !editingCal ? (
        // ── Подключено: компактный вид (без логин-формы) ──
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--green)', fontWeight: 600, fontSize: 14 }}>
            ✓ {t('Подключён:')} {calStatus.cal_email}
          </div>
          {calStatus.last_sync_at && (
            <div className="settings-muted" style={{ fontSize: 13, marginBottom: 10 }}>
              {t('Последняя синхронизация:')} {new Date(calStatus.last_sync_at).toLocaleString(locale)} · {calStatus.event_count ?? 0} {t('событий')}
              {calStatus.last_status && calStatus.last_status !== 'ok' && <span style={{ color: 'var(--red)' }}> · {calStatus.last_status}</span>}
            </div>
          )}
          <label className="settings-muted" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13 }}>
            <input type="checkbox" checked={calStatus.enabled} onChange={e => handleCalToggle(e.target.checked)} />
            {t('Авто-синк раз в день')}
          </label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn-secondary" onClick={handleCalSyncNow} disabled={calLoading}>
              {calLoading ? t('Загрузка…') : t('Синхронизировать сейчас')}
            </button>
            <button className="link-btn" onClick={() => { setEditingCal(true); setCalMsg(null) }}>{t('Сменить аккаунт')}</button>
          </div>
        </>
      ) : (
        // ── Не подключено или смена аккаунта: форма входа ──
        <>
          <div className="settings-muted" style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
            {calStatus?.cal_email
              ? t('Аккаунт подключён, синхронизация раз в день. Чтобы сменить аккаунт — введи новые данные ниже.')
              : t('Введи логин и пароль cal.com — синхронизация будет автоматической раз в день. Пароль хранится зашифрованно.')}
          </div>
          <div className="settings-ics-row" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
            <input className="settings-input" type="email" placeholder={calStatus?.cal_email || 'email@cal.com'}
              value={calEmail} onChange={e => setCalEmail(e.target.value)} />
            <input className="settings-input" type="password" placeholder={t('Пароль cal.com')}
              value={calPassword} onChange={e => setCalPassword(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleCalSaveAndSync}
                disabled={calLoading || !calEmail.trim() || !calPassword}>
                {calLoading ? t('Загрузка…') : t('Сохранить и синхронизировать')}
              </button>
              <button className="btn-secondary" onClick={handleCalSyncNow} disabled={calLoading}>
                {t('Синхронизировать сейчас')}
              </button>
            </div>
          </div>
          <div className="settings-muted" style={{ margin: '14px 0 6px', fontSize: 13, fontWeight: 600 }}>
            {t('Резервный способ — вход по session-токену:')}
          </div>
          <div className="settings-muted" style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
            F12 → Application → Cookies → <b>__Secure-next-auth.session-token</b>. {t('Токен очищается после загрузки — можно вставить второй аккаунт следом.')}
          </div>
          <div className="settings-ics-row">
            <input
              className="settings-input"
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              type="password"
              placeholder="eyJhbGci..."
              value={calToken}
              onChange={e => setCalToken(e.target.value)}
            />
            <button className="btn-primary" onClick={handleCalSync} disabled={calLoading || !calToken.trim()} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {calLoading ? t('Загрузка…') : t('Синхронизировать')}
            </button>
          </div>
          {calStatus?.cal_email && (
            <button className="link-btn" style={{ marginTop: 10 }} onClick={() => { setEditingCal(false); setCalMsg(null) }}>{t('Отмена')}</button>
          )}
        </>
      )}
      {calMsg && <div style={{ marginTop: 8, fontSize: 13, color: calMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{calMsg}</div>}
    </section>
  )
}
