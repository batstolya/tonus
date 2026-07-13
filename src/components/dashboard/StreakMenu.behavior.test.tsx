import { describe, it, expect } from 'vitest'
import { renderWithProviders, fireEvent } from '../../test/utils'
import { StreakMenu } from './StreakMenu'

describe('StreakMenu', () => {
  it('renders the trigger collapsed with a zero streak for empty history', () => {
    const { container } = renderWithProviders(<StreakMenu daily={[]} />)
    const trigger = container.querySelector('.streak-menu-trigger')
    expect(trigger).not.toBeNull()
    expect(trigger!.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('#streak-menu-panel')).toBeNull()
    expect(container.querySelector('.streak-menu-count')!.textContent).toBe('0')
  })

  it('opens the streak panel on click', () => {
    const { container } = renderWithProviders(<StreakMenu daily={[]} />)
    fireEvent.click(container.querySelector('.streak-menu-trigger')!)
    expect(container.querySelector('.streak-menu-trigger')!.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('#streak-menu-panel')).not.toBeNull()
  })
})
