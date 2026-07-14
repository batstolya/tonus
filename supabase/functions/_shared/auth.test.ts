import { describe, it, expect } from 'vitest'
import { secretMatches, isValidCronSecret, isValidTelegramSecret, isValidAdminSecret, isServiceRoleCall } from './auth.ts'

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

// Regression for the authorization bypass: prefix comparison accepted any
// Supabase JWT because the first 20 characters encode the shared HS256 header.
describe('isServiceRoleCall', () => {
  const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.SERVICE_SIGNATURE'
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.ANON_SIGNATURE'

  it('accepts our own service-role call', () => {
    expect(isServiceRoleCall(reqWith({ Authorization: `Bearer ${SERVICE_KEY}` }), SERVICE_KEY)).toBe(true)
  })

  it('accepts a case-insensitive Bearer scheme', () => {
    expect(isServiceRoleCall(reqWith({ Authorization: `bearer ${SERVICE_KEY}` }), SERVICE_KEY)).toBe(true)
  })

  it('rejects the public anon key, which shares the JWT header prefix', () => {
    expect(ANON_KEY.slice(0, 20)).toBe(SERVICE_KEY.slice(0, 20)) // This shared prefix caused the bypass.
    expect(isServiceRoleCall(reqWith({ Authorization: `Bearer ${ANON_KEY}` }), SERVICE_KEY)).toBe(false)
  })

  it("rejects a user's access token", () => {
    const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIn0.USER_SIGNATURE'
    expect(isServiceRoleCall(reqWith({ Authorization: `Bearer ${userToken}` }), SERVICE_KEY)).toBe(false)
  })

  it('rejects malformed authorization headers', () => {
    expect(isServiceRoleCall(reqWith({ Authorization: SERVICE_KEY }), SERVICE_KEY)).toBe(false)
    expect(isServiceRoleCall(reqWith({ Authorization: `Basic ${SERVICE_KEY}` }), SERVICE_KEY)).toBe(false)
    expect(isServiceRoleCall(reqWith({ Authorization: `Bearer  ${SERVICE_KEY}` }), SERVICE_KEY)).toBe(false)
    expect(isServiceRoleCall(reqWith({ Authorization: `Bearer ${SERVICE_KEY} extra` }), SERVICE_KEY)).toBe(false)
  })

  it('fails closed when the service key is not configured', () => {
    expect(isServiceRoleCall(reqWith({ Authorization: 'Bearer whatever' }), '')).toBe(false)
    expect(isServiceRoleCall(reqWith({ Authorization: 'Bearer ' }), undefined)).toBe(false)
  })

  it('rejects a missing Authorization header', () => {
    expect(isServiceRoleCall(reqWith({}), SERVICE_KEY)).toBe(false)
  })
})
