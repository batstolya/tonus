import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initPlatform, createInMemoryStorage, persistentStorage, ephemeralStorage, getDeviceLocale } from './platform'
import { isDemoActive, enableDemo, disableDemo } from './demo'
import { isUnlocked, lock } from './privacy'
import { detectLang } from './translate'

function initInMemory(locale = 'en-GB') {
  initPlatform({
    persistentStorage: createInMemoryStorage(),
    ephemeralStorage: createInMemoryStorage(),
    getDeviceLocale: () => locale,
  })
}

describe('platform module', () => {
  beforeEach(() => initInMemory())

  it('fails fast when used before initialization', async () => {
    vi.resetModules()
    const fresh = await import('./platform')
    expect(() => fresh.persistentStorage.get('x')).toThrow(/initPlatform/)
    expect(() => fresh.getDeviceLocale()).toThrow(/initPlatform/)
  })

  it('in-memory storage round-trips and scopes are independent', () => {
    persistentStorage.set('k', 'v')
    expect(persistentStorage.get('k')).toBe('v')
    expect(ephemeralStorage.get('k')).toBeNull()
    persistentStorage.remove('k')
    expect(persistentStorage.get('k')).toBeNull()
  })

  it('exposes the injected device locale', () => {
    initInMemory('uk-UA')
    expect(getDeviceLocale()).toBe('uk-UA')
  })
})

describe('demo flag over the adapter', () => {
  beforeEach(() => initInMemory())

  it('toggles via persistent storage', () => {
    expect(isDemoActive()).toBe(false) // env demo=false in vitest.env-setup.ts
    enableDemo()
    expect(isDemoActive()).toBe(true)
    disableDemo()
    expect(isDemoActive()).toBe(false)
  })
})

describe('PIN unlock over the adapter', () => {
  beforeEach(() => initInMemory())

  it('is locked by default and reads the ephemeral scope', () => {
    expect(isUnlocked()).toBe(false)
    ephemeralStorage.set('tonus_privacy_unlocked', '1')
    expect(isUnlocked()).toBe(true)
    lock()
    expect(isUnlocked()).toBe(false)
  })
})

describe('language detection fallbacks', () => {
  it('uses a saved supported language', () => {
    initInMemory('de-DE')
    persistentStorage.set('lang', 'uk')
    expect(detectLang()).toBe('uk')
  })

  it('ignores legacy saved ru and falls through to the device locale', () => {
    initInMemory('uk-UA')
    persistentStorage.set('lang', 'ru')
    expect(detectLang()).toBe('uk')
    initInMemory('de-DE')
    persistentStorage.set('lang', 'ru')
    expect(detectLang()).toBe('en')
  })

  it('falls back to the device locale', () => {
    initInMemory('uk-UA')
    expect(detectLang()).toBe('uk')
  })

  it('defaults to English for unsupported locales', () => {
    initInMemory('de-DE')
    expect(detectLang()).toBe('en')
  })
})
