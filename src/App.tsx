import { useAppStore } from './store/appStore'
import { UploadScreen } from './components/upload/UploadScreen'
import { Dashboard } from './components/dashboard/Dashboard'
import { HeartRateScreen } from './components/heart-rate/HeartRateScreen'
import { MetricsScreen } from './components/metrics/MetricsScreen'
import { StressMapScreen } from './components/stress-map/StressMapScreen'
import { InsightsScreen } from './components/insights/InsightsScreen'
import { SleepScreen } from './components/sleep/SleepScreen'
import { AuthScreen } from './components/auth/AuthScreen'
import type { AppView } from './store/appStore'
import type { CalendarEvent } from './types'
import { parseICS } from './parsers/icsParser'
import { parseCalBookings } from './parsers/calBookingsParser'
import { useRef } from 'react'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'
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

  const hasData = state.daily.length > 0

  if (loading) return <div className="auth-loading">Загрузка…</div>
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
          <ICSUploadButton onEvents={setEvents} hasEvents={state.events.length > 0} />
          <CalJSONUploadButton onEvents={setEvents} hasEvents={state.events.length > 0} />
          <button className="nav-btn signout-btn" onClick={() => supabase.auth.signOut()} title={user.email}>
            Выйти
          </button>
        </header>
      )}

      <main className="main-content">
        {!hasData ? (
          <UploadScreen
            onProgress={setProgress}
            onDone={setDaily}
            onEvents={setEvents}
            onError={setError}
            progress={state.parseProgress}
            error={state.error}
          />
        ) : state.view === 'dashboard' ? (
          <Dashboard
            daily={state.daily}
            heartRateSamples={state.heartRateSamples}
            events={state.events}
            onNavigate={setView}
          />
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
