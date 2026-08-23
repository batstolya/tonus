import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

// Spec: docs/superpowers/specs/2026-08-23-observations-design.md

const lib = vi.hoisted(() => ({
  loadObservations: vi.fn(),
  addObservation: vi.fn(),
  deleteObservation: vi.fn().mockResolvedValue(undefined),
  OBSERVATION_TAGS: ['sleep', 'skin', 'gut', 'wellbeing', 'other'] as const,
  OBSERVATION_TAG_LABEL: {
    sleep: 'Сон', skin: 'Кожа', gut: 'ЖКТ', wellbeing: 'Самочувствие', other: 'Другое',
  },
}))
vi.mock('../../lib/observations', () => lib)

import { ObservationsScreen } from './ObservationsScreen'

const user = { id: 'u1' } as User

const observation = (over: Partial<{ id: string; date: string; at_time: string | null; tag: string; note: string }> = {}) => ({
  id: 'o1', user_id: 'u1', date: '2026-08-20', at_time: '09:30:00',
  tag: 'skin', note: 'Existing note', created_at: '2026-08-20', ...over,
})

beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('ObservationsScreen', () => {
  it('lists stored observations with their time and tag', async () => {
    lib.loadObservations.mockResolvedValue([observation()])
    renderWithProviders(<ObservationsScreen user={user} />)
    await waitFor(() => expect(screen.getByText('Existing note')).toBeTruthy())
    expect(screen.getByText('09:30')).toBeTruthy()
    // The tag chip and the filter button share the label, so both are expected.
    expect(screen.getAllByText('Skin').length).toBeGreaterThan(1)
  })

  it('puts a new observation at the top of the list', async () => {
    lib.loadObservations.mockResolvedValue([observation()])
    lib.addObservation.mockImplementation((_uid: string, obs: { note: string }) =>
      Promise.resolve({ ...observation({ id: 'o2', date: '2026-08-23' }), ...obs }))
    renderWithProviders(<ObservationsScreen user={user} />)
    await waitFor(() => expect(screen.getByText('Existing note')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('What did you notice?'), {
      target: { value: 'Hair loss looks worse' },
    })
    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => expect(screen.getByText('Hair loss looks worse')).toBeTruthy())
    const notes = screen.getAllByText(/Hair loss looks worse|Existing note/)
    expect(notes[0].textContent).toBe('Hair loss looks worse')
  })

  it('sends the picked tag with the entry', async () => {
    lib.loadObservations.mockResolvedValue([])
    lib.addObservation.mockResolvedValue(observation({ id: 'o3', tag: 'gut', note: 'Heavy lunch' }))
    renderWithProviders(<ObservationsScreen user={user} />)
    await waitFor(() => expect(screen.getByPlaceholderText('What did you notice?')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('What did you notice?'), {
      target: { value: 'Heavy lunch' },
    })
    fireEvent.click(screen.getByText('Digestion'))
    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => expect(lib.addObservation).toHaveBeenCalled())
    expect(lib.addObservation.mock.calls[0][1]).toMatchObject({ tag: 'gut', note: 'Heavy lunch' })
  })

  it('refuses to save an empty note', async () => {
    lib.loadObservations.mockResolvedValue([])
    renderWithProviders(<ObservationsScreen user={user} />)
    await waitFor(() => expect(screen.getByPlaceholderText('What did you notice?')).toBeTruthy())
    fireEvent.click(screen.getByText('Add'))
    expect(lib.addObservation).not.toHaveBeenCalled()
  })

  it('removes a deleted observation from the list', async () => {
    lib.loadObservations.mockResolvedValue([observation()])
    renderWithProviders(<ObservationsScreen user={user} />)
    await waitFor(() => expect(screen.getByText('Existing note')).toBeTruthy())

    fireEvent.click(screen.getByTitle('Delete'))
    await waitFor(() => expect(screen.queryByText('Existing note')).toBeNull())
    expect(lib.deleteObservation).toHaveBeenCalledWith('o1')
  })
})
