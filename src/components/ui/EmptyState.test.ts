import { describe, it, expect } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('exports a component', () => {
    expect(typeof EmptyState).toBe('function')
  })
})
