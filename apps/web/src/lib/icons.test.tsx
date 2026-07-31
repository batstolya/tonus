import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ICONS, Icon, type IconName } from './icons'

const names = Object.keys(ICONS) as IconName[]

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('icon registry', () => {
  it('covers every name with a Phosphor component and the emoji it replaces', () => {
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const entry = ICONS[name]
      expect(typeof entry.icon, `${name}.icon`).toBe('object')
      expect(entry.emoji, `${name}.emoji`).toMatch(/\S/)
    }
  })

  it('renders an svg for every name', () => {
    for (const name of names) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg'), `${name} should render an svg`).not.toBeNull()
      unmount()
    }
  })

  it('renders the emoji instead when VITE_ICONS is 0', () => {
    vi.stubEnv('VITE_ICONS', '0')
    for (const name of names) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg'), `${name} should not render an svg`).toBeNull()
      expect(container.textContent, `${name} should render its emoji`).toBe(ICONS[name].emoji)
      unmount()
    }
  })

  it('hides decorative icons from screen readers', () => {
    const { container } = render(<Icon name="streak" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
  })

  it('exposes a label when the icon carries the meaning', () => {
    const { container } = render(<Icon name="streak" title="Серия" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('Серия')
    expect(svg.getAttribute('aria-hidden')).toBeNull()
  })

  it('labels the emoji fallback the same way', () => {
    vi.stubEnv('VITE_ICONS', '0')
    const { container } = render(<Icon name="streak" title="Серия" />)
    const span = container.querySelector('span')!
    expect(span.getAttribute('role')).toBe('img')
    expect(span.getAttribute('aria-label')).toBe('Серия')
  })
})
