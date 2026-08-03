import { describe, it, expect, afterEach } from 'vitest'
import { renderWithProviders, cleanup } from '../../test/utils'
import { Avatar } from './Avatar'

afterEach(cleanup)

describe('Avatar', () => {
  it('draws the fallback when there is no photo', () => {
    const { container } = renderWithProviders(<Avatar url={null} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('draws the photo when there is one', () => {
    const { container } = renderWithProviders(<Avatar url="https://example.test/a.jpg" alt="me" />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.test/a.jpg')
    expect(img?.getAttribute('alt')).toBe('me')
    // Fallback and photo are alternatives, never both at once.
    expect(container.querySelector('svg')).toBeNull()
  })

  it('sizes the circle and scales the fallback with it', () => {
    const { container } = renderWithProviders(<Avatar url={null} size={64} />)
    const circle = container.querySelector('.avatar') as HTMLElement
    expect(circle.style.width).toBe('64px')
    expect(circle.style.height).toBe('64px')
    const svg = container.querySelector('svg')
    expect(Number(svg?.getAttribute('width'))).toBeLessThan(64)
  })
})
