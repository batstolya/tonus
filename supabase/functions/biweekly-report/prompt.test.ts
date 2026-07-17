import { describe, expect, it } from 'vitest'
import { buildReportPrompt, type ReportPromptInput } from './prompt.ts'

const base: ReportPromptInput = {
  periodLabel: '14 дн.',
  digest1: '=== Последние 2 недели (2026-07-02 — 2026-07-15) ===\nПокрытие данных: метрики 14/14 дней, сон 11/14 ночей',
  digest2: '=== Предыдущие 2 недели (2026-06-18 — 2026-07-01) ===\nПокрытие данных: метрики 13/14 дней, сон 12/14 ночей',
  lateFact: 'Поздние засыпания (после 01:00 локального): текущий период 10, предыдущий 12',
  extraBlocks: '\nКислород (SpO2): средн 96%, мин 96%',
  detail: 'full',
  sensitive: false,
}

describe('buildReportPrompt contract', () => {
  it('embeds both digests, the precomputed fact line and the extra blocks verbatim', () => {
    const p = buildReportPrompt(base)
    expect(p).toContain(base.digest1)
    expect(p).toContain(base.digest2)
    expect(p).toContain(base.lateFact)
    expect(p).toContain(base.extraBlocks)
    expect(p).toContain('за 14 дн.')
  })

  it('always carries the accuracy constraints from PR #99', () => {
    const p = buildReportPrompt(base)
    expect(p).toContain('не пересчитывай')
    expect(p).toContain('Покрытие данных')
    expect(p).toContain('Без медицинских диагнозов')
    expect(p).toContain('факт из данных / возможная связь / предположение')
    expect(p).toContain('без markdown')
    expect(p).toContain('На русском')
  })

  it('switches format by detail level', () => {
    expect(buildReportPrompt({ ...base, detail: 'short' })).toContain('КРАТКО')
    expect(buildReportPrompt({ ...base, detail: 'medium' })).toContain('СРЕДНЕ')
    expect(buildReportPrompt(base)).toContain('ПОДРОБНО')
  })

  it('mentions meds/labs sections only in sensitive full mode', () => {
    expect(buildReportPrompt({ ...base, sensitive: true })).toContain('💊 Препараты')
    expect(buildReportPrompt(base)).not.toContain('💊 Препараты')
  })
})
