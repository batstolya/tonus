import React, { useState, lazy, Suspense } from 'react'
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
const FocusBadge = lazy(() => import('./components/dashboard/FocusBadge').then(m => ({ default: m.FocusBadge })))
const TopbarAvatar = lazy(() => import('./components/ui/TopbarAvatar').then(m => ({ default: m.TopbarAvatar })))
const HeartRateScreen = lazy(() => import('./components/heart-rate/HeartRateScreen').then(m => ({ default: m.HeartRateScreen })))
const MetricsScreen = lazy(() => import('./components/metrics/MetricsScreen').then(m => ({ default: m.MetricsScreen })))
const StressMapScreen = lazy(() => import('./components/stress-map/StressMapScreen').then(m => ({ default: m.StressMapScreen })))
const InsightsScreen = lazy(() => import('./components/insights/InsightsScreen').then(m => ({ default: m.InsightsScreen })))
const ResearchScreen = lazy(() => import('./components/research/ResearchScreen').then(m => ({ default: m.ResearchScreen })))
const ExperimentsScreen = lazy(() => import('./components/research/ExperimentsScreen').then(m => ({ default: m.ExperimentsScreen })))
const SleepScreen = lazy(() => import('./components/sleep/SleepScreen').then(m => ({ default: m.SleepScreen })))
const ActivityScreen = lazy(() => import('./components/activity/ActivityScreen').then(m => ({ default: m.ActivityScreen })))
const SupplementsScreen = lazy(() => import('./components/supplements/SupplementsScreen').then(m => ({ default: m.SupplementsScreen })))
const HabitsScreen = lazy(() => import('./components/habits/HabitsScreen').then(m => ({ default: m.HabitsScreen })))
const LabsScreen = lazy(() => import('./components/labs/LabsScreen').then(m => ({ default: m.LabsScreen })))
const NutritionScreen = lazy(() => import('./components/nutrition/NutritionScreen').then(m => ({ default: m.NutritionScreen })))
const SettingsScreen = lazy(() => import('./components/settings/SettingsScreen').then(m => ({ default: m.SettingsScreen })))
const GoalsScreen = lazy(() => import('./components/goals/GoalsScreen').then(m => ({ default: m.GoalsScreen })))
const ConcernsScreen = lazy(() => import('./components/concerns/ConcernsScreen').then(m => ({ default: m.ConcernsScreen })))
const HairScreen = lazy(() => import('./components/hair/HairScreen').then(m => ({ default: m.HairScreen })))
const ObservationsScreen = lazy(() => import('./components/concerns/ObservationsScreen').then(m => ({ default: m.ObservationsScreen })))
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import { useNavLayout } from './hooks/useNavLayout'
import { Sidebar } from './components/navigation/Sidebar'
import { isDemoActive, enableDemo, disableDemo } from './lib/demo'
import { supabase } from './lib/supabase'
import { isGoogleCalendarAvailable } from './lib/googleCalendar'
import { detectAvailableMetrics } from './lib/availableMetrics'
import { useT } from './lib/i18n'
import { Icon } from './lib/icons'
import './index.css'
import { getActiveGroup, getActiveSubView, filterNavGroups } from './app/navigation'
import { useAppBootstrap } from './hooks/useAppBootstrap'
import { useImportHandlers } from './hooks/useImportHandlers'

