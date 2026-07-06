import { describe, it, expect, beforeEach } from 'vitest'
import { stepsFor, loadGuideProgress, saveGuideProgress, clearGuideProgress } from './guideState'

// Окружение vitest — node: подменяем localStorage простым in-memory стабом.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage
})

describe('stepsFor', () => {
  it('apple: полный путь HAE', () => {
    expect(stepsFor('apple_watch', null)).toEqual(
      ['device', 'explain', 'install', 'automation', 'webhook', 'schedule', 'verify']
    )
  })
  it('xiaomi без выбора телефона: останавливается на вопросе', () => {
    expect(stepsFor('xiaomi', null)).toEqual(['device', 'explain', 'phone'])
  })
  it('xiaomi + iphone: Mi Fitness → путь HAE', () => {
    expect(stepsFor('xiaomi', 'iphone')).toEqual(
      ['device', 'explain', 'phone', 'mifitness', 'install', 'automation', 'webhook', 'schedule', 'verify']
    )
  })
  it('xiaomi + android: заглушка', () => {
    expect(stepsFor('xiaomi', 'android')).toEqual(['device', 'explain', 'phone', 'android_soon'])
  })
  it('устройство не выбрано: только первый шаг', () => {
    expect(stepsFor(null, null)).toEqual(['device'])
  })
})

describe('прогресс в localStorage', () => {
  it('пустое хранилище → шаг 0 без телефона', () => {
    expect(loadGuideProgress()).toEqual({ step: 0, phone: null })
  })
  it('save → load восстанавливает шаг и телефон', () => {
    saveGuideProgress({ step: 4, phone: 'iphone' })
    expect(loadGuideProgress()).toEqual({ step: 4, phone: 'iphone' })
  })
  it('мусор в хранилище не ломает загрузку', () => {
    store.set('tonus.connectGuideStep', 'abc')
    store.set('tonus.connectGuidePhone', 'nokia')
    expect(loadGuideProgress()).toEqual({ step: 0, phone: null })
  })
  it('clear стирает прогресс', () => {
    saveGuideProgress({ step: 3, phone: 'android' })
    clearGuideProgress()
    expect(loadGuideProgress()).toEqual({ step: 0, phone: null })
  })
})
