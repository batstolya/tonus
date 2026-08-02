import { describe, it, expect } from 'vitest'
import { normalizeLang, langPrepositional, langNominative, langInstruction, loadUserLang, type ProfileLangClient } from './replyLang.ts'

function profileClient(data: { lang?: string | null } | null): ProfileLangClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data }) }),
      }),
    }),
  }
}

describe('loadUserLang', () => {
  it('reads the mirrored UI language for cron paths', async () => {
    expect(await loadUserLang(profileClient({ lang: 'uk' }), 'u1')).toBe('uk')
  })

  it('falls back to ru when the profile has no language yet', async () => {
    expect(await loadUserLang(profileClient({ lang: null }), 'u1')).toBe('ru')
    expect(await loadUserLang(profileClient(null), 'u1')).toBe('ru')
  })
})

describe('normalizeLang', () => {
  it('keeps every supported language', () => {
    expect(normalizeLang('ru')).toBe('ru')
    expect(normalizeLang('uk')).toBe('uk')
    expect(normalizeLang('en')).toBe('en')
  })

  it('falls back to ru for unknown or missing input', () => {
    expect(normalizeLang('de')).toBe('ru')
    expect(normalizeLang(undefined)).toBe('ru')
    expect(normalizeLang(null)).toBe('ru')
    expect(normalizeLang(42)).toBe('ru')
  })
})

describe('language names', () => {
  it('renders Ukrainian rather than silently defaulting to Russian', () => {
    expect(langPrepositional('uk')).toBe('украинском')
    expect(langNominative('uk')).toBe('украинский')
  })

  it('renders English', () => {
    expect(langPrepositional('en')).toBe('английском')
    expect(langNominative('en')).toBe('английский')
  })
})

describe('langInstruction', () => {
  it('names the language in both cases', () => {
    const line = langInstruction('uk')
    expect(line).toContain('украинский')
    expect(line).toContain('украинском')
  })

  it('never leaves the instruction empty', () => {
    for (const lang of ['ru', 'uk', 'en', 'zz']) {
      expect(langInstruction(lang).length).toBeGreaterThan(10)
    }
  })
})
