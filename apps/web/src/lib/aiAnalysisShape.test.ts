import { describe, it, expect } from 'vitest'
import { normalizeAnalysis } from './aiAnalysisShape'

// The card renders `item.good.length`, so a row without that array took the
// whole app down — a blank screen, not a missing section. The rows come from a
// model's JSON, so a missing field is a thing that can actually happen.
describe('normalizeAnalysis', () => {
  const full = {
    id: 'a1', period_start: '2026-07-01', period_end: '2026-07-14',
    created_at: '2026-07-14T10:00:00Z', summary: 'ok',
    good: ['g'], improve: ['i'], focus: ['f'],
    model: 'gemini', tokens_used: 10,
  }

  it('leaves a complete row alone', () => {
    expect(normalizeAnalysis(full)).toEqual(full)
  })

  it('fills missing lists with empty arrays', () => {
    const n = normalizeAnalysis({ ...full, good: undefined, improve: undefined, focus: undefined })
    expect(n.good).toEqual([])
    expect(n.improve).toEqual([])
    expect(n.focus).toEqual([])
  })

  it('replaces a non-array list rather than trusting it', () => {
    const n = normalizeAnalysis({ ...full, good: 'not a list' as unknown as string[] })
    expect(n.good).toEqual([])
  })

  it('keeps summary as a string when it is missing', () => {
    // The collapsed card calls summary.split('.'), which would throw too.
    expect(normalizeAnalysis({ ...full, summary: undefined }).summary).toBe('')
  })

  it('does not invent dates it was not given', () => {
    // A wrong date is worse than a visibly missing one in a health record.
    const n = normalizeAnalysis({ ...full, created_at: undefined })
    expect(n.created_at).toBe('')
  })

  it('survives a completely empty object', () => {
    const n = normalizeAnalysis({})
    expect(n.good).toEqual([])
    expect(n.summary).toBe('')
    expect(n.id).toBe('')
  })
})
