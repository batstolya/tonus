import { describe, it, expect } from 'vitest'
import { hashPin, isUnlocked, isMasked, maskConcernLabel } from './privacy'

describe('hashPin', () => {
  it('детерминированный SHA-256 hex', async () => {
    const a = await hashPin('1234')
    const b = await hashPin('1234')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it('разные PIN — разные хэши', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('1235'))
  })
})

describe('isUnlocked / isMasked (node: sessionStorage недоступен)', () => {
  it('без sessionStorage считается запертым', () => {
    expect(isUnlocked()).toBe(false)
  })
  it('маскируем только приватные при заданном PIN', () => {
    expect(isMasked(true, true)).toBe(true)
    expect(isMasked(true, false)).toBe(false) // PIN сброшен — записи видимы
    expect(isMasked(false, true)).toBe(false)
  })
  it('maskConcernLabel прячет имя только когда нужно', () => {
    expect(maskConcernLabel('Стул', true, true)).toBe('🔒 Скрытая проблема')
    expect(maskConcernLabel('Стул', true, false)).toBe('Стул')
    expect(maskConcernLabel('Прыщи', false, true)).toBe('Прыщи')
  })
})
