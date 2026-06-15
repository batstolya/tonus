import { useAppStore } from './store/appStore'
import { UploadScreen } from './components/upload/UploadScreen'
import { Dashboard } from './components/dashboard/Dashboard'
import { HeartRateScreen } from './components/heart-rate/HeartRateScreen'
import { MetricsScreen } from './components/metrics/MetricsScreen'
import { StressMapScreen } from './components/stress-map/StressMapScreen'
import { InsightsScreen } from './components/insights/InsightsScreen'
import { SleepScreen } from './components/sleep/SleepScreen'
import { ActivityScreen } from './components/activity/ActivityScreen'
import { AuthScreen } from './components/auth/AuthScreen'
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen'
import { QuickLog } from './components/intake/QuickLog'
import { SupplementsScreen } from './components/supplements/SupplementsScreen'
import { LabsScreen } from './components/labs/LabsScreen'
import { ChatWidget } from './components/chat/ChatWidget'
import { AppLoader } from './components/ui/Spinner'
import type { AppView } from './store/appStore'
import type { CalendarEvent, DailyMetrics, HeartRateSample } from './types'
import { parseICS } from './parsers/icsParser'
import { parseCalBookings } from './parsers/calBookingsParser'
import { useRef, useEffect, useState, useCallback } from 'react'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import { supabase } from './lib/supabase'
import { syncMetricsToSupabase, loadMetricsFromSupabase, getLastSyncInfo, syncHRSamples, loadHRSamples } from './lib/sync'
import { saveCalendarEvents, loadCalendarEvents } from './lib/calendarSync'
import { connectGoogleCalendar, isGoogleCalendarAvailable } from './lib/googleCalendar'
import './index.css'

