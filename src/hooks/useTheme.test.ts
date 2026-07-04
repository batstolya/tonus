import { describe, it, expect } from 'vitest'
import { resolveTheme } from './useTheme'

// Чистая логика выбора темы: сохранённый выбор побеждает, мусор игнорируется.
describe('resolveTheme', () => {
  it('uses saved theme when valid', () => {
    expect(resolveTheme('dark', 'light')).toBe('dark')
    expect(resolveTheme('light', 'dark')).toBe('light')
  })
  it('falls back when nothing saved', () => {
    expect(resolveTheme(null, 'light')).toBe('light')
    expect(resolveTheme(null, 'dark')).toBe('dark')
  })
  it('falls back on garbage values', () => {
    expect(resolveTheme('banana', 'light')).toBe('light')
    expect(resolveTheme('', 'dark')).toBe('dark')
  })
})
