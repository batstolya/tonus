import { describe, it, expect } from 'vitest'
import { isResetUrl, unauthedView } from './gating'

describe('isResetUrl', () => {
  it('true when ?reset present', () => { expect(isResetUrl('?reset=1')).toBe(true) })
  it('false when empty', () => { expect(isResetUrl('')).toBe(false) })
  it('false for unrelated params', () => { expect(isResetUrl('?foo=1')).toBe(false) })
})

describe('unauthedView', () => {
  it('landing by default', () => {
    expect(unauthedView({ isResetUrl: false, showAuth: false })).toBe('landing')
  })
  it('auth when showAuth', () => {
    expect(unauthedView({ isResetUrl: false, showAuth: true })).toBe('auth')
  })
  it('auth when reset url, even if not showAuth', () => {
    expect(unauthedView({ isResetUrl: true, showAuth: false })).toBe('auth')
  })
})