function CalJSONUploadButton({ onEvents }: { onEvents: (e: CalendarEvent[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then(text => { try { onEvents(parseCalBookings(text)) } catch { /* ignore */ } })
    e.target.value = ''
  }
  return (
    <>
      <input ref={ref} type="file" accept=".json" style={{ display: 'none' }} onChange={handleChange} />
      <button className="nav-btn" onClick={() => ref.current?.click()}>📋 Cal.com</button>
    </>
  )
}

function ICSUploadButton({ onEvents }: { onEvents: (e: CalendarEvent[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then(text => { try { onEvents(parseICS(text)) } catch { /* ignore */ } })
    e.target.value = ''
  }
  return (
    <>
      <input ref={ref} type="file" accept=".ics" style={{ display: 'none' }} onChange={handleChange} />
      <button className="nav-btn" onClick={() => ref.current?.click()}>📅 .ics</button>
    </>
  )
}

const NAV_ITEMS: { view: AppView; label: string; icon: string }[] = [
  { view: 'dashboard', label: 'Дашборд', icon: '⊞' },
  { view: 'activity', label: 'Активность', icon: '👟' },
  { view: 'sleep', label: 'Сон', icon: '🌙' },
  { view: 'stress-map', label: 'Стресс', icon: '💓' },
  { view: 'heart-rate', label: 'Пульс', icon: '📈' },
  { view: 'metrics', label: 'Показатели', icon: '📊' },
  { view: 'insights', label: 'Инсайты', icon: '💡' },
  { view: 'supplements', label: 'Препараты', icon: '💊' },
  { view: 'labs', label: 'Анализы', icon: '🔬' },
]

export default function App() {
  const { state, setView, setDaily, setEvents, setProgress, setError, reset } = useAppStore()
  const { user, loading, passwordRecovery, setPasswordRecovery } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [intakeEvents, setIntakeEvents] = useState<Parameters<typeof QuickLog>[0]['events']>([])
  const [dbLoading, setDbLoading] = useState(true)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showGoogleEvents, setShowGoogleEvents] = useState(true)
  const [syncMenuOpen, setSyncMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [calSyncTimes, setCalSyncTimes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('cal_sync_times') ?? '{}') } catch { return {} }
  })

  const closeSyncMenu = useCallback(() => setSyncMenuOpen(false), [])
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

  useEffect(() => {
    if (!syncMenuOpen) return
    const handler = (e: MouseEvent) => {
      const wrap = document.querySelector('.sync-menu-wrap')
      if (wrap && !wrap.contains(e.target as Node)) setSyncMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [syncMenuOpen])

  const hasData = state.daily.length > 0
  const googleConnected = state.events.some(e => e.source === 'google')
  const visibleEvents = showGoogleEvents
    ? state.events
    : state.events.filter(e => e.source !== 'google')

  useEffect(() => {
    if (!user) { setDbLoading(false); return }
    let cancelled = false
    setDbLoading(true)

    async function init() {
      const [stored, syncInfo, intakeRes, calEvents] = await Promise.all([
        loadMetricsFromSupabase(user!.id),
        getLastSyncInfo(user!.id),
        supabase.from('intake_events').select('*').eq('user_id', user!.id)
          .order('ts', { ascending: false }).limit(100),
        loadCalendarEvents(user!.id),
      ])

      if (cancelled) return

      const hrSamples = await loadHRSamples(user!.id)
      if (cancelled) return

      if (stored.length > 0) setDaily(stored, hrSamples, true)
      if (syncInfo?.imported_at) {
        const d = new Date(syncInfo.imported_at)
        setLastSync(d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
      }
      if (intakeRes.data) setIntakeEvents(intakeRes.data as typeof intakeEvents)
      if (calEvents.length > 0) setEvents(calEvents)
      setDbLoading(false)
    }

    init()
    return () => { cancelled = true }
  }, [user])

  async function handleDone(daily: DailyMetrics[], samples: HeartRateSample[], filename = 'export') {
    setDaily(daily, samples)
    if (!user) return
    loadCalendarEvents(user.id).then(calEvents => { if (calEvents.length > 0) setEvents(calEvents) })
    setSyncMsg('Синхронизируем…')
    try {
      const [result, hrOk] = await Promise.all([
        syncMetricsToSupabase(user.id, daily, filename),
        syncHRSamples(user.id, samples),
      ])
      if (!hrOk) {
        setSyncMsg('⚠️ Таблица heart_rate_samples не создана — запусти SQL в Supabase')
        setTimeout(() => setSyncMsg(null), 10000)
        return
      }
      if (result.daysAdded > 0) {
        setSyncMsg(`Добавлено ${result.daysAdded} новых дней`)
        setLastSync(new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
      } else {
        setSyncMsg('Данные актуальны')
      }
    } catch (e: any) {
      setSyncMsg(`Ошибка синхронизации: ${e?.message ?? 'unknown'}`)
    }
    setTimeout(() => setSyncMsg(null), 4000)
  }

  async function handleEvents(events: CalendarEvent[], source = 'ics') {
    const tagged = events.map(e => ({ ...e, source }))
    setEvents(tagged, source)
    const now = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    const updated = { ...calSyncTimes, [source]: now }
    setCalSyncTimes(updated)
    localStorage.setItem('cal_sync_times', JSON.stringify(updated))
    if (!user) return
    const ok = await saveCalendarEvents(user.id, tagged, source)
    if (!ok) {
      setSyncMsg('⚠️ Таблица calendar_events не создана — запусти SQL в Supabase')
      setTimeout(() => setSyncMsg(null), 8000)
    } else {
      setSyncMsg(`Сохранено ${events.length} событий календаря`)
      setTimeout(() => setSyncMsg(null), 3000)
    }
  }

  async function handleGoogleCalendar() {
    setGoogleLoading(true)
    try {
      const events = await connectGoogleCalendar()
      await handleEvents(events, 'google')
      setSyncMsg(`Загружено ${events.length} событий из Google`)
      setTimeout(() => setSyncMsg(null), 4000)
    } catch {
      setSyncMsg('Ошибка Google Calendar')
      setTimeout(() => setSyncMsg(null), 3000)
    }
    setGoogleLoading(false)
  }

  if (loading || dbLoading) return <AppLoader label={dbLoading ? 'Загружаем данные…' : undefined} />
  if (!user) return <AuthScreen />
  if (passwordRecovery) return <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />

  return (
    <div className="app">
      {hasData && (
        <header className="topbar">
          <button className="logo-btn" onClick={reset}>Tonus</button>
          <nav className="topbar-nav">
            {NAV_ITEMS.map(item => (
              <button
                key={item.view}
                className={state.view === item.view ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setView(item.view)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="topbar-right">
            <button className="burger-btn" onClick={() => setMobileMenuOpen(o => !o)} aria-label="Меню">
              <span className={`burger-icon${mobileMenuOpen ? ' open' : ''}`}>
                <span /><span /><span />
              </span>
            </button>
            {lastSync && <span className="sync-label">Синхр: {lastSync}</span>}

            <div className="sync-menu-wrap">
              <button className="theme-toggle" onClick={() => setSyncMenuOpen(o => !o)} title="Синхронизация календаря">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </button>
              {syncMenuOpen && (
                <div className="sync-dropdown">
                  <div className="sync-source-row">
                    <ICSUploadButton onEvents={e => { handleEvents(e, 'ics'); closeSyncMenu() }} />
                    {calSyncTimes['ics'] && <span className="sync-source-time">{calSyncTimes['ics']}</span>}
                  </div>
                  <div className="sync-source-row">
                    <CalJSONUploadButton onEvents={e => { handleEvents(e, 'calcom'); closeSyncMenu() }} />
                    {calSyncTimes['calcom'] && <span className="sync-source-time">{calSyncTimes['calcom']}</span>}
                  </div>
                  {isGoogleCalendarAvailable() && (
                    <button className="nav-btn sync-google-btn" onClick={() => { closeSyncMenu(); handleGoogleCalendar() }} disabled={googleLoading}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {googleLoading ? 'Загрузка…' : googleConnected ? 'Google ✓' : 'Google Calendar'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <button className="theme-toggle" onClick={toggleTheme} title="Сменить тему">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="nav-btn signout-btn" onClick={() => supabase.auth.signOut()}>
              Выйти
            </button>
          </div>
        </header>
      )}

      {mobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={closeMobileMenu}>
          <nav className="mobile-menu" onClick={e => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <span className="mobile-menu-title">Tonus</span>
              <button className="mobile-menu-close" onClick={closeMobileMenu}>✕</button>
            </div>
            {NAV_ITEMS.map(item => (
              <button
                key={item.view}
                className={state.view === item.view ? 'mobile-nav-btn active' : 'mobile-nav-btn'}
                onClick={() => { setView(item.view); closeMobileMenu() }}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
            <div className="mobile-menu-footer">
              <button className="mobile-nav-btn" onClick={() => { toggleTheme(); closeMobileMenu() }}>
                <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
                {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              </button>
              <button className="mobile-nav-btn signout" onClick={() => supabase.auth.signOut()}>
                <span>→</span>
                Выйти
              </button>
            </div>
          </nav>
        </div>
      )}

      {syncMsg && <div className="sync-toast">{syncMsg}</div>}

      <main className="main-content">
        {!hasData ? (
          <UploadScreen
            onProgress={setProgress}
            onDone={(daily, samples, filename) => handleDone(daily, samples, filename)}
            onEvents={e => handleEvents(e, 'ics')}
            onError={setError}
            progress={state.parseProgress}
            error={state.error}
          />
        ) : state.view === 'dashboard' ? (
          <div className="dashboard-layout">
            <Dashboard
              daily={state.daily}
              heartRateSamples={state.heartRateSamples}
              events={visibleEvents}
              onNavigate={setView}
              user={user}
            />
            <aside className="dashboard-aside">
              <QuickLog user={user} events={intakeEvents} onEventsChange={setIntakeEvents} />
            </aside>
          </div>
        ) : state.view === 'heart-rate' ? (
          <HeartRateScreen daily={state.daily} intakeEvents={intakeEvents} />
        ) : state.view === 'metrics' ? (
          <MetricsScreen daily={state.daily} />
        ) : state.view === 'stress-map' ? (
          <StressMapScreen
            heartRateSamples={state.heartRateSamples}
            events={visibleEvents}
            onEvents={e => handleEvents(e, 'ics')}
            onGoogleCalendar={isGoogleCalendarAvailable() ? handleGoogleCalendar : undefined}
            googleConnected={googleConnected}
            showGoogle={showGoogleEvents}
            onToggleGoogle={setShowGoogleEvents}
          />
        ) : state.view === 'sleep' ? (
          <SleepScreen daily={state.daily} />
        ) : state.view === 'activity' ? (
          <ActivityScreen daily={state.daily} />
        ) : state.view === 'insights' ? (
          <InsightsScreen daily={state.daily} />
        ) : state.view === 'supplements' ? (
          <SupplementsScreen user={user} />
        ) : state.view === 'labs' ? (
          <LabsScreen user={user} />
        ) : null}
      </main>

      {hasData && <ChatWidget user={user} daily={state.daily} />}
    </div>
  )
}
