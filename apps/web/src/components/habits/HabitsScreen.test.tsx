import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders, screen, waitFor, fireEvent } from '../../test/utils'

const loadHabits = vi.fn()
const loadHabitBreaks = vi.fn()
const setHabitBreak = vi.fn()
const archiveHabit = vi.fn()
vi.mock('../../lib/api/habits', () => ({
  loadHabits: (...a: unknown[]) => loadHabits(...a),
  loadHabitBreaks: (...a: unknown[]) => loadHabitBreaks(...a),
  setHabitBreak: (...a: unknown[]) => setHabitBreak(...a),
  archiveHabit: (...a: unknown[]) => archiveHabit(...a),
  createHabit: vi.fn(), deleteHabit: vi.fn(),
}))

import { HabitsScreen } from './HabitsScreen'

const user = { id: 'u1' } as never
const habit = {
  id: 'h1', user_id: 'u1', name: 'Без сладкого', note: null,
  start_date: '2026-08-20', active: true, sort_order: 0, created_at: '2026-08-20T00:00:00Z',
}

beforeEach(() => {
  loadHabits.mockReset(); loadHabitBreaks.mockReset(); setHabitBreak.mockReset(); archiveHabit.mockReset()
  setHabitBreak.mockResolvedValue(undefined)
  archiveHabit.mockResolvedValue(undefined)
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

  it('unchecks a day and persists the slip', async () => {
    loadHabits.mockResolvedValue([habit]); loadHabitBreaks.mockResolvedValue([])
    renderWithProviders(<HabitsScreen user={user} />)
    const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10)
    await waitFor(() => expect(screen.getByTestId(`habit-day-${todayStr}`)).toBeTruthy())
    fireEvent.click(screen.getByTestId(`habit-day-${todayStr}`))
    await waitFor(() => expect(setHabitBreak).toHaveBeenCalledWith('u1', 'h1', todayStr, true))
  })

  it('keeps archived habits out of the main list', async () => {
    loadHabits.mockResolvedValue([{ ...habit, id: 'h2', name: 'Архивная', active: false }])
    loadHabitBreaks.mockResolvedValue([])
    renderWithProviders(<HabitsScreen user={user} />)
    await waitFor(() => expect(screen.getByTestId('habits-empty')).toBeTruthy())
    expect(screen.getByTestId('habits-archived')).toBeTruthy()
  })

  it('un-archives an archived habit instead of re-archiving it', async () => {
    loadHabits.mockResolvedValue([{ ...habit, id: 'h2', name: 'Архивная', active: false }])
    loadHabitBreaks.mockResolvedValue([])
    renderWithProviders(<HabitsScreen user={user} />)
    await screen.findByTestId('habits-archived')
    fireEvent.click(screen.getByText(/Archive/))
    fireEvent.click(screen.getByRole('button', { name: 'Restore habit' }))
    await waitFor(() => expect(archiveHabit).toHaveBeenCalledWith('h2', true))
  })

  it('archives an active habit', async () => {
    loadHabits.mockResolvedValue([habit])
    loadHabitBreaks.mockResolvedValue([])
    renderWithProviders(<HabitsScreen user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive habit' }))
    await waitFor(() => expect(archiveHabit).toHaveBeenCalledWith('h1', false))
  })
})
