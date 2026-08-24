import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

// Doses per day: a day cell walks every dose before resetting, and a partial
// day shows "2/3" instead of the checkmark.
// Spec: docs/superpowers/specs/2026-08-23-supplement-multi-dose-design.md

const lib = vi.hoisted(() => ({
  loadSupplements: vi.fn(),
  addSupplement: vi.fn(),
  deleteSupplement: vi.fn().mockResolvedValue(undefined),
  updateStock: vi.fn().mockResolvedValue(true),
  updateDosesPerDay: vi.fn().mockResolvedValue(true),
  loadLogsForMonth: vi.fn().mockResolvedValue([]),
  setDoseCount: vi.fn().mockResolvedValue(undefined),
  loadReminders: vi.fn().mockResolvedValue({}),
  saveReminder: vi.fn().mockResolvedValue(true),
}))
vi.mock('../../lib/supplements', () => lib)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))
vi.mock('../../lib/api/supplements', () => ({
  getAdherenceLogs: vi.fn().mockResolvedValue([]),
  getTreatments: vi.fn().mockResolvedValue([]),
  getSupplementOptions: vi.fn().mockResolvedValue([]),
  getMetricDailyRows: vi.fn().mockResolvedValue([]),
  createTreatment: vi.fn(),
  deleteTreatment: vi.fn().mockResolvedValue(undefined),
}))

import { SupplementsScreen } from './SupplementsScreen'

const user = { id: 'u1' } as User
const today = new Date()
const todayStr = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10)

const supplement = (dosesPerDay: number) => ({
  id: 's1', user_id: 'u1', name: 'Magnesium', default_dose: '400', unit: 'mg',
  active: true, sort_order: 0, created_at: '2026-07-01', stock_count: null,
  doses_per_day: dosesPerDay,
})

const cellForToday = () => screen.getByTitle(new RegExp(`^${todayStr}`))

beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('SupplementsScreen reminder bell', () => {
  it('marks the bell active when a reminder is on and has times', async () => {
    lib.loadSupplements.mockResolvedValue([supplement(1)])
    lib.loadReminders.mockResolvedValue({
      s1: { supplement_id: 's1', times: ['09:00'], weekdays: [1,2,3,4,5,6,7], timezone: 'Europe/Kyiv', quiet_until: null, enabled: true },
    })
    renderWithProviders(<SupplementsScreen user={user} />)
    await waitFor(() => expect(screen.getByTitle('Reminders').className).toContain('active'))
  })

  it('leaves the bell inactive when the reminder is off or has no times', async () => {
    lib.loadSupplements.mockResolvedValue([supplement(1)])
    lib.loadReminders.mockResolvedValue({
      s1: { supplement_id: 's1', times: [], weekdays: [1,2,3,4,5,6,7], timezone: 'Europe/Kyiv', quiet_until: null, enabled: true },
    })
    renderWithProviders(<SupplementsScreen user={user} />)
    await waitFor(() => expect(screen.getByTitle('Reminders')).toBeTruthy())
    expect(screen.getByTitle('Reminders').className).not.toContain('active')
  })
})

describe('SupplementsScreen dose cells', () => {
  it('walks every dose on click and then resets', async () => {
    lib.loadSupplements.mockResolvedValue([supplement(3)])
    renderWithProviders(<SupplementsScreen user={user} />)
    await waitFor(() => expect(cellForToday()).toBeTruthy())

    fireEvent.click(cellForToday())
    await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy())
    expect(lib.setDoseCount).toHaveBeenLastCalledWith('u1', 's1', todayStr, 1)

    fireEvent.click(cellForToday())
    await waitFor(() => expect(screen.getByText('2/3')).toBeTruthy())

    // Third click completes the day: the checkmark replaces the counter.
    fireEvent.click(cellForToday())
    await waitFor(() => expect(screen.queryByText('3/3')).toBeNull())
    expect(lib.setDoseCount).toHaveBeenLastCalledWith('u1', 's1', todayStr, 3)

    fireEvent.click(cellForToday())
    await waitFor(() => expect(lib.setDoseCount).toHaveBeenLastCalledWith('u1', 's1', todayStr, 0))
  })

  it('keeps the plain toggle for a once-a-day supplement', async () => {
    lib.loadSupplements.mockResolvedValue([supplement(1)])
    renderWithProviders(<SupplementsScreen user={user} />)
    await waitFor(() => expect(cellForToday()).toBeTruthy())

    fireEvent.click(cellForToday())
    await waitFor(() => expect(lib.setDoseCount).toHaveBeenLastCalledWith('u1', 's1', todayStr, 1))
    expect(screen.queryByText('1/1')).toBeNull()

    fireEvent.click(cellForToday())
    await waitFor(() => expect(lib.setDoseCount).toHaveBeenLastCalledWith('u1', 's1', todayStr, 0))
  })

  it('renders a stored partial day as its dose count', async () => {
    lib.loadSupplements.mockResolvedValue([supplement(3)])
    lib.loadLogsForMonth.mockResolvedValue([{
      id: 'l1', supplement_id: 's1', date: todayStr,
      taken: true, taken_count: 2, dose: null, note: null,
    }])
    renderWithProviders(<SupplementsScreen user={user} />)
    await waitFor(() => expect(screen.getByText('2/3')).toBeTruthy())
  })
})
