import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { cleanup, fireEvent, renderWithProviders, screen } from '../../test/utils'
import type { ThemeMode } from '../../hooks/useTheme'
import type { Lang } from '../../lib/i18n'

const { getAvatarUrl } = vi.hoisted(() => ({ getAvatarUrl: vi.fn().mockResolvedValue(null) }))

vi.mock('../../lib/api/avatar', () => ({ getAvatarUrl }))

import { TopbarAvatar } from './TopbarAvatar'

const props = {
  user: { id: 'u1', email: 'test@example.com' } as User,
  lang: 'en' as Lang,
  onSelectLang: vi.fn(),
  themeMode: 'system' as ThemeMode,
  onSelectTheme: vi.fn(),
  onOpenSettings: vi.fn(),
  onSignOut: vi.fn(),
}

function renderAvatar() {
  return renderWithProviders(<TopbarAvatar {...props} />)
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
}

beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('TopbarAvatar account menu', () => {
  it('opens with the account summary and current selections', () => {
    renderAvatar()

    openMenu()

    expect(screen.getByText('test@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Language/ })).toHaveTextContent('EN')
    expect(screen.getByRole('button', { name: /Theme/ })).toHaveTextContent('System')
  })

  it('selects a language and returns to the main view', () => {
    renderAvatar()
    openMenu()

    fireEvent.click(screen.getByRole('button', { name: /Language/ }))
    fireEvent.click(screen.getByRole('button', { name: 'UA' }))

    expect(props.onSelectLang).toHaveBeenCalledWith('uk')
    expect(screen.getByRole('button', { name: /Language/ })).toBeInTheDocument()
  })

  it('selects a theme and returns to the main view', () => {
    renderAvatar()
    openMenu()

    fireEvent.click(screen.getByRole('button', { name: /Theme/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))

    expect(props.onSelectTheme).toHaveBeenCalledWith('dark')
    expect(screen.getByRole('button', { name: /Theme/ })).toBeInTheDocument()
  })

  it('opens settings and closes the menu', () => {
    renderAvatar()
    openMenu()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(props.onOpenSettings).toHaveBeenCalledOnce()
    expect(screen.queryByText('test@example.com')).not.toBeInTheDocument()
  })

  it('signs out and closes the menu', () => {
    renderAvatar()
    openMenu()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(props.onSignOut).toHaveBeenCalledOnce()
    expect(screen.queryByText('test@example.com')).not.toBeInTheDocument()
  })

  it('closes on an outside click', () => {
    const { container } = renderAvatar()
    openMenu()

    fireEvent.click(container.querySelector('.account-menu-overlay')!)

    expect(screen.getByRole('button', { name: 'Profile' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('test@example.com')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    renderAvatar()
    openMenu()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByRole('button', { name: 'Profile' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('test@example.com')).not.toBeInTheDocument()
  })
})
