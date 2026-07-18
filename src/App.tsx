import React, { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useAppStore } from './store/appStore'
import { DeviceSelectScreen } from './components/onboarding/DeviceSelectScreen'
import { ConnectGuide } from './components/onboarding/ConnectGuide'
import { DISMISSED_KEY, ensureGuideOwner } from './components/onboarding/guideState'
import { AuthScreen } from './components/auth/AuthScreen'
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen'
import { LandingScreen } from './components/landing/LandingScreen'
import { isResetUrl, unauthedView } from './components/landing/gating'
import { QuickLog } from './components/intake/QuickLog'
import { ChatWidget } from './components/chat/ChatWidget'
import { DashboardSkeleton, ScreenSkeleton } from './components/ui/Skeleton'

// Экраны грузим лениво: recharts и прочие тяжёлые зависимости не попадают
// в стартовый бандл (лендинг и авторизация открываются без них).
const UploadScreen = lazy(() => import('./components/upload/UploadScreen').then(m => ({ default: m.UploadScreen })))
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then(m => ({ default: m.Dashboard })))
const StreakMenu = lazy(() => import('./components/dashboard/StreakMenu').then(m => ({ default: m.StreakMenu })))
const NotificationBell = lazy(() => import('./components/dashboard/NotificationBell').then(m => ({ default: m.NotificationBell })))
const GeoStormBadge = lazy(() => import('./components/dashboard/GeoStormBadge').then(m => ({ default: m.GeoStormBadge })))
const HeartRateScreen = lazy(() => import('./components/heart-rate/HeartRateScreen').then(m => ({ default: m.HeartRateScreen })))
const MetricsScreen = lazy(() => import('./components/metrics/MetricsScreen').then(m => ({ default: m.MetricsScreen })))
const StressMapScreen = lazy(() => import('./components/stress-map/StressMapScreen').then(m => ({ default: m.StressMapScreen })))
const InsightsScreen = lazy(() => import('./components/insights/InsightsScreen').then(m => ({ default: m.InsightsScreen })))
const ResearchScreen = lazy(() => import('./components/research/ResearchScreen').then(m => ({ default: m.ResearchScreen })))
const ExperimentsScreen = lazy(() => import('./components/research/ExperimentsScreen').then(m => ({ default: m.ExperimentsScreen })))
const SleepScreen = lazy(() => import('./components/sleep/SleepScreen').then(m => ({ default: m.SleepScreen })))
const ActivityScreen = lazy(() => import('./components/activity/ActivityScreen').then(m => ({ default: m.ActivityScreen })))
const SupplementsScreen = lazy(() => import('./components/supplements/SupplementsScreen').then(m => ({ default: m.SupplementsScreen })))
const LabsScreen = lazy(() => import('./components/labs/LabsScreen').then(m => ({ default: m.LabsScreen })))
const NutritionScreen = lazy(() => import('./components/nutrition/NutritionScreen').then(m => ({ default: m.NutritionScreen })))
const SettingsScreen = lazy(() => import('./components/settings/SettingsScreen').then(m => ({ default: m.SettingsScreen })))
const GoalsScreen = lazy(() => import('./components/goals/GoalsScreen').then(m => ({ default: m.GoalsScreen })))
const ConcernsScreen = lazy(() => import('./components/concerns/ConcernsScreen').then(m => ({ default: m.ConcernsScreen })))
const HairScreen = lazy(() => import('./components/hair/HairScreen').then(m => ({ default: m.HairScreen })))
import type { AppView } from './store/appStore'
import type { CalendarEvent, DailyMetrics, HeartRateSample } from './types'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import { ThemeMenu } from './components/common/ThemeMenu'
import { isDemoActive, enableDemo, disableDemo } from './lib/demo'
import { supabase } from './lib/supabase'
import { syncMetricsToSupabase, loadMetricsFromSupabase, syncHRSamples, loadHRSamples } from './lib/sync'
import { persistDailyScores } from './lib/scores'
import { saveCalendarEvents, loadCalendarEvents } from './lib/calendarSync'
import { connectGoogleCalendar, silentGoogleCalendarSync, isGoogleCalendarAvailable } from './lib/googleCalendar'
import { shouldAutoSync } from './lib/syncSchedule'
import { detectAvailableMetrics } from './lib/availableMetrics'
import { useT } from './lib/i18n'
import './index.css'
import { startEffect } from './lib/startEffect'
import { syncProfileTimezone } from './lib/api/settings'


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
      { view: 'nutrition', label: 'Питание' },
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
      { view: 'research', label: 'Исследования' },
      { view: 'experiments', label: 'Эксперименты' },
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
  const { t, lang, setLang, locale } = useT()
  const { state, setView, setDaily, setEvents, setProgress, setError, setDeviceType } = useAppStore()
  const { user, loading, passwordRecovery, setPasswordRecovery } = useAuth()
  const { mode: themeMode, setMode: setThemeMode, toggle: toggleTheme } = useTheme('light')
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [intakeEvents, setIntakeEvents] = useState<Parameters<typeof QuickLog>[0]['events']>([])
  const [dbLoading, setDbLoading] = useState(true)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showGoogleEvents, setShowGoogleEvents] = useState(true)
  const [calSyncTimes, setCalSyncTimes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('cal_sync_times') ?? '{}') } catch { return {} }
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [guideDismissed, setGuideDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
  function dismissGuide() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setGuideDismissed(true)
  }
  // Смена аккаунта в этом браузере сбрасывает чужой прогресс/«Пропустить».
  // Паттерн «adjust state during render»: реагируем на смену user.id без эффекта.
  const [guideOwner, setGuideOwner] = useState<string | null>(null)
  if (user && guideOwner !== user.id) {
    ensureGuideOwner(user.id)
    setGuideOwner(user.id)
    setGuideDismissed(localStorage.getItem(DISMISSED_KEY) === '1')
  }

  const demo = isDemoActive()

  // Держим profiles.timezone в такт устройству: серверные локальные времена
  // (отчёт, чат, бот) читают эту колонку через _shared/userTimezone.ts.
  const tzSyncUserId = !demo && user ? user.id : null
  useEffect(() => {
    if (!tzSyncUserId) return
    startEffect(() => syncProfileTimezone(tzSyncUserId).catch(() => {}))
  }, [tzSyncUserId])

  function handleSignOut() {
    if (isDemoActive()) {
      disableDemo()
      window.location.hash = ''
      window.location.reload()
      return
    }
    supabase.auth.signOut()
  }

  const hasData = state.daily.length > 0
  const availableMetrics = React.useMemo(() => detectAvailableMetrics(state.daily), [state.daily])
  const googleConnected = state.events.some(e => e.source === 'google')
  const visibleEvents = showGoogleEvents
    ? state.events
    : state.events.filter(e => e.source !== 'google')

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!user) { setDbLoading(false); return }
      setDbLoading(true)
      // Демо-режим: фикстурные данные вместо Supabase (метрики + события лога).
      if (isDemoActive()) {
        const [{ makeDemoDaily, makeDemoHRSamples }, { demoList }] = await Promise.all([
          import('./lib/demoFixture'),
          import('./lib/demoDb'),
        ])
        if (cancelled) return
        setDaily(makeDemoDaily(), makeDemoHRSamples(), true)
        setIntakeEvents(demoList('intake_events') as typeof intakeEvents)
        setDbLoading(false)
        return
      }
      const [stored, intakeRes, calEvents] = await Promise.all([
        loadMetricsFromSupabase(user!.id),
        supabase.from('intake_events').select('*').eq('user_id', user!.id)
          .order('ts', { ascending: false }).limit(400),
        loadCalendarEvents(user!.id),
      ])

      if (cancelled) return

      const hrSamples = await loadHRSamples(user!.id)
      if (cancelled) return

      if (stored.length > 0) {
        setDaily(stored, hrSamples, true)
        persistDailyScores(user!.id, stored).catch(() => {})
      }
      if (intakeRes.data) setIntakeEvents(intakeRes.data as typeof intakeEvents)
      if (calEvents.length > 0) setEvents(calEvents)
      setDbLoading(false)
    }

    startEffect(init)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Авто-синхронизация Google Calendar «хотя бы раз в день»: при открытии приложения,
  // если в этом браузере уже был грант Google и прошло >24ч — тихо обновляем без попапа.
  // Серверный cron невозможен (браузерный OAuth-токен без refresh-token).
  const googleAutoSyncedRef = useRef(false)
  useEffect(() => {
    if (!user || dbLoading || googleAutoSyncedRef.current) return
    if (!isGoogleCalendarAvailable()) return
    const lastIso = localStorage.getItem('google_last_sync_iso')
    if (!lastIso || !shouldAutoSync(lastIso)) return // ещё не подключали тут / синк свежий
    googleAutoSyncedRef.current = true
    silentGoogleCalendarSync()
      .then(events => { if (events && events.length) handleEvents(events, 'google') })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dbLoading])

  async function handleDone(daily: DailyMetrics[], samples: HeartRateSample[], filename = 'export') {
    setDaily(daily, samples)
    if (!user) return
    loadCalendarEvents(user.id).then(calEvents => { if (calEvents.length > 0) setEvents(calEvents) })
    setSyncMsg(t('Синхронизируем…'))
    try {
      const [result, hrOk] = await Promise.all([
        syncMetricsToSupabase(user.id, daily, filename),
        syncHRSamples(user.id, samples),
      ])
      if (!hrOk) {
        setSyncMsg(t('⚠️ Не удалось сохранить пульс — подробности в консоли (F12)'))
        setTimeout(() => setSyncMsg(null), 10000)
        return
      }
      if (result.daysAdded > 0) {
        setSyncMsg(t('Добавлено {n} новых дней', { n: result.daysAdded }))
      } else {
        setSyncMsg(t('Данные актуальны'))
      }
      persistDailyScores(user.id, daily).catch(() => {})
    } catch (e) {
      setSyncMsg(t('Ошибка синхронизации: {msg}', { msg: (e as Error)?.message ?? 'unknown' }))
    }
    setTimeout(() => setSyncMsg(null), 4000)
  }

  async function handleEvents(events: CalendarEvent[], source = 'ics') {
    const tagged = events.map(e => ({ ...e, source }))
    setEvents(tagged, source)
    const now = new Date().toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    const updated = { ...calSyncTimes, [source]: now }
    setCalSyncTimes(updated)
    localStorage.setItem('cal_sync_times', JSON.stringify(updated))
    // ISO-метка для гейта авто-синка (локализованную строку выше распарсить нельзя)
    if (source === 'google') localStorage.setItem('google_last_sync_iso', new Date().toISOString())
    if (!user) return
    const ok = await saveCalendarEvents(user.id, tagged, source)
    if (!ok) {
      setSyncMsg(t('⚠️ Таблица calendar_events не создана — запусти SQL в Supabase'))
      setTimeout(() => setSyncMsg(null), 8000)
    } else {
      setSyncMsg(t('Сохранено {n} событий календаря', { n: events.length }))
      setTimeout(() => setSyncMsg(null), 3000)
    }
  }

  async function handleGoogleCalendar() {
    setGoogleLoading(true)
    try {
      const events = await connectGoogleCalendar()
      await handleEvents(events, 'google')
      setSyncMsg(t('Загружено {n} событий из Google', { n: events.length }))
      setTimeout(() => setSyncMsg(null), 4000)
    } catch {
      setSyncMsg(t('Ошибка Google Calendar'))
      setTimeout(() => setSyncMsg(null), 3000)
    }
    setGoogleLoading(false)
  }

  if (loading) return <DashboardSkeleton />
  if (!user) {
    const view = unauthedView({ isResetUrl: isResetUrl(window.location.search), showAuth })
    return view === 'auth'
      ? <AuthScreen onBack={() => setShowAuth(false)} />
      : <LandingScreen onTry={() => setShowAuth(true)} onDemo={() => { enableDemo(); window.location.reload() }} onToggleTheme={toggleTheme} />
  }
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
      {(hasData || dbLoading) && (
        <>
          <header className="topbar">
            <button className="logo-btn" onClick={() => setView('dashboard')}>Tonus</button>
            <nav className="topbar-nav">
              <button
                className={`nav-btn${state.view === 'dashboard' ? ' active' : ''}`}
                onClick={() => setView('dashboard')}
              >
                {t('Дашборд')}
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
              {hasData && (
                <Suspense fallback={null}>
                  <GeoStormBadge />
                  <StreakMenu daily={state.daily} />
                  <NotificationBell daily={state.daily} userId={user?.id ?? null} demo={demo} />
                </Suspense>
              )}
              <div className="lang-picker">
                <button
                  className="theme-toggle lang-toggle"
                  onClick={() => setLangMenuOpen(o => !o)}
                  title={t('Язык')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </button>
                {langMenuOpen && (
                  <>
                    <div className="lang-overlay" onClick={() => setLangMenuOpen(false)} />
                    <div className="lang-menu">
                      {([['ru','Русский','RU'],['uk','Українська','UA'],['en','English','EN']] as const).map(([code, label, short]) => (
                        <button key={code} className={`lang-option${lang === code ? ' active' : ''}`}
                          onClick={() => { setLang(code); setLangMenuOpen(false) }}>
                          <span className="lang-label">{label}</span>
                          <span className="lang-code">{short}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <ThemeMenu mode={themeMode} onSelect={setThemeMode} />
              <button
                className={`theme-toggle${state.view === 'settings' ? ' active' : ''}`}
                onClick={() => setView('settings')}
                title={t('Настройки')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
              <button className="nav-btn signout-btn" onClick={handleSignOut}>
                {t('Выйти')}
              </button>
              <button className="burger-btn" onClick={() => setMobileMenuOpen(o => !o)} aria-label={t('Меню')}>
                <div className={`burger-icon${mobileMenuOpen ? ' open' : ''}`}>
                  <span /><span /><span />
                </div>
              </button>
            </div>
          </header>

          {mobileMenuOpen && (
            <div className={`mobile-menu-overlay${mobileMenuOpen ? ' open' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              <div className="mobile-menu" onClick={e => e.stopPropagation()}>
                <div className="mobile-menu-header">
                  <span className="mobile-menu-title">Tonus</span>
                  <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
                </div>
                <button
                  className={`mobile-nav-btn${state.view === 'settings' ? ' active' : ''}`}
                  onClick={() => { setView('settings'); setMobileMenuOpen(false) }}
                >
                  <span>⚙️</span><span>{t('Настройки')}</span>
                </button>
                <div className="mobile-theme-row">
                  {([['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Системная']] as const).map(([m, label]) => (
                    <button key={m} className={`mobile-theme-btn${themeMode === m ? ' active' : ''}`}
                      onClick={() => setThemeMode(m)}>
                      {t(label)}
                    </button>
                  ))}
                </div>
                <button
                  className="mobile-nav-btn"
                  onClick={() => setLang(lang === 'ru' ? 'uk' : lang === 'uk' ? 'en' : 'ru')}
                >
                  <span className="lang-code">{lang === 'ru' ? 'RU' : lang === 'uk' ? 'UA' : 'EN'}</span>
                  <span>{lang === 'ru' ? 'Русский' : lang === 'uk' ? 'Українська' : 'English'}</span>
                </button>
                <div className="mobile-menu-footer">
                  <button className="mobile-nav-btn signout" onClick={handleSignOut}>
                    <span>🚪</span><span>{t('Выйти')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

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

      {demo && hasData && (
        <div className="demo-banner">{t('Демо-режим — данные сгенерированы')}</div>
      )}

      {syncMsg && <div className="sync-toast">{syncMsg}</div>}

      <main className="main-content">
        {dbLoading ? <ScreenSkeleton /> : (
        <Suspense fallback={<ScreenSkeleton />}>
        {!hasData || state.view === 'upload' ? (
          !hasData && !guideDismissed ? (
            <ConnectGuide
              user={user}
              demo={demo}
              deviceType={state.deviceType}
              onSelectDevice={setDeviceType}
              onDismiss={dismissGuide}
              onDone={dismissGuide}
            />
          ) : state.deviceType == null ? (
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
          <MetricsScreen daily={state.daily} intakeEvents={intakeEvents} />
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
          <InsightsScreen daily={state.daily} intakeEvents={intakeEvents} />
        ) : state.view === 'research' ? (
          <ResearchScreen user={user} daily={state.daily} onNavigate={setView} />
        ) : state.view === 'experiments' ? (
          <ExperimentsScreen user={user} daily={state.daily} />
        ) : state.view === 'supplements' ? (
          <SupplementsScreen user={user} />
        ) : state.view === 'nutrition' ? (
          <NutritionScreen user={user} />
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
            lastSync={calSyncTimes['google'] ?? null}
            calLastSync={calSyncTimes['cal'] ?? null}
            onNavigate={setView}
            onCalEvents={e => handleEvents(e.map(ev => ({
              ...ev,
              start: ev.start instanceof Date ? ev.start : new Date(ev.start),
              end: ev.end instanceof Date ? ev.end : new Date(ev.end),
            })), 'cal')}
            deviceType={state.deviceType}
            onDeviceTypeChange={setDeviceType}
            daily={state.daily}
          />
        ) : null}
        </Suspense>
        )}
      </main>

      {hasData && <ChatWidget user={user} />}

      {hasData && (
        <nav className="bottom-nav">
          <button
            className={`bottom-nav-btn${state.view === 'dashboard' ? ' active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span>{t('Дашборд')}</span>
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
