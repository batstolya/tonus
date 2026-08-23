import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { DoctorReport } from './DoctorReport'
import { translations } from '../../lib/translations'
import type { DailyMetrics } from '../../types'
import type { User } from '@supabase/supabase-js'

// The unlock state is what the setup screen and the printed report must agree
// on: before this test the screen offered a tick box for a private concern and
// the model dropped it anyway, so ticking did nothing.
const unlocked = vi.hoisted(() => ({ value: false }))
vi.mock('../../lib/privacy', () => ({ isUnlocked: () => unlocked.value }))

vi.mock('../../lib/doctorReport/load', async () => {
  const actual = await vi.importActual<typeof import('../../lib/doctorReport/load')>(
    '../../lib/doctorReport/load')
  return {
    ...actual,
    loadReportSources: async () => ({
      labs: [], supplements: [], supplementLogs: [], notes: [], intake: [], nutrition: [], concernLogs: [], observations: [],
      profile: null,
      concerns: [
        { id: 'p', user_id: 'u1', name: 'Приватная жалоба', category: 'other', status: 'active',
          started_at: null, notes: null, is_private: true, created_at: '2026-08-01' },
        { id: 'o', user_id: 'u1', name: 'Открытая жалоба', category: 'other', status: 'active',
          started_at: null, notes: null, is_private: false, created_at: '2026-08-01' },
      ],
    }),
  }
})

const ui = (ru: string) => translations[ru]?.en ?? ru
const user = { id: 'u1' } as User
const daily: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - i)
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    restingHeartRate: 58, sleepHours: 7, steps: 9000,
  }
})

beforeEach(() => { unlocked.value = false })

describe('DoctorReport private concerns', () => {
  it('offers no tick box for a private concern while locked', async () => {
    renderWithProviders(<DoctorReport user={user} daily={daily} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Открытая жалоба')).toBeTruthy())
    expect(screen.queryByText('Приватная жалоба')).toBeNull()
  })

  it('prints an unlocked private concern once it is ticked', async () => {
    unlocked.value = true
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Приватная жалоба')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Приватная жалоба'))
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('Проблемы и жалобы')).toBeTruthy())
    expect(container.textContent).toContain('Приватная жалоба')
  })

  it('leaves an unlocked private concern out of the report while it is unticked', async () => {
    unlocked.value = true
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Приватная жалоба')).toBeTruthy())
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('Проблемы и жалобы')).toBeTruthy())
    expect(container.textContent).toContain('Открытая жалоба')
    expect(container.textContent).not.toContain('Приватная жалоба')
  })
})
