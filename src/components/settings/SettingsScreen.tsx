import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { CalendarEvent } from '../../types'
import { loadMonthUsage, loadBudget, saveBudget } from '../../lib/aiUsage'
import { loadDailyNoteSettings, saveDailyNoteSettings } from '../../lib/dailyNote'
import { loadReportSettings, saveReportSettings, type ReportSettings } from '../../lib/reportSettings'
import { exportAllJSON, exportMetricsCSV } from '../../lib/exportData'
import { AutoSyncSettings } from './AutoSyncSettings'
import { WorkoutScheduleSettings } from './WorkoutScheduleSettings'
import { useT, LANGS } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/edgeFunctions'
import type { DeviceType } from '../../store/appStore'
import { ConnectGuide } from '../onboarding/ConnectGuide'
import { clearGuideProgress } from '../onboarding/guideState'
import { isDemoActive } from '../../lib/demo'

interface Props {
  user: User
  onGoogleSync?: () => void
  googleLoading?: boolean
  googleConnected?: boolean
  lastSync?: string | null
  calLastSync?: string | null
  onCalEvents?: (events: CalendarEvent[]) => void
  onNavigate?: (view: any) => void
  deviceType?: DeviceType | null
  onDeviceTypeChange?: (d: DeviceType) => void
}

const SOURCE_LABELS: Record<string, string> = {
  chat: '💬 Чат',
  analyze: '🔍 Анализ данных',
  'extract-lab': '🔬 OCR анализов',
}

// Заголовки секций для списка «Архив» (стабильный id → ключ перевода)
const SECTION_TITLES: Record<string, string> = {
  language: 'Язык интерфейса',
  telegram: 'Telegram',
  reports: 'Отчёты в Telegram',
  google: 'Google Calendar',
  cal: 'Cal.beskarstaff.com',
  ai: 'AI расходы',
  import: 'Импорт данных',
  autosync: 'Авто-синхронизация (Apple Health)',
  environment: 'Данные среды',
  device: 'Устройство',
  export: 'Экспорт данных',
}

function ArchiveBtn({ id, onArchive }: { id: string; onArchive: (id: string) => void }) {
  const { t } = useT()
  return (
    <button
      type="button"
      className="section-archive-btn"
      title={t('В архив')}
      aria-label={t('В архив')}
      onClick={() => onArchive(id)}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/></svg>
    </button>
  )
}

