import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from './EmptyState'
import { Icon } from '../../lib/icons'

describe('EmptyState', () => {
  it('renders the title and optional text', () => {
    render(<EmptyState icon={<Icon name="focus" />} title="No data yet" text="Add your first entry" />)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
    expect(screen.getByText('Add your first entry')).toBeInTheDocument()
  })

  it('fires the cta onClick when the button is pressed', () => {
    const onClick = vi.fn()
    render(<EmptyState icon={<Icon name="warning" />} title="Warning" cta={{ label: 'Unlock', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
