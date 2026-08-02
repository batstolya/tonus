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
