import { describe, it, expect } from 'vitest'
import { buildClassifyPrompt } from './classifyPrompt.ts'

describe('buildClassifyPrompt', () => {
  const now = new Date('2026-06-22T16:19:00.000Z') // 18:19 Берлин

  it('includes the current local time as the "now" anchor', () => {
    const p = buildClassifyPrompt('час назад ел творог', [], now, 'Europe/Berlin')
    expect(p).toContain('18:19')
    expect(p).toContain('2026-06-22')
  })

  it('declares a minutes_ago field for relative time', () => {
    const p = buildClassifyPrompt('час назад ел творог', [], now, 'Europe/Berlin')
    expect(p).toContain('minutes_ago')
  })

  it('instructs how to map "назад" expressions', () => {
    const p = buildClassifyPrompt('час назад ел творог', [], now, 'Europe/Berlin')
    expect(p).toContain('назад')
  })

  it('lists the user supplements', () => {
    const p = buildClassifyPrompt('принял финастерид', ['Финастерид'], now, 'Europe/Berlin')
    expect(p).toContain('Финастерид')
  })
})
