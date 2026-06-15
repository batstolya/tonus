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
import { SettingsScreen } from './components/settings/SettingsScreen'
import { ChatWidget } from './components/chat/ChatWidget'
import { AppLoader } from './components/ui/Spinner'
import type { AppView } from './store/appStore'
import type { CalendarEvent, DailyMetrics, HeartRateSample } from './types'
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import { supabase } from './lib/supabase'
import { syncMetricsToSupabase, loadMetricsFromSupabase, getLastSyncInfo, syncHRSamples, loadHRSamples } from './lib/sync'
import { saveCalendarEvents, loadCalendarEvents } from './lib/calendarSync'
import { connectGoogleCalendar, isGoogleCalendarAvailable } from './lib/googleCalendar'
import './index.css'


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

            <button className="theme-toggle" onClick={toggleTheme} title="Сменить тему">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              className={`theme-toggle${state.view === 'settings' ? ' active' : ''}`}
              onClick={() => setView('settings')}
              title="Настройки"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
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
              <button className="mobile-nav-btn" onClick={() => { setView('settings'); closeMobileMenu() }}>
                <span>⚙️</span>
                Настройки
              </button>
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
        ) : state.view === 'settings' ? (
          <SettingsScreen
            user={user}
            onGoogleSync={isGoogleCalendarAvailable() ? handleGoogleCalendar : undefined}
            googleLoading={googleLoading}
            googleConnected={googleConnected}
            lastSync={lastSync}
            calLastSync={calSyncTimes['cal'] ?? null}
            onNavigate={setView}
            onCalEvents={e => handleEvents(e.map(ev => ({
              ...ev,
              start: ev.start instanceof Date ? ev.start : new Date(ev.start),
              end: ev.end instanceof Date ? ev.end : new Date(ev.end),
            })), 'cal')}
          />
        ) : null}
      </main>

      {hasData && <ChatWidget user={user} daily={state.daily} intakeEvents={intakeEvents} />}
    </div>
  )
}
