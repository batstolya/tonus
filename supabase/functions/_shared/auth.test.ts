import { describe, it, expect } from 'vitest'
import { secretMatches, isValidCronSecret, isValidTelegramSecret, isValidAdminSecret } from './auth.ts'

const reqWith = (headers: Record<string, string>) =>
  new Request('https://x/', { method: 'POST', headers })

describe('secretMatches (fail closed)', () => {
  it('denies when expected secret is missing/empty', () => {
    expect(secretMatches('anything', undefined)).toBe(false)
    expect(secretMatches('anything', '')).toBe(false)
  })
  it('denies when provided value is missing/empty', () => {
    expect(secretMatches(null, 'topsecret')).toBe(false)
    expect(secretMatches('', 'topsecret')).toBe(false)
  })
  it('denies on mismatch', () => {
    expect(secretMatches('wrong', 'topsecret')).toBe(false)
  })
  it('denies on length-only prefix match (no partial credit)', () => {
    expect(secretMatches('topsecret', 'topsecretXYZ')).toBe(false)
  })
  it('accepts an exact match', () => {
    expect(secretMatches('topsecret', 'topsecret')).toBe(true)
  })
})

describe('request header readers', () => {
  it('cron: reads x-cron-secret', () => {
    expect(isValidCronSecret(reqWith({ 'x-cron-secret': 's' }), 's')).toBe(true)
    expect(isValidCronSecret(reqWith({}), 's')).toBe(false)
    expect(isValidCronSecret(reqWith({ 'x-cron-secret': 's' }), '')).toBe(false)
  })
  it('telegram: reads X-Telegram-Bot-Api-Secret-Token (case-insensitive)', () => {
    expect(isValidTelegramSecret(reqWith({ 'x-telegram-bot-api-secret-token': 't' }), 't')).toBe(true)
    expect(isValidTelegramSecret(reqWith({}), 't')).toBe(false)
  })
  it('admin: reads x-admin-secret', () => {
    expect(isValidAdminSecret(reqWith({ 'x-admin-secret': 'a' }), 'a')).toBe(true)
    expect(isValidAdminSecret(reqWith({}), 'a')).toBe(false)
  })
})
