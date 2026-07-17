import { describe, expect, it } from 'vitest'
import { buildReportPrompt, type ReportPromptInput } from './prompt.ts'
import { checkReportInvariants, type ReportFacts } from './reportInvariants.ts'

// On-demand model eval: runs the production prompt against the real Gemini
// 2.5 Flash and asserts prose invariants. Skipped without a key (CI has none):
//   GEMINI_API_KEY=... npx vitest run --project node supabase/functions/biweekly-report/report.eval.test.ts
const KEY = process.env.GEMINI_API_KEY

interface Golden { name: string; input: ReportPromptInput; facts: ReportFacts }

const normalPeriod: Golden = {
  name: 'normal period',
  facts: { lateCurrent: 10, latePrev: 12 },
  input: {
    periodLabel: '14 дн.',
    digest1: [
      '=== Последние 2 недели (2026-07-02 — 2026-07-15) ===',
      'Покрытие данных: метрики 14/14 дней, сон 11/14 ночей',
      'ЧСС покоя: 46 уд/мин',
      'HRV: среднее 85 мс',
      'HRV ниже 80% личной 4-недельной медианы (82 мс): 2026-07-13 (58мс), 2026-07-14 (64мс)',
      'Сон: 7.3 ч, ночей ≥7ч: 10/11',
      'Шаги: 8,961/день',
      'Позднее засыпание: 2026-07-11 (02:13), 2026-07-12 (01:35), 2026-07-13 (02:04)',
    ].join('\n'),
    digest2: [
      '=== Предыдущие 2 недели (2026-06-18 — 2026-07-01) ===',
      'Покрытие данных: метрики 13/14 дней, сон 12/14 ночей',
      'ЧСС покоя: 51 уд/мин',
      'HRV: среднее 79 мс',
      'Сон: 7.3 ч, ночей ≥7ч: 8/12',
      'Шаги: 8,577/день',
    ].join('\n'),
    lateFact: 'Поздние засыпания (после 01:00 локального): текущий период 10, предыдущий 12',
    extraBlocks: [
      '',
      'Кислород (SpO2): средн 96%, мин 96%',
      'Заметки: 2026-07-02 «расстройство ЖКТ, нет аппетита», 2026-07-03 «нет сил, аппетита нет»',
    ].join('\n'),
    detail: 'full',
    sensitive: false,
  },
}

const sparsePeriod: Golden = {
  name: 'sparse data period',
  facts: { lateCurrent: 1, latePrev: 0 },
  input: {
    periodLabel: '14 дн.',
    digest1: [
      '=== Последние 2 недели (2026-07-02 — 2026-07-15) ===',
      'Покрытие данных: метрики 4/14 дней, сон 3/14 ночей',
      'HRV: среднее 78 мс',
      'Сон: 6.9 ч, ночей ≥7ч: 1/3',
      'Позднее засыпание: 2026-07-14 (01:20)',
    ].join('\n'),
    digest2: 'Предыдущие 2 недели: нет данных',
    lateFact: 'Поздние засыпания (после 01:00 локального): текущий период 1, предыдущий 0',
    extraBlocks: '',
    detail: 'full',
    sensitive: false,
  },
}

async function generate(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Same generation config as production (index.ts).
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

describe.skipIf(!KEY)('report prose eval (live Gemini)', () => {
  for (const golden of [normalPeriod, sparsePeriod]) {
    it(`holds invariants: ${golden.name}`, { timeout: 90_000 }, async () => {
      const report = await generate(buildReportPrompt(golden.input))
      expect(report.length).toBeGreaterThan(200)
      expect(checkReportInvariants(report, golden.facts)).toEqual([])
    })
  }
})
