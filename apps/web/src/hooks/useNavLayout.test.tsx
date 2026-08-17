import { describe, it, expect, beforeEach } from 'vitest'
import { renderWithProviders, screen, fireEvent } from '../test/utils'
import { useNavLayout } from './useNavLayout'

// Two independent call sites, like App.tsx (sidebar) and NavLayoutSection.tsx
// (settings switch) in production. A regression here means one component's
// change is invisible to the other until a page reload.
function LayoutReader() {
  const { layout } = useNavLayout()
  return <div data-testid="layout-reader">{layout}</div>
}

function LayoutSetter() {
  const { setLayout } = useNavLayout()
  return (
    <button type="button" onClick={() => setLayout('side')}>
      switch to side
    </button>
  )
}

function CollapsedReader() {
  const { collapsed } = useNavLayout()
  return <div data-testid="collapsed-reader">{String(collapsed)}</div>
}

function CollapsedToggler() {
  const { toggleCollapsed } = useNavLayout()
  return (
    <button type="button" onClick={() => toggleCollapsed()}>
      toggle collapsed
    </button>
  )
}

describe('useNavLayout cross-component sync', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('propagates setLayout from one consumer to a sibling consumer without reload', () => {
    renderWithProviders(
      <>
        <LayoutReader />
        <LayoutSetter />
      </>,
    )

    expect(screen.getByTestId('layout-reader').textContent).toBe('top')

    fireEvent.click(screen.getByRole('button', { name: 'switch to side' }))

    expect(screen.getByTestId('layout-reader').textContent).toBe('side')
  })

  it('propagates toggleCollapsed from one consumer to a sibling consumer without reload', () => {
    renderWithProviders(
      <>
        <CollapsedReader />
        <CollapsedToggler />
      </>,
    )

    expect(screen.getByTestId('collapsed-reader').textContent).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'toggle collapsed' }))

    expect(screen.getByTestId('collapsed-reader').textContent).toBe('true')
  })
})