export function SettingsScreen({ user, onGoogleSync, googleLoading, googleConnected, lastSync, onCalEvents, onNavigate, deviceType, onDeviceTypeChange }: Props) {
  const { t, lang, setLang, locale } = useT()
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
  const [calEmail, setCalEmail] = useState('')
  const [calPassword, setCalPassword] = useState('')
  const [calStatus, setCalStatus] = useState<{ cal_email: string | null; last_sync_at: string | null; last_status: string | null; event_count: number | null; enabled: boolean } | null>(null)
  const [editingCal, setEditingCal] = useState(false)
  const [tgLinked, setTgLinked] = useState(false)
  const [tgUsername, setTgUsername] = useState<string | null>(null)
  const [tgLinking, setTgLinking] = useState(false)
  const [tgMsg, setTgMsg] = useState<string | null>(null)
  const [noteEnabled, setNoteEnabled] = useState(false)
  const [noteTime, setNoteTime] = useState('21:00')
  const [rep, setRep] = useState<ReportSettings | null>(null)
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)
  const [envSyncing, setEnvSyncing] = useState(false)
  const [envMsg, setEnvMsg] = useState<string | null>(null)
  const [locLabel, setLocLabel] = useState<string | null>(null)
  const [locQuery, setLocQuery] = useState('')
  const [locResults, setLocResults] = useState<Array<{ name: string; country?: string; admin1?: string; latitude: number; longitude: number }>>([])
  const [locSearching, setLocSearching] = useState(false)
  const [locLocating, setLocLocating] = useState(false)
  const [locMsg, setLocMsg] = useState<string | null>(null)
  const [editingLoc, setEditingLoc] = useState(false)
  const [archivedSections, setArchivedSections] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('settings_archived') ?? '[]') } catch { return [] }
  })
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const isArchived = (id: string) => archivedSections.includes(id)
  function persistArchived(next: string[]) {
    localStorage.setItem('settings_archived', JSON.stringify(next))
    setArchivedSections(next)
  }
  const archiveSection = (id: string) => { if (!archivedSections.includes(id)) persistArchived([...archivedSections, id]) }
  const restoreSection = (id: string) => persistArchived(archivedSections.filter(x => x !== id))

  async function handleSyncEnvironment() {
    setEnvSyncing(true)
    setEnvMsg(null)
    try {
      const json = await callFunction<{ synced?: number }>('fetch-environment', {})
      setEnvMsg(json.synced ? `✅ ${t('Синхронизировано')} ${json.synced} ${t('дн')}` : t('Ошибка'))
    } catch (e: any) {
      setEnvMsg(`${t('Ошибка')}: ${e.message}`)
    }
    setEnvSyncing(false)
  }

  async function handleLocationSearch() {
    const q = locQuery.trim()
    if (!q) return
    setLocSearching(true); setLocMsg(null); setLocResults([])
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=${lang}&format=json`)
      const data = await res.json()
      const results = (data.results ?? []).map((r: { name: string; country?: string; admin1?: string; latitude: number; longitude: number }) => ({ name: r.name, country: r.country, admin1: r.admin1, latitude: r.latitude, longitude: r.longitude }))
      setLocResults(results)
      if (!results.length) setLocMsg(t('Город не найден'))
    } catch {
      setLocMsg(t('Ошибка'))
    }
    setLocSearching(false)
  }

  async function handleLocationPick(r: { name: string; country?: string; admin1?: string; latitude: number; longitude: number }) {
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ')
    const { error } = await supabase.from('profiles').upsert({ id: user.id, latitude: r.latitude, longitude: r.longitude, location_label: label })
    if (error) { setLocMsg(`${t('Ошибка')}: ${error.message}`); return }
    setLocLabel(label); setLocResults([]); setLocQuery(''); setEditingLoc(false); setLocMsg(`✅ ${t('Локация определена')}`)
  }

  // Запрашиваем доступ к геолокации браузера и сами определяем место (обратный геокодер)
  function handleUseMyLocation() {
    if (!navigator.geolocation) { setLocMsg(t('Геолокация недоступна в браузере')); return }
    setLocLocating(true); setLocMsg(t('Запрашиваю доступ к геолокации…')); setLocResults([])
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        let label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`
        try {
          // BigDataCloud reverse-geocode — бесплатно, без ключа, CORS-friendly
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=${lang}`)
          const g = await res.json()
          const parts = [g.city || g.locality, g.principalSubdivision, g.countryName].filter(Boolean)
          if (parts.length) label = parts.join(', ')
        } catch { /* без названия — оставим координаты */ }
        const { error } = await supabase.from('profiles').upsert({ id: user.id, latitude, longitude, location_label: label })
        setLocLocating(false)
        if (error) { setLocMsg(`${t('Ошибка')}: ${error.message}`); return }
        setLocLabel(label); setLocResults([]); setLocQuery(''); setEditingLoc(false); setLocMsg(`✅ ${t('Локация определена')}`)
      },
      (err) => {
        setLocLocating(false)
        setLocMsg(err.code === err.PERMISSION_DENIED ? t('Доступ к геолокации запрещён') : t('Не удалось определить местоположение'))
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  }

  async function handleExport(kind: 'json' | 'csv') {
    setExporting(kind)
    try {
      if (kind === 'json') await exportAllJSON(user.id)
      else await exportMetricsCSV(user.id)
    } catch { /* ignore */ }
    setExporting(null)
  }

  useEffect(() => {
    supabase.from('telegram_links').select('telegram_chat_id, telegram_username, status')
      .eq('user_id', user.id).eq('status', 'active').maybeSingle()
      .then(({ data }) => {
        if (data) { setTgLinked(true); setTgUsername(data.telegram_username) }
      })
    loadDailyNoteSettings(user.id).then(s => { setNoteEnabled(s.enabled); setNoteTime(s.time) }).catch(() => {})
    loadReportSettings(user.id).then(setRep).catch(() => {})
  }, [user.id])

  // Локация: сразу показываем сохранённую подпись, затем освежаем её в текущем
  // языке интерфейса по сохранённым координатам. Раньше подпись сохранялась на
  // языке момента (напр. русском) и «застревала» на нём при смене языка.
  useEffect(() => {
    let cancelled = false
    supabase.from('profiles').select('location_label, latitude, longitude').eq('id', user.id).maybeSingle()
      .then(async ({ data }) => {
        if (cancelled || !data) return
        if (data.location_label) setLocLabel(data.location_label)
        if (data.latitude == null || data.longitude == null) return
        try {
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${data.latitude}&longitude=${data.longitude}&localityLanguage=${lang}`)
          const g = await res.json()
          const parts = [g.city || g.locality, g.principalSubdivision, g.countryName].filter(Boolean)
          const label = parts.join(', ')
          if (!cancelled && label && label !== data.location_label) {
            setLocLabel(label)
            // без await builder supabase-js не выполняется — запрос бы не ушёл
            await supabase.from('profiles').update({ location_label: label }).eq('id', user.id)
          }
        } catch { /* нет сети/геокодера — оставляем сохранённую подпись */ }
      })
    return () => { cancelled = true }
  }, [user.id, lang])

  function patchRep(patch: Partial<ReportSettings>) {
    setRep(r => r ? { ...r, ...patch } : r)
    saveReportSettings(user.id, patch)
  }

  function handleNoteToggle(enabled: boolean) {
    setNoteEnabled(enabled)
    saveDailyNoteSettings(user.id, { enabled, time: noteTime })
  }
  function handleNoteTime(time: string) {
    setNoteTime(time)
    saveDailyNoteSettings(user.id, { enabled: noteEnabled, time })
  }

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
      const { events, count } = await callFunction<{ events: any[]; count: number }>('fetch-cal', { sessionToken: token })
      onCalEvents?.(events)
      setCalMsg(`✓ ${t('Загружено')} ${count} ${t('событий')}`)
      setCalToken('')
      setTimeout(() => onNavigate?.('stress-map'), 1500)
    } catch (e: any) {
      setCalMsg(`${t('Ошибка')}: ${e.message}`)
    }
    setCalLoading(false)
  }

  async function refreshCalStatus() {
    const { data } = await supabase.from('cal_sync')
      .select('cal_email, last_sync_at, last_status, event_count, enabled')
      .eq('user_id', user.id).maybeSingle()
    setCalStatus(data ?? null)
  }

  async function handleCalSaveAndSync() {
    if (!calEmail.trim() || !calPassword) return
    setCalLoading(true); setCalMsg(null)
    try {
      const { count, events } = await callFunction<{ count: number; events: any[] }>('sync-cal', { email: calEmail.trim(), password: calPassword })
      onCalEvents?.(events)
      setCalMsg(`✓ ${t('Сохранено и загружено')} ${count} ${t('событий')}`)
      setCalPassword('')
      setEditingCal(false)
      await refreshCalStatus()
      setTimeout(() => onNavigate?.('stress-map'), 1500)
    } catch (e: any) {
      setCalMsg(`${t('Ошибка')}: ${e.message}`)
    }
    setCalLoading(false)
  }

  async function handleCalSyncNow() {
    setCalLoading(true); setCalMsg(null)
    try {
      const { count, events } = await callFunction<{ count: number; events: any[] }>('sync-cal', {})
      onCalEvents?.(events)
      setCalMsg(`✓ ${t('Загружено')} ${count} ${t('событий')}`)
      setTimeout(() => onNavigate?.('stress-map'), 1500)
    } catch (e: any) {
      setCalMsg(`${t('Ошибка')}: ${e.message}`)
    }
    setCalLoading(false)
  }

  async function handleCalToggle(enabled: boolean) {
    setCalStatus(s => s ? { ...s, enabled } : s)
    try { await callFunction('sync-cal', { enabled }) } catch { /* status reloads on next mount */ }
  }

  useEffect(() => {
    supabase.from('cal_sync')
      .select('cal_email, last_sync_at, last_status, event_count, enabled')
      .eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setCalStatus(data ?? null))
  }, [user.id])

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
  const monthName = now.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  return (
    <div className="settings-screen">
      <h2>{t('Настройки')}</h2>

      <section className={`settings-section${isArchived('language') ? ' is-archived' : ''}`}>
        <ArchiveBtn id="language" onArchive={archiveSection} />
        <h3 className="settings-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          {t('Язык интерфейса')}
        </h3>
        <div className="rep-seg">
          {LANGS.map(l => (
            <button
              key={l.code}
              className={`rep-seg-btn${lang === l.code ? ' on' : ''}`}
              onClick={() => setLang(l.code)}
            >{l.flag} {l.label}</button>
          ))}
        </div>
      </section>

      <section className={`settings-section${isArchived('telegram') ? ' is-archived' : ''}`}>
        <ArchiveBtn id="telegram" onArchive={archiveSection} />
        <h3 className="settings-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Telegram
        </h3>
        <div className="settings-cal-row">
          <div>
            {tgLinked
              ? <div className="settings-label">✓ {t('Подключён')}{tgUsername ? ` (@${tgUsername})` : ''}</div>
              : <div className="settings-label">{t('Получать двухнедельные отчёты в Telegram')}</div>
            }
            <div className="settings-muted" style={{ fontSize: 12, marginTop: 4 }}>
              {tgLinked ? t('Команды: /report /last /status /pause') : t('Нажми — откроется бот, нажми Start')}
            </div>
          </div>
          {tgLinked ? (
            <button className="btn-secondary" onClick={handleTgDisconnect} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {t('Отключить')}
            </button>
          ) : (
            <button className="btn-primary" onClick={handleTgConnect} disabled={tgLinking} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {tgLinking ? t('Открываем…') : t('Подключить Telegram')}
            </button>
          )}
        </div>
        {tgMsg && <div style={{ marginTop: 8, fontSize: 13, color: tgMsg.startsWith('Ошибка') ? 'var(--red)' : 'var(--text-muted)' }}>{tgMsg}</div>}

        {tgLinked && (
          <div className="settings-cal-row" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div>
              <label className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={noteEnabled} onChange={e => handleNoteToggle(e.target.checked)} style={{ width: 16, height: 16 }} />
                🌙 {t('Вечерний вопрос «как прошёл день»')}
              </label>
              <div className="settings-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {t('Бот спросит вечером, ответ сохранится в заметку дня и учтётся в ИИ-отчётах')}
              </div>
            </div>
            {noteEnabled && (
              <input
                type="time"
                value={noteTime}
                onChange={e => handleNoteTime(e.target.value)}
                className="log-input"
                style={{ width: 110, flexShrink: 0 }}
              />
            )}
          </div>
        )}
      </section>

      {tgLinked && rep && (
        <section className={`settings-section${isArchived('reports') ? ' is-archived' : ''}`}>
          <ArchiveBtn id="reports" onArchive={archiveSection} />
          <h3 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="8"/><rect x="12" y="6" width="3" height="12"/><rect x="17" y="13" width="3" height="5"/></svg>
            {t('Отчёты в Telegram')}
          </h3>

          <div className="rep-setting">
            <span className="settings-label">{t('Как часто присылать')}</span>
            <div className="rep-seg">
              {[7, 14, 21].map(d => (
                <button
                  key={d}
                  className={`rep-seg-btn${rep.frequency_days === d ? ' on' : ''}`}
                  onClick={() => patchRep({ frequency_days: d })}
                >{d === 7 ? t('Неделя') : `${d / 7} ${t('нед')}`}</button>
              ))}
            </div>
          </div>

          <div className="rep-setting">
            <span className="settings-label">{t('Подробность')}</span>
            <div className="rep-seg">
              {([['short', 'Кратко'], ['medium', 'Средне'], ['full', 'Подробно']] as const).map(([v, label]) => (
                <button
                  key={v}
                  className={`rep-seg-btn${rep.detail_level === v ? ' on' : ''}`}
                  onClick={() => patchRep({ detail_level: v })}
                >{t(label)}</button>
              ))}
            </div>
          </div>

          <label className="rep-toggle-row">
            <input type="checkbox" checked={rep.send_sensitive} onChange={e => patchRep({ send_sensitive: e.target.checked })} />
            <span>
              <span className="settings-label">{t('Присылать чувствительное')}</span>
              <span className="settings-muted" style={{ display: 'block', fontSize: 12 }}>{t('Анализы и препараты в отчётах. Выкл — только сводка самочувствия. Telegram не E2E-шифрован.')}</span>
            </span>
          </label>

          <label className="rep-toggle-row">
            <input type="checkbox" checked={rep.morning_summary} onChange={e => patchRep({ morning_summary: e.target.checked })} />
            <span>
              <span className="settings-label">{t('Утренняя сводка')}</span>
              <span className="settings-muted" style={{ display: 'block', fontSize: 12 }}>{t('Короткое «как ты сегодня» утром')}</span>
            </span>
            {rep.morning_summary && (
              <input type="time" value={rep.morning_time} onChange={e => patchRep({ morning_time: e.target.value })} className="log-input" style={{ width: 100, marginLeft: 'auto' }} />
            )}
          </label>

          <label className="rep-toggle-row">
            <input type="checkbox" checked={!rep.paused} onChange={e => patchRep({ paused: !e.target.checked })} />
            <span className="settings-label">{t('Автоматические отчёты включены')}</span>
          </label>
        </section>
      )}

      {onGoogleSync && (
        <section className={`settings-section${isArchived('google') ? ' is-archived' : ''}`}>
          <ArchiveBtn id="google" onArchive={archiveSection} />
          <h3 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Google Calendar
          </h3>
          <div className="settings-cal-row">
            <div>
              <div className="settings-label">{t('Загрузить события из Google Calendar')}</div>
              {lastSync && <div className="settings-muted" style={{ fontSize: 12, marginTop: 4 }}>{t('Последняя синхронизация:')} {lastSync}</div>}
            </div>
            <button
              className={`btn-primary ${googleConnected ? 'btn-success' : ''}`}
              onClick={onGoogleSync}
              disabled={googleLoading}
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {googleLoading ? t('Загрузка…') : googleConnected ? `✓ ${t('Синхронизировано')}` : t('Подключить')}
            </button>
          </div>
        </section>
      )}

      <section className={`settings-section${isArchived('cal') ? ' is-archived' : ''}`}>
        <ArchiveBtn id="cal" onArchive={archiveSection} />
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
              <div className="settings-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                {t('Последняя синхронизация:')} {new Date(calStatus.last_sync_at).toLocaleString(locale)} · {calStatus.event_count ?? 0} {t('событий')}
                {calStatus.last_status && calStatus.last_status !== 'ok' && <span style={{ color: 'var(--red)' }}> · {calStatus.last_status}</span>}
              </div>
            )}
            <label className="settings-muted" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12 }}>
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
            <div className="settings-muted" style={{ marginBottom: 12, fontSize: 12, lineHeight: 1.5 }}>
              {calStatus?.cal_email
                ? t('Аккаунт подключён, синхронизация раз в день. Чтобы сменить аккаунт — введи новые данные ниже.')
                : t('Введи логин и пароль cal.com — синхронизация будет автоматической раз в день. Пароль хранится зашифрованно.')}
            </div>
            <div className="settings-ics-row" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
              <input className="log-input" type="email" placeholder={calStatus?.cal_email || 'email@cal.com'}
                value={calEmail} onChange={e => setCalEmail(e.target.value)} />
              <input className="log-input" type="password" placeholder={t('Пароль cal.com')}
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
            <div className="settings-muted" style={{ margin: '14px 0 6px', fontSize: 12, fontWeight: 600 }}>
              {t('Резервный способ — вход по session-токену:')}
            </div>
            <div className="settings-muted" style={{ marginBottom: 12, fontSize: 12, lineHeight: 1.5 }}>
              F12 → Application → Cookies → <b>__Secure-next-auth.session-token</b>. {t('Токен очищается после загрузки — можно вставить второй аккаунт следом.')}
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

      <section className={`settings-section${isArchived('ai') ? ' is-archived' : ''}`}>
        <ArchiveBtn id="ai" onArchive={archiveSection} />
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
              <button className="settings-edit-btn" onClick={() => { setEditVal(String(budget)); setEditing(true) }}>
                {t('Изменить')}
              </button>
              {saved && <span style={{ color: 'var(--green)', fontSize: 12 }}>{t('сохранено')} ✓</span>}
            </div>
          )}
        </div>
      </section>

      {onNavigate && (
        <section className={`settings-section${isArchived('import') ? ' is-archived' : ''}`}>
          <ArchiveBtn id="import" onArchive={archiveSection} />
          <h3 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {t('Импорт данных')}
          </h3>
          <div className="settings-muted" style={{ fontSize: 12, marginBottom: 10 }}>
            {t('Загрузите новый экспорт из приложения «Здоровье» (Apple) или Xiaomi, чтобы добавить свежие дни.')}
          </div>
          <button className="btn-secondary" onClick={() => onNavigate('upload')}>
            📥 {t('Загрузить данные')}
          </button>
        </section>
      )}

      <div className={`archivable-block${isArchived('autosync') ? ' is-archived' : ''}`}>
        <ArchiveBtn id="autosync" onArchive={archiveSection} />
        <AutoSyncSettings user={user} />
      </div>

      {user && <WorkoutScheduleSettings user={user} />}

      <section className={`settings-section${isArchived('environment') ? ' is-archived' : ''}`}>
        <ArchiveBtn id="environment" onArchive={archiveSection} />
        <h3 className="settings-section-title">🌤 {t('Данные среды')}</h3>
        <p className="settings-muted" style={{ marginBottom: 10 }}>
          {t('Температура, давление, световой день, осадки — с Open-Meteo по твоей локации.')}
        </p>

        {locLabel && !editingLoc ? (
          // Локация уже выбрана — показываем только её и кнопку синхронизации
          <>
            <div className="settings-muted" style={{ marginBottom: 10, fontSize: 13 }}>
              📍 {t('Локация:')} <b>{locLabel}</b>
              {' · '}
              <button className="link-btn" onClick={() => { setEditingLoc(true); setLocMsg(null) }}>{t('Изменить')}</button>
            </div>
            <button className="btn-secondary" onClick={handleSyncEnvironment} disabled={envSyncing}>
              {envSyncing ? t('Синхронизирую…') : t('Синхронизировать среду')}
            </button>
          </>
        ) : (
          // Локация не выбрана (или режим изменения) — показываем выбор
          <>
            <button className="btn-primary" style={{ marginBottom: 8 }} onClick={handleUseMyLocation} disabled={locLocating}>
              {locLocating ? t('Определяю…') : `📍 ${t('Определить автоматически')}`}
            </button>
            <div className="settings-muted" style={{ marginBottom: 6, fontSize: 12 }}>{t('…или найди город вручную:')}</div>
            <div className="settings-ics-row" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="log-input" style={{ flex: 1 }} placeholder={t('Введите город')}
                  value={locQuery} onChange={e => setLocQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleLocationSearch() }} />
                <button className="btn-secondary" onClick={handleLocationSearch} disabled={locSearching || !locQuery.trim()}>
                  {locSearching ? t('Ищу…') : t('Найти')}
                </button>
              </div>
              {locResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {locResults.map((r, i) => (
                    <button key={i} className="btn-secondary" style={{ textAlign: 'left' }} onClick={() => handleLocationPick(r)}>
                      {[r.name, r.admin1, r.country].filter(Boolean).join(', ')}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {locLabel && editingLoc && (
              <button className="link-btn" onClick={() => { setEditingLoc(false); setLocResults([]); setLocQuery('') }}>{t('Отмена')}</button>
            )}
          </>
        )}
        {locMsg && <p className="settings-muted" style={{ marginTop: 6 }}>{locMsg}</p>}
        {envMsg && <p className="settings-muted" style={{ marginTop: 6 }}>{envMsg}</p>}
      </section>

      {onDeviceTypeChange && (
        <section className={`settings-section${isArchived('device') ? ' is-archived' : ''}`}>
          <ArchiveBtn id="device" onArchive={archiveSection} />
          <h2 className="settings-section-title">{t('Устройство')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {t('Текущий источник данных:')} <strong>{deviceType === 'xiaomi' ? 'Xiaomi / Mi Band' : deviceType === 'apple_watch' ? 'Apple Watch' : t('не выбран')}</strong>
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn-secondary${deviceType === 'apple_watch' ? ' active' : ''}`}
              style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={() => onDeviceTypeChange('apple_watch')}
            >
              Apple Watch
            </button>
            <button
              className={`btn-secondary${deviceType === 'xiaomi' ? ' active' : ''}`}
              style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={() => onDeviceTypeChange('xiaomi')}
            >
              Xiaomi / Mi Band
            </button>
          </div>
          <button
            className="btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => { clearGuideProgress(); setShowGuide(true) }}
          >
            {t('Как подключить устройство')}
          </button>
        </section>
      )}

      {showGuide && onDeviceTypeChange && (
        <div className="guide-overlay">
          <ConnectGuide
            user={user}
            demo={isDemoActive()}
            deviceType={deviceType ?? null}
            onSelectDevice={onDeviceTypeChange}
            onDismiss={() => setShowGuide(false)}
            onDone={() => setShowGuide(false)}
          />
        </div>
      )}

      <section className={`settings-section${isArchived('export') ? ' is-archived' : ''}`}>
        <ArchiveBtn id="export" onArchive={archiveSection} />
        <h3 className="settings-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {t('Экспорт данных')}
        </h3>
        <div className="settings-muted" style={{ fontSize: 12, marginBottom: 10 }}>
          {t('Скачай все свои данные для бэкапа или анализа. Обрабатывается в браузере.')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => handleExport('json')} disabled={exporting !== null}>
            {exporting === 'json' ? '…' : `📦 ${t('Полный бэкап (JSON)')}`}
          </button>
          <button className="btn-secondary" onClick={() => handleExport('csv')} disabled={exporting !== null}>
            {exporting === 'csv' ? '…' : `📊 ${t('Метрики (CSV)')}`}
          </button>
        </div>
      </section>

      {archivedSections.length > 0 && (
        <section className="settings-section settings-archive">
          <button type="button" className="settings-archive-toggle" onClick={() => setArchiveOpen(o => !o)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/></svg>
            {t('Архив')} · {archivedSections.length}
            <span className="settings-archive-caret">{archiveOpen ? '▲' : '▼'}</span>
          </button>
          {archiveOpen && (
            <div className="settings-archive-list">
              {archivedSections.map(id => (
                <div key={id} className="settings-archive-row">
                  <span>{t(SECTION_TITLES[id] ?? id)}</span>
                  <button type="button" className="link-btn" onClick={() => restoreSection(id)}>{t('Вернуть')}</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
