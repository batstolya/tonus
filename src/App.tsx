import { useAppStore } from './store/appStore'
import { UploadScreen } from './components/upload/UploadScreen'
import { Dashboard } from './components/dashboard/Dashboard'
import { HeartRateScreen } from './components/heart-rate/HeartRateScreen'
import { MetricsScreen } from './components/metrics/MetricsScreen'
import { StressMapScreen } from './components/stress-map/StressMapScreen'
import { InsightsScreen } from './components/insights/InsightsScreen'
import { SleepScreen } from './components/sleep/SleepScreen'
import { AuthScreen } from './components/auth/AuthScreen'
import { QuickLog } from './components/intake/QuickLog'
import { AppLoader } from './components/ui/Spinner'
import type { AppView } from './store/appStore'
import type { CalendarEvent, DailyMetrics, HeartRateSample } from './types'
import { parseICS } from './parsers/icsParser'
import { parseCalBookings } from './parsers/calBookingsParser'
import { useRef, useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import { supabase } from './lib/supabase'
import { syncMetricsToSupabase, loadMetricsFromSupabase, getLastSyncInfo } from './lib/sync'
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

const NAV_ITEMS: { view: AppView; label: string }[] = [
  { view: 'dashboard', label: 'Дашборд' },
  { view: 'heart-rate', label: 'Пульс' },
  { view: 'metrics', label: 'Показатели' },
  { view: 'stress-map', label: 'Стресс' },
  { view: 'sleep', label: 'Сон' },
  { view: 'insights', label: 'Инсайты' },
]

export default function App() {
  const { state, setView, setDaily, setEvents, setProgress, setError, reset } = useAppStore()
  const { user, loading } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [intakeEvents, setIntakeEvents] = useState<Parameters<typeof QuickLog>[0]['events']>([])
  const [dbLoading, setDbLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const hasData = state.daily.length > 0

  // Load stored data on login
  useEffect(() => {
    if (!user) return
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
      setDbLoading(false)

      if (stored.length > 0) setDaily(stored, [])
      if (syncInfo?.imported_at) {
        const d = new Date(syncInfo.imported_at)
        setLastSync(d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
      }
      if (intakeRes.data) setIntakeEvents(intakeRes.data as typeof intakeEvents)
      if (calEvents.length > 0) setEvents(calEvents)
    }

    init()
    return () => { cancelled = true }
  }, [user])

  async function handleDone(daily: DailyMetrics[], samples: HeartRateSample[], filename = 'export') {
    setDaily(daily, samples)
    if (!user) return
    setSyncMsg('Синхронизируем…')
    try {
      const result = await syncMetricsToSupabase(user.id, daily, filename)
      if (result.daysAdded > 0) {
        setSyncMsg(`Добавлено ${result.daysAdded} новых дней`)
        setLastSync(new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
      } else {
        setSyncMsg('Данные актуальны')
      }
    } catch {
      setSyncMsg('Ошибка синхронизации')
    }
    setTimeout(() => setSyncMsg(null), 4000)
  }

  async function handleEvents(events: CalendarEvent[], source = 'ics') {
    setEvents(events)
    if (!user) return
    try {
      await saveCalendarEvents(user.id, events, source)
    } catch { /* non-critical */ }
  }

  async function handleGoogleCalendar() {
    setGoogleLoading(true)
    try {
      const events = await connectGoogleCalendar()
      await handleEvents(events, 'google')
      setSyncMsg(`Загружено ${events.length} событий из Google`)
      setTimeout(() => setSyncMsg(null), 4000)
    } catch (e: any) {
      setSyncMsg('Ошибка Google Calendar')
      setTimeout(() => setSyncMsg(null), 3000)
    }
    setGoogleLoading(false)
  }

  if (loading || dbLoading) return <AppLoader label={dbLoading ? 'Загружаем данные…' : undefined} />
  if (!user) return <AuthScreen />

  return (
    <div className="app">
      {hasData && (
        <header className="topbar">
          <button className="logo-btn" onClick={reset}>Tonus</button>
          <nav>
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
            <ICSUploadButton onEvents={e => handleEvents(e, 'ics')} />
            <CalJSONUploadButton onEvents={e => handleEvents(e, 'calcom')} />
            {isGoogleCalendarAvailable() && (
              <button className="nav-btn" onClick={handleGoogleCalendar} disabled={googleLoading}>
                {googleLoading ? '…' : '🗓 Google'}
              </button>
            )}
            {lastSync && <span className="sync-label">Синхр: {lastSync}</span>}
            <button className="theme-toggle" onClick={toggleTheme} title="Сменить тему">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="nav-btn signout-btn" onClick={() => supabase.auth.signOut()}>
              Выйти
            </button>
          </div>
        </header>
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
              events={state.events}
              onNavigate={setView}
              user={user}
            />
            <aside className="dashboard-aside">
              <QuickLog user={user} events={intakeEvents} onEventsChange={setIntakeEvents} />
            </aside>
          </div>
        ) : state.view === 'heart-rate' ? (
          <HeartRateScreen daily={state.daily} />
        ) : state.view === 'metrics' ? (
          <MetricsScreen daily={state.daily} />
        ) : state.view === 'stress-map' ? (
          <StressMapScreen
            heartRateSamples={state.heartRateSamples}
            events={state.events}
            onEvents={e => handleEvents(e, 'ics')}
            onGoogleCalendar={isGoogleCalendarAvailable() ? handleGoogleCalendar : undefined}
          />
        ) : state.view === 'sleep' ? (
          <SleepScreen daily={state.daily} />
        ) : state.view === 'insights' ? (
          <InsightsScreen daily={state.daily} />
        ) : null}
      </main>
    </div>
  )
}
