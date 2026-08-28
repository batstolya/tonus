import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders, screen, waitFor, fireEvent } from '../../test/utils'

const loadHabits = vi.fn()
const loadHabitBreaks = vi.fn()
const setHabitBreak = vi.fn()
vi.mock('../../lib/api/habits', () => ({
  loadHabits: (...a: unknown[]) => loadHabits(...a),
  loadHabitBreaks: (...a: unknown[]) => loadHabitBreaks(...a),
  setHabitBreak: (...a: unknown[]) => setHabitBreak(...a),
  createHabit: vi.fn(), archiveHabit: vi.fn(), deleteHabit: vi.fn(),
}))

import { HabitsScreen } from './HabitsScreen'

const user = { id: 'u1' } as never
const habit = {
  id: 'h1', user_id: 'u1', name: 'Без сладкого', note: null,
  start_date: '2026-08-20', active: true, sort_order: 0, created_at: '2026-08-20T00:00:00Z',
}

beforeEach(() => {
  loadHabits.mockReset(); loadHabitBreaks.mockReset(); setHabitBreak.mockReset()
  setHabitBreak.mockResolvedValue(undefined)
})

describe('HabitsScreen', () => {
  it('offers to add a habit when there are none', async () => {
    loadHabits.mockResolvedValue([]); loadHabitBreaks.mockResolvedValue([])
    renderWithProviders(<HabitsScreen user={user} />)
    await waitFor(() => expect(screen.getByTestId('habits-empty')).toBeTruthy())
  })

  it('renders a card per active habit', async () => {
    loadHabits.mockResolvedValue([habit]); loadHabitBreaks.mockResolvedValue([])
    renderWithProviders(<HabitsScreen user={user} />)
    await waitFor(() => expect(screen.getByText('Без сладкого')).toBeTruthy())
  })

  it('persists a break and keeps the card in sync', async () => {
    loadHabits.mockResolvedValue([habit]); loadHabitBreaks.mockResolvedValue([])
    renderWithProviders(<HabitsScreen user={user} />)
    await waitFor(() => expect(screen.getByTestId('habit-break-today')).toBeTruthy())
    fireEvent.click(screen.getByTestId('habit-break-today'))
    await waitFor(() => expect(setHabitBreak).toHaveBeenCalledWith('u1', 'h1', expect.any(String), true))
  })

  it('keeps archived habits out of the main list', async () => {
    loadHabits.mockResolvedValue([{ ...habit, id: 'h2', name: 'Архивная', active: false }])
    loadHabitBreaks.mockResolvedValue([])
    renderWithProviders(<HabitsScreen user={user} />)
    await waitFor(() => expect(screen.getByTestId('habits-empty')).toBeTruthy())
    expect(screen.getByTestId('habits-archived')).toBeTruthy()
  })
})
