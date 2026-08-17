import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, screen, fireEvent, cleanup } from '../../../test/utils'
import { NavLayoutSection } from './NavLayoutSection'

beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); localStorage.clear() })

describe('NavLayoutSection', () => {
  it('shows the top layout as selected by default', () => {
    renderWithProviders(<NavLayoutSection archived={false} onArchive={() => {}} />)
    expect(screen.getByRole('button', { name: 'Top' }).className).toContain('on')
    expect(screen.getByRole('button', { name: 'Side' }).className).not.toContain('on')
  })

  it('stores the side layout when picked', () => {
    renderWithProviders(<NavLayoutSection archived={false} onArchive={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Side' }))
    expect(localStorage.getItem('navLayout')).toBe('side')
    expect(screen.getByRole('button', { name: 'Side' }).className).toContain('on')
  })

  it('reads the stored choice on mount', () => {
    localStorage.setItem('navLayout', 'side')
    renderWithProviders(<NavLayoutSection archived={false} onArchive={() => {}} />)
    expect(screen.getByRole('button', { name: 'Side' }).className).toContain('on')
  })
})
