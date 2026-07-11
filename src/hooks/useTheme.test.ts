import { describe, it, expect } from 'vitest'
import { resolveTheme, resolveMode, themeFromMode } from './useTheme'

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

describe('resolveMode', () => {
  it('accepts explicit modes', () => {
    expect(resolveMode('dark')).toBe('dark')
    expect(resolveMode('light')).toBe('light')
    expect(resolveMode('system')).toBe('system')
  })
  it('garbage and null → system', () => {
    expect(resolveMode(null)).toBe('system')
    expect(resolveMode('banana')).toBe('system')
  })
})

describe('themeFromMode', () => {
  it('explicit mode wins regardless of OS', () => {
    expect(themeFromMode('dark', false, 'light')).toBe('dark')
    expect(themeFromMode('light', true, 'dark')).toBe('light')
  })
  it('system follows OS theme', () => {
    expect(themeFromMode('system', true, 'light')).toBe('dark')
    expect(themeFromMode('system', false, 'dark')).toBe('light')
  })
  it('system without matchMedia falls back to context default', () => {
    expect(themeFromMode('system', null, 'light')).toBe('light')
    expect(themeFromMode('system', null, 'dark')).toBe('dark')
  })
})
