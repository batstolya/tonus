import { describe, it, expect } from 'vitest'
import { isServiceRoleCall } from './serviceRoleAuth.ts'

const reqWith = (headers: Record<string, string>) =>
  new Request('https://x/', { method: 'POST', headers })

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
