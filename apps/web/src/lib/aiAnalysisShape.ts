import type { AiAnalysis } from './aiAnalysis'

// Analyses are a model's JSON, stored as-is. A row missing one of the lists
// used to blank the whole app: the card renders `item.good.length` when it is
// expanded, and an undefined there throws during render. Normalising at the
// boundary keeps a malformed row to a missing section.
//
// Dates are left empty rather than defaulted to "now": in a health record a
// wrong date reads as fact, while a missing one reads as missing.
const list = (v: unknown): string[] => (Array.isArray(v) ? v as string[] : [])
const text = (v: unknown): string => (typeof v === 'string' ? v : '')

export function normalizeAnalysis(row: Partial<AiAnalysis>): AiAnalysis {
  return {
    id: text(row.id),
    period_start: text(row.period_start),
    period_end: text(row.period_end),
    created_at: text(row.created_at),
    summary: text(row.summary),
    good: list(row.good),
    improve: list(row.improve),
    focus: list(row.focus),
    model: text(row.model),
    tokens_used: typeof row.tokens_used === 'number' ? row.tokens_used : null,
  }
}
