import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { cleanup, fireEvent, renderWithProviders, screen, waitFor } from '../../../test/utils'
import { translations } from '../../../lib/translations'

const mocks = vi.hoisted(() => ({
  loadAiConsent: vi.fn(),
  grantAiConsent: vi.fn(),
  revokeAiConsent: vi.fn(),
}))
vi.mock('../../../lib/aiConsent', () => ({
  loadAiConsent: mocks.loadAiConsent,
  grantAiConsent: mocks.grantAiConsent,
  revokeAiConsent: mocks.revokeAiConsent,
}))

import { AiConsentSection } from './AiConsentSection'

const user = { id: 'user-1' } as User
const COPY_KEYS = [
  'Обработка данных ИИ',
  'Разрешить обработку данных через Google Gemini',
  'Отозвать согласие',
  'Дать согласие',
  'Новое согласие действует на всех устройствах. Отзыв блокирует следующие обращения к ИИ.',
  'Отзыв не удаляет данные, которые Google уже обработал по своим условиям.',
]

describe('AiConsentSection', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('grants durable consent from Settings', async () => {
    mocks.loadAiConsent.mockResolvedValue({ granted: false, grantedAt: null })
    mocks.grantAiConsent.mockResolvedValue(undefined)
    renderWithProviders(<AiConsentSection user={user} />)

    const grant = await screen.findByRole('button', { name: 'Grant consent' })
    expect(screen.getByText(/does not erase data that Google has already processed/i)).toBeInTheDocument()
    fireEvent.click(grant)

    await waitFor(() => expect(mocks.grantAiConsent).toHaveBeenCalledWith('user-1'))
    expect(await screen.findByRole('button', { name: 'Revoke consent' })).toBeInTheDocument()
  })

  it('revokes durable consent from Settings', async () => {
    mocks.loadAiConsent.mockResolvedValue({ granted: true, grantedAt: '2026-07-16T00:00:00Z' })
    mocks.revokeAiConsent.mockResolvedValue(undefined)
    renderWithProviders(<AiConsentSection user={user} />)

    const revoke = await screen.findByRole('button', { name: 'Revoke consent' })
    fireEvent.click(revoke)

    await waitFor(() => expect(mocks.revokeAiConsent).toHaveBeenCalledWith('user-1'))
    expect(await screen.findByRole('button', { name: 'Grant consent' })).toBeInTheDocument()
  })

  it('has English and Ukrainian copy for the consent controls', () => {
    for (const key of COPY_KEYS) {
      expect(translations[key]?.en, `missing English translation for ${key}`).toBeTruthy()
      expect(translations[key]?.uk, `missing Ukrainian translation for ${key}`).toBeTruthy()
    }
  })
})