export default function App() {
  const { t, lang, setLang, locale } = useT()
  const { state, setView, setDaily, setEvents, setProgress, setError, setDeviceType } = useAppStore()
  const { user, loading, passwordRecovery, setPasswordRecovery } = useAuth()
  const { theme, mode: themeMode, setMode: setThemeMode, toggle: toggleTheme } = useTheme('light')
  const { layout: navLayout, collapsed: navCollapsed, toggleCollapsed: toggleNavCollapsed } = useNavLayout()
  const { dbLoading, intakeEvents, setIntakeEvents } = useAppBootstrap({ user, setDaily, setEvents })
  const {
    syncMsg, googleLoading, showGoogleEvents, setShowGoogleEvents,
    calSyncTimes, handleDone, handleEvents, handleGoogleCalendar,
  } = useImportHandlers({ user, dbLoading, t, locale, setDaily, setEvents })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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

  if (loading) return <div className="app"><DashboardSkeleton /></div>
  if (!user) {
    const view = unauthedView({ isResetUrl: isResetUrl(window.location.search), showAuth })
    return view === 'auth'
      ? <AuthScreen onBack={() => setShowAuth(false)} />
      : <LandingScreen onTry={() => setShowAuth(true)} onDemo={() => { enableDemo(); window.location.reload() }} theme={theme} onToggleTheme={toggleTheme} />
  }
  if (passwordRecovery) return <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />

  const activeGroup = getActiveGroup(state.view)
  const activeSubView = getActiveSubView(state.view)

  const visibleNavGroups = filterNavGroups(availableMetrics)
  const activeGroupData = visibleNavGroups.find(g => g.id === activeGroup) ?? null

  // The sidebar only renders inside the (hasData || dbLoading) fragment below,
  // so the root's offset class must track that same condition — otherwise a
  // side-layout device with no data yet (fresh sign-in, no import) renders
  // onboarding inside an empty 240px gutter with no sidebar to fill it.
  const sideNav = navLayout === 'side' && (hasData || dbLoading)

  return (
    <div className={`app${sideNav ? ' app--side' : ''}`}>
      {(hasData || dbLoading) && (
        <>
          {sideNav && (
            <Sidebar
              groups={visibleNavGroups}
              view={state.view}
              activeGroup={activeGroup}
              activeSubView={activeSubView}
              collapsed={navCollapsed}
              onToggleCollapsed={toggleNavCollapsed}
              onNavigate={setView}
            />
          )}
          <header className="topbar">
            <button className="logo-btn" onClick={() => setView('dashboard')}>Tonus</button>
            {navLayout === 'top' && (
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
            )}

            <div className="topbar-right">
              {hasData && (
                <Suspense fallback={null}>
                  <GeoStormBadge />
                  {user && <FocusBadge user={user} daily={state.daily} />}
                  <StreakMenu daily={state.daily} />
                  <NotificationBell daily={state.daily} userId={user?.id ?? null} demo={demo} />
                </Suspense>
              )}
              {user && (
                <Suspense fallback={null}>
                  <TopbarAvatar
                    user={user}
                    lang={lang}
                    onSelectLang={setLang}
                    themeMode={themeMode}
                    onSelectTheme={setThemeMode}
                    onOpenSettings={() => setView('settings')}
                    onSignOut={handleSignOut}
                  />
                </Suspense>
              )}
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
                  <Icon name="settings" className="mobile-nav-icon" />
                  <span>{t('Настройки')}</span>
                  <Icon name="chevronRight" className="mobile-nav-chevron" />
                </button>
                <div className="mobile-menu-section">
                  <div className="mobile-menu-caption">{t('Тема')}</div>
                  <div className="mobile-segmented">
                    {([['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Системная']] as const).map(([m, label]) => (
                      <button key={m} className={`mobile-segmented-btn${themeMode === m ? ' active' : ''}`}
                        onClick={() => setThemeMode(m)}>
                        {t(label)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mobile-menu-section">
                  <div className="mobile-menu-caption">{t('Язык')}</div>
                  <div className="mobile-segmented">
                    {([['ru', 'RU'], ['uk', 'UA'], ['en', 'EN']] as const).map(([code, short]) => (
                      <button key={code} className={`mobile-segmented-btn${lang === code ? ' active' : ''}`}
                        onClick={() => setLang(code)}>
                        {short}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mobile-menu-footer">
                  <button className="mobile-nav-btn signout" onClick={handleSignOut}>
                    <Icon name="signOut" className="mobile-nav-icon" />
                    <span>{t('Выйти')}</span>
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
            userId={user.id}
            events={visibleEvents}
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
        ) : state.view === 'habits' ? (
          <HabitsScreen user={user} />
        ) : state.view === 'nutrition' ? (
          <NutritionScreen user={user} />
        ) : state.view === 'labs' ? (
          <LabsScreen user={user} />
        ) : state.view === 'goals' ? (
          <GoalsScreen user={user} daily={state.daily} />
        ) : state.view === 'concerns' ? (
          <ConcernsScreen user={user} onNavigateTab={setView} />
        ) : state.view === 'observations' ? (
          <ObservationsScreen user={user} onNavigate={setView} />
        ) : state.view === 'hair' ? (
          <HairScreen user={user} onNavigateTab={setView} />
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
