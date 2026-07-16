import { describe, expect, it } from 'vitest'
import { corsHeadersFor, resolveCorsOrigin } from './cors.ts'

const ALLOW = 'https://tonus-anatolii-s-projects6.vercel.app, http://localhost:5173'

describe('resolveCorsOrigin', () => {
  it('echoes an allowlisted origin', () => {
    expect(resolveCorsOrigin('http://localhost:5173', ALLOW)).toBe('http://localhost:5173')
  })
  it('rejects an unknown origin', () => {
    expect(resolveCorsOrigin('https://evil.example', ALLOW)).toBeNull()
  })
  it('fails closed on empty allowlist or missing origin', () => {
    expect(resolveCorsOrigin('http://localhost:5173', '')).toBeNull()
    expect(resolveCorsOrigin(null, ALLOW)).toBeNull()
  })
})

describe('corsHeadersFor', () => {
  it('grants headers only to allowlisted origins', () => {
    const h = corsHeadersFor('http://localhost:5173', ALLOW)
    expect(h['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(h['Vary']).toBe('Origin')
    expect(h['Access-Control-Allow-Headers']).toContain('authorization')
  })
  it('returns no grant otherwise', () => {
    expect(corsHeadersFor('https://evil.example', ALLOW)).toEqual({})
    expect(corsHeadersFor(null, '')).toEqual({})
  })
})
