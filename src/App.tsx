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
import { AppLoader, DashboardSkeleton } from './components/ui/Spinner'
import type { AppView } from './store/appStore'
import type { CalendarEvent, DailyMetrics, HeartRateSample } from './types'
import { parseICS } from './parsers/icsParser'
import { parseCalBookings } from './parsers/calBookingsParser'
import { useRef, useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'
import { syncMetricsToSupabase, loadMetricsFromSupabase, getLastSyncInfo } from './lib/sync'
import './index.css'

function CalJSONUploadButton({ onEvents, hasEvents }: { onEvents: (e: CalendarEvent[]) => void; hasEvents: boolean }) {
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
      <button className={`nav-btn ics-btn${hasEvents ? ' ics-loaded' : ''}`} onClick={() => ref.current?.click()}>
        {hasEvents ? '📅 Cal.com ✓' : '📅 cal_bookings.json'}
      </button>
    </>
  )
}

function ICSUploadButton({ onEvents, hasEvents }: { onEvents: (e: CalendarEvent[]) => void; hasEvents: boolean }) {
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
      <button className={`nav-btn ics-btn${hasEvents ? ' ics-loaded' : ''}`} onClick={() => ref.current?.click()}>
        {hasEvents ? '📅 Календарь ✓' : '📅 Загрузить календарь'}
      </button>
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
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [intakeEvents, setIntakeEvents] = useState<Parameters<typeof QuickLog>[0]['events']>([])
  const [dbLoading, setDbLoading] = useState(false)

  const hasData = state.daily.length > 0

  // Load stored data and intake events on login
  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function init() {
      setDbLoading(true)
      const [stored, syncInfo, intakeRes] = await Promise.all([
        loadMetricsFromSupabase(user!.id),
        getLastSyncInfo(user!.id),
        supabase.from('intake_events').select('*').eq('user_id', user!.id)
          .order('ts', { ascending: false }).limit(100),
      ])

      if (cancelled) return
      setDbLoading(false)

      if (stored.length > 0) {
        setDaily(stored, [])
      }
      if (syncInfo?.imported_at) {
        const d = new Date(syncInfo.imported_at)
        setLastSync(d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
      }
      if (intakeRes.data) {
        setIntakeEvents(intakeRes.data as typeof intakeEvents)
      }
    }

    init()
    return () => { cancelled = true }
  }, [user])

  // After parsing — sync to Supabase
  async function handleDone(daily: DailyMetrics[], samples: HeartRateSample[], filename = 'export') {
    setDaily(daily, samples)
    if (!user) return
    setSyncMsg('Синхронизируем с базой…')
    try {
      const result = await syncMetricsToSupabase(user.id, daily, filename)
      if (result.daysAdded > 0) {
        setSyncMsg(`Добавлено ${result.daysAdded} новых дней`)
        setLastSync(new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
      } else {
        setSyncMsg('Новых данных нет — всё уже сохранено')
      }
    } catch {
      setSyncMsg('Ошибка синхронизации')
    }
    setTimeout(() => setSyncMsg(null), 4000)
  }

  if (loading) return <AppLoader />
  if (!user) return <AuthScreen />
  if (dbLoading) return <AppLoader label="Загружаем данные…" />

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
          <ICSUploadButton onEvents={setEvents} hasEvents={state.events.length > 0} />
          <CalJSONUploadButton onEvents={setEvents} hasEvents={state.events.length > 0} />
          {lastSync && <span className="sync-label">Синхр: {lastSync}</span>}
          <button className="nav-btn signout-btn" onClick={() => supabase.auth.signOut()} title={user.email}>
            Выйти
          </button>
        </header>
      )}

      {syncMsg && <div className="sync-toast">{syncMsg}</div>}

      <main className="main-content">
        {!hasData ? (
          <UploadScreen
            onProgress={setProgress}
            onDone={(daily, samples) => handleDone(daily, samples)}
            onEvents={setEvents}
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
          <StressMapScreen heartRateSamples={state.heartRateSamples} events={state.events} />
        ) : state.view === 'sleep' ? (
          <SleepScreen daily={state.daily} />
        ) : state.view === 'insights' ? (
          <InsightsScreen daily={state.daily} />
        ) : null}
      </main>
    </div>
  )
}
