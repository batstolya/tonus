import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, screen, fireEvent, cleanup } from './test/utils'

// App wires together several data-loading hooks (auth, bootstrap, imports)
// that otherwise hit Supabase or demo fixtures on mount. None of that is
// relevant to the mobile drawer: stubbing them with a signed-in user and
// dbLoading:true is enough to make App render its header/drawer chrome via
// the `hasData || dbLoading` gate (App.tsx) while the main content area
// collapses to a skeleton, so no lazy screens or network mocking are needed.
vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'test@example.com' },
    loading: false,
    passwordRecovery: false,
    setPasswordRecovery: () => {},
  }),
}))
vi.mock('./hooks/useAppBootstrap', () => ({
  useAppBootstrap: () => ({ dbLoading: true, intakeEvents: [], setIntakeEvents: () => {} }),
}))
vi.mock('./hooks/useImportHandlers', () => ({
  useImportHandlers: () => ({
    syncMsg: null,
    googleLoading: false,
    showGoogleEvents: true,
    setShowGoogleEvents: () => {},
    calSyncTimes: {},
    handleDone: () => {},
    handleEvents: () => {},
    handleGoogleCalendar: () => {},
  }),
}))

import App from './App'

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

function openDrawer() {
  const { container } = renderWithProviders(<App />)
  fireEvent.click(container.querySelector('.burger-btn')!)
  return container
}

// The language row is the second `.mobile-segmented` group in the drawer
// (theme comes first) — scope queries to it so the RU/UA/EN buttons aren't
// confused with the theme segments.
function langSegments(container: HTMLElement) {
  return container.querySelectorAll('.mobile-segmented')[1]
}

describe('App mobile drawer language segments', () => {
  it('selects Ukrainian directly on UA, not by advancing one step from the current language', () => {
    // Starting language is 'en'. The old behaviour was a single unlabeled
    // button cycling ru -> uk -> en on every tap regardless of which control
    // was pressed, so from 'en' it always landed on 'ru'. If that regression
    // reappears, clicking the UA segment would still show 'ru' here instead
    // of 'uk' — this assertion is the one that would catch it.
    openDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'UA' }))
    expect(localStorage.getItem('lang')).toBe('uk')
  })

  it('selects English directly on EN from a Ukrainian start', () => {
    localStorage.setItem('lang', 'uk')
    openDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(localStorage.getItem('lang')).toBe('en')
  })

  it('marks exactly the active language segment, no neighbour', () => {
    const container = openDrawer()
    const segments = langSegments(container)
    const buttons = Array.from(segments.querySelectorAll('.mobile-segmented-btn'))
    const active = buttons.filter(b => b.className.includes('active')).map(b => b.textContent)
    expect(active).toEqual(['EN'])
  })
})

describe('App desktop account controls', () => {
  it('keeps account actions behind the single profile button', async () => {
    const { container } = renderWithProviders(<App />)

    const profile = await screen.findByRole('button', { name: 'Profile' })
    expect(screen.getAllByRole('button', { name: 'Profile' })).toHaveLength(1)
    expect(container.querySelector('.topbar > .topbar-right > .signout-btn')).toBeNull()
    expect(container.querySelector('.topbar button[title="Language"]')).toBeNull()
    expect(container.querySelector('.topbar button[title="Theme"]')).toBeNull()
    expect(container.querySelector('.topbar button[title="Settings"]')).toBeNull()

    fireEvent.click(profile)

    expect(screen.getByRole('button', { name: /Language/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Theme/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})

describe('navigation layout', () => {
  it('defaults to the top layout: no sidebar, no marker class', () => {
    const { container } = renderWithProviders(<App />)
    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.querySelector('.app')!.className).not.toContain('app--side')
    expect(container.querySelector('.topbar-nav')).toBeTruthy()
  })

  it('renders the sidebar and marks the root when the side layout is stored', () => {
    localStorage.setItem('navLayout', 'side')
    const { container } = renderWithProviders(<App />)
    expect(container.querySelector('.sidebar')).toBeTruthy()
    expect(container.querySelector('.app')!.className).toContain('app--side')
    expect(container.querySelector('.topbar-nav')).toBeNull()
  })

  it('keeps the sidebar collapsed when that is stored', () => {
    localStorage.setItem('navLayout', 'side')
    localStorage.setItem('navCollapsed', '1')
    const { container } = renderWithProviders(<App />)
    expect(container.querySelector('.sidebar')!.className).toContain('sidebar--collapsed')
  })

  it('keeps the header logo in the DOM in side mode, for narrow screens where the sidebar is hidden by CSS', () => {
    localStorage.setItem('navLayout', 'side')
    const { container } = renderWithProviders(<App />)
    expect(container.querySelector('.logo-btn')).toBeTruthy()
    expect(container.querySelector('.topbar-nav')).toBeNull()
  })
})
