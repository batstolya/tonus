import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders the title and optional text', () => {
    render(<EmptyState icon="🎯" title="No data yet" text="Add your first entry" />)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
    expect(screen.getByText('Add your first entry')).toBeInTheDocument()
  })

  it('fires the cta onClick when the button is pressed', () => {
    const onClick = vi.fn()
    render(<EmptyState icon="🔒" title="Locked" cta={{ label: 'Unlock', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
