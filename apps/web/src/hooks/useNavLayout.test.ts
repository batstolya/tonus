import { describe, it, expect } from 'vitest'
import { resolveNavLayout, resolveNavCollapsed } from './useNavLayout'

describe('resolveNavLayout', () => {
  it('accepts both known layouts', () => {
    expect(resolveNavLayout('top')).toBe('top')
    expect(resolveNavLayout('side')).toBe('side')
  })
  it('falls back to top for missing or unknown values', () => {
    expect(resolveNavLayout(null)).toBe('top')
    expect(resolveNavLayout('')).toBe('top')
    expect(resolveNavLayout('sidebar')).toBe('top')
    expect(resolveNavLayout('SIDE')).toBe('top')
  })
})

describe('resolveNavCollapsed', () => {
  it('is collapsed only for the stored "1"', () => {
    expect(resolveNavCollapsed('1')).toBe(true)
    expect(resolveNavCollapsed('0')).toBe(false)
    expect(resolveNavCollapsed(null)).toBe(false)
    expect(resolveNavCollapsed('true')).toBe(false)
  })
})
