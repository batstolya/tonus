import { useAppStore } from './store/appStore'
import { DeviceSelectScreen } from './components/onboarding/DeviceSelectScreen'
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
import { GoalsScreen } from './components/goals/GoalsScreen'
import { ConcernsScreen } from './components/concerns/ConcernsScreen'
import { HairScreen } from './components/hair/HairScreen'
import { ChatWidget } from './components/chat/ChatWidget'
import { AppLoader } from './components/ui/Spinner'
import type { AppView } from './store/appStore'
import type { CalendarEvent, DailyMetrics, HeartRateSample } from './types'
import React, { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import { supabase } from './lib/supabase'
import { syncMetricsToSupabase, loadMetricsFromSupabase, getLastSyncInfo, syncHRSamples, loadHRSamples } from './lib/sync'
import { saveCalendarEvents, loadCalendarEvents } from './lib/calendarSync'
import { connectGoogleCalendar, isGoogleCalendarAvailable } from './lib/googleCalendar'
import { detectAvailableMetrics } from './lib/availableMetrics'
import { useT } from './lib/i18n'
import './index.css'


type GroupId = 'body' | 'journal' | 'coach'

type NavView = { view: AppView; label: string; requiresMetric?: keyof import('./lib/availableMetrics').AvailableMetrics }

const NAV_GROUPS: {
  id: GroupId
  label: string
  defaultView: AppView
  icon: React.ReactElement
  views: NavView[]
}[] = [
  {
    id: 'body',
    label: 'Тело',
    defaultView: 'metrics',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
    views: [
      { view: 'metrics', label: 'Обзор' },
      { view: 'heart-rate', label: 'Пульс', requiresMetric: 'hasHeartRate' },
      { view: 'sleep', label: 'Сон', requiresMetric: 'hasSleep' },
      { view: 'activity', label: 'Активность', requiresMetric: 'hasActivity' },
      { view: 'stress-map', label: 'Стресс', requiresMetric: 'hasStress' },
    ],
  },
  {
    id: 'journal',
    label: 'Дневник',
    defaultView: 'supplements',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
    views: [
      { view: 'supplements', label: 'Препараты' },
      { view: 'labs', label: 'Анализы' },
      { view: 'concerns', label: 'Проблемы' },
    ],
  },
  {
    id: 'coach',
    label: 'Коуч',
    defaultView: 'insights',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>,
    views: [
      { view: 'insights', label: 'Инсайты' },
      { view: 'goals', label: 'Цели' },
    ],
  },
]

function getActiveGroup(view: AppView): GroupId | null {
  if (view === 'hair') return 'journal'
  for (const g of NAV_GROUPS) {
    if (g.views.some(v => v.view === view)) return g.id
  }
  return null
}

function getActiveSubView(view: AppView): AppView {
  if (view === 'hair') return 'concerns'
  return view
}

export default function App() {
  const { t, lang, setLang } = useT()
  const { state, setView, setDaily, setEvents, setProgress, setError, reset, setDeviceType } = useAppStore()
  const { user, loading, passwordRecovery, setPasswordRecovery } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [intakeEvents, setIntakeEvents] = useState<Parameters<typeof QuickLog>[0]['events']>([])
  const [dbLoading, setDbLoading] = useState(true)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showGoogleEvents, setShowGoogleEvents] = useState(true)
  const [calSyncTimes, setCalSyncTimes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('cal_sync_times') ?? '{}') } catch { return {} }
  })

  const hasData = state.daily.length > 0
  const availableMetrics = React.useMemo(() => detectAvailableMetrics(state.daily), [state.daily])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

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
        setSyncMsg('⚠️ Не удалось сохранить пульс — подробности в консоли (F12)')
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

  if (loading || dbLoading) return <AppLoader label={dbLoading ? t('Загружаем данные…') : undefined} />
  if (!user) return <AuthScreen />
  if (passwordRecovery) return <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />

  const activeGroup = getActiveGroup(state.view)
  const activeSubView = getActiveSubView(state.view)

  const visibleNavGroups = NAV_GROUPS.map(g => ({
    ...g,
    views: g.views.filter(v => !v.requiresMetric || availableMetrics[v.requiresMetric]),
  }))
  const activeGroupData = visibleNavGroups.find(g => g.id === activeGroup) ?? null

  return (
    <div className="app">
      {hasData && (
        <>
          <header className="topbar">
            <button className="logo-btn" onClick={reset}>Tonus</button>
            <nav className="topbar-nav">
              <button
                className={`nav-btn${state.view === 'dashboard' ? ' active' : ''}`}
                onClick={() => setView('dashboard')}
              >
                Дашборд
              </button>
              {visibleNavGroups.map(g => (
                <button
                  key={g.id}
                  className={`nav-btn${activeGroup === g.id ? ' active' : ''}`}
                  onClick={() => setView(g.defaultView)}
                >
                  {t(g.label)}
                </button>
              ))}
            </nav>

            <div className="topbar-right">
              <button
                className="theme-toggle lang-toggle"
                onClick={() => setLang(lang === 'ru' ? 'uk' : lang === 'uk' ? 'en' : 'ru')}
                title={t('Язык')}
              >
                {lang === 'ru' ? '🇷🇺' : lang === 'uk' ? '🇺🇦' : '🇬🇧'}
              </button>
              <button className="theme-toggle" onClick={toggleTheme} title={t('Сменить тему')}>
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
              <button
                className={`theme-toggle${state.view === 'settings' ? ' active' : ''}`}
                onClick={() => setView('settings')}
                title={t('Настройки')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
              <button className="nav-btn signout-btn" onClick={() => supabase.auth.signOut()}>
                {t('Выйти')}
              </button>
            </div>
          </header>

          {activeGroupData && (
            <nav className="subnav">
              {activeGroupData.views.map(v => (
                <button
                  key={v.view}
                  className={`subnav-btn${activeSubView === v.view ? ' active' : ''}`}
                  onClick={() => setView(v.view)}
                >
                  {t(v.label)}
                </button>
              ))}
            </nav>
          )}
        </>
      )}

      {syncMsg && <div className="sync-toast">{syncMsg}</div>}

      <main className="main-content">
        {!hasData ? (
          state.deviceType == null ? (
            <DeviceSelectScreen onSelect={setDeviceType} />
          ) : (
            <UploadScreen
              onProgress={setProgress}
              onDone={(daily, samples, filename) => handleDone(daily, samples, filename)}
              onEvents={e => handleEvents(e, 'ics')}
              onError={setError}
              progress={state.parseProgress}
              error={state.error}
              deviceType={state.deviceType}
            />
          )
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
        ) : state.view === 'goals' ? (
          <GoalsScreen user={user} daily={state.daily} />
        ) : state.view === 'concerns' ? (
          <ConcernsScreen user={user} onNavigateHair={() => setView('hair')} />
        ) : state.view === 'hair' ? (
          <HairScreen user={user} onBack={() => setView('concerns')} />
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
            deviceType={state.deviceType}
            onDeviceTypeChange={setDeviceType}
          />
        ) : null}
      </main>

      {hasData && <ChatWidget user={user} daily={state.daily} intakeEvents={intakeEvents} heartRateSamples={state.heartRateSamples} />}

      {hasData && (
        <nav className="bottom-nav">
          <button
            className={`bottom-nav-btn${state.view === 'dashboard' ? ' active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span>Дашборд</span>
          </button>
          {visibleNavGroups.map(g => (
            <button
              key={g.id}
              className={`bottom-nav-btn${activeGroup === g.id ? ' active' : ''}`}
              onClick={() => setView(g.defaultView)}
            >
              {g.icon}
              <span>{t(g.label)}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
