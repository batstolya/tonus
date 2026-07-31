import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../test/utils'
import { ProfileSection } from './ProfileSection'
import { translations } from '../../../lib/translations'
import type { User } from '@supabase/supabase-js'

// Labels follow the UI language, which the harness detects as en.
const ui = (ru: string) => translations[ru]?.en ?? ru

const save = vi.fn(() => Promise.resolve(true))
vi.mock('../../../lib/api/settings', () => ({
  loadProfileBasics: () => Promise.resolve({ birth_year: 1988, sex: 'male' }),
  saveProfileBasics: (...args: unknown[]) => save(...args),
}))

const user = { id: 'u1' } as User

beforeEach(() => save.mockClear())

describe('ProfileSection', () => {
  it('shows the stored birth year', async () => {
    renderWithProviders(<ProfileSection archived={false} onArchive={() => {}} user={user} />)
    await waitFor(() => expect((screen.getByLabelText(ui('Год рождения')) as HTMLInputElement).value).toBe('1988'))
  })

  it('saves a new birth year', async () => {
    renderWithProviders(<ProfileSection archived={false} onArchive={() => {}} user={user} />)
    const input = await screen.findByLabelText(ui('Год рождения'))
    fireEvent.change(input, { target: { value: '1990' } })
    fireEvent.blur(input)
    await waitFor(() => expect(save).toHaveBeenCalledWith('u1', { birth_year: 1990 }))
  })

  it('keeps non-digits out of the year field', async () => {
    renderWithProviders(<ProfileSection archived={false} onArchive={() => {}} user={user} />)
    const input = await screen.findByLabelText(ui('Год рождения')) as HTMLInputElement
    fireEvent.change(input, { target: { value: '19x9' } })
    expect(input.value).toBe('199')
  })
})
