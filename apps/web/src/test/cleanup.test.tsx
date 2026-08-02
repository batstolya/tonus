import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from './utils'

// Guards the auto-cleanup wired in vitest.setup.ts. The jsdom project runs
// without `globals: true`, so Testing Library does not install its own
// afterEach(cleanup): without it renders pile up inside a file and the second
// test below fails with "found multiple elements". Both tests render the same
// markup on purpose — that is the whole point.
function Probe() {
  return <p>cleanup probe</p>
}

describe('jsdom render isolation', () => {
  it('renders the probe once', () => {
    renderWithProviders(<Probe />)
    expect(screen.getByText('cleanup probe')).toBeTruthy()
  })

  it('still finds exactly one probe after a previous test rendered it', () => {
    renderWithProviders(<Probe />)
    expect(screen.getAllByText('cleanup probe')).toHaveLength(1)
  })
})
