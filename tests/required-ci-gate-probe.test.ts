import { describe, expect, it } from 'vitest'

describe('required CI gate acceptance probe', () => {
  it('fails intentionally so GitHub must block merge', () => {
    expect('required-check-probe').toBe('blocked')
  })
})
