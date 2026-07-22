import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, renderWithProviders, screen, waitFor } from '../../../test/utils'
import { EdgeFunctionError } from '../../../lib/edgeFunctions'

const mocks = vi.hoisted(() => ({
  callFunction: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../../../lib/edgeFunctions', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/edgeFunctions')>()
  return { ...original, callFunction: mocks.callFunction }
})
vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: { signOut: mocks.signOut } },
}))

import { DeleteAccountSection } from './DeleteAccountSection'

function openForm() {
  renderWithProviders(<DeleteAccountSection />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete account…' }))
}

describe('DeleteAccountSection', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps the destructive button disabled until password and the DELETE word are entered', () => {
    openForm()
    const submit = screen.getByRole('button', { name: 'Delete forever' })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'pw' } })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Type DELETE to confirm/), { target: { value: 'delete' } })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Type DELETE to confirm/), { target: { value: 'DELETE' } })
    expect(submit).toBeEnabled()
  })

  it('sends password and confirmation, then signs out', async () => {
    mocks.callFunction.mockResolvedValue({ deleted: true })
    mocks.signOut.mockResolvedValue({ error: null })
    const assignSpy = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign: assignSpy },
    })

    openForm()
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'pw' } })
    fireEvent.change(screen.getByLabelText(/Type DELETE to confirm/), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }))

    await waitFor(() => expect(mocks.callFunction).toHaveBeenCalledWith('delete-account', { password: 'pw', confirm: 'DELETE' }))
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled())
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('/'))
    Object.defineProperty(window, 'location', { configurable: true, value: original })
  })

  it('shows the re-auth error and keeps the account on wrong password', async () => {
    mocks.callFunction.mockRejectedValue(new EdgeFunctionError('reauth_failed', 403, 'reauth_failed'))

    openForm()
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'wrong' } })
    fireEvent.change(screen.getByLabelText(/Type DELETE to confirm/), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }))

    expect(await screen.findByText('Wrong password. The account was not deleted.')).toBeInTheDocument()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
