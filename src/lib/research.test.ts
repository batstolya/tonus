import { describe, it, expect } from 'vitest'
import { computeFindings, findingsToText, type ResearchData } from './research'

// 10 дней: hrv и давление синхронно растут (r≈1); световой день тоже растёт.
// Ожидаем: давление↔HRV и свет↔HRV как находки среды; давление↔свет (env×env) — НЕ находка.
const rows = Array.from({ length: 10 }, (_, i) => ({
  date: `2026-06-${String(i + 1).padStart(2, '0')}`,
  hrv: 40 + i,
  env_pressure: 1000 + i,
  env_daylight: 800 + i,
}))

const data: ResearchData = {
  rows,
  eventKeys: [],
  metricKeys: [{ key: 'hrv', label: 'HRV', betterHigh: true }],
  concernKeys: [],
  envKeys: [
    { key: 'env_pressure', label: 'Погода: давление' },
    { key: 'env_daylight', label: 'Среда: световой день' },
  ],
}

describe('computeFindings — среда', () => {
  it('коррелирует факторы среды с метриками и помечает их немодифицируемыми', () => {
    const findings = computeFindings(data)
    const env = findings.find(f => f.a === 'Погода: давление' && f.b === 'HRV')
    expect(env).toBeDefined()
    expect(env!.modifiable).toBe(false)
  })

  it('исключает корреляции среда×среда', () => {
    const findings = computeFindings(data)
    const envEnv = findings.find(f =>
      (f.a === 'Погода: давление' && f.b === 'Среда: световой день') ||
      (f.a === 'Среда: световой день' && f.b === 'Погода: давление'))
    expect(envEnv).toBeUndefined()
  })

  it('помечает внешние факторы в тексте для ИИ', () => {
    expect(findingsToText(computeFindings(data))).toContain('внешний фактор')
  })
})

describe('computeFindings — outcome keys', () => {
  // 12 дней: дни с кофе → самочувствие 2, без кофе → 4 (сильный эффект)
  const wbRows = Array.from({ length: 12 }, (_, i) => {
    const coffee = i % 2 === 0 ? 1 : 0
    return { date: `2026-06-${String(i + 1).padStart(2, '0')}`, ev_coffee: coffee, wellbeing: coffee ? 2 : 4 }
  })
  const wbData: ResearchData = {
    rows: wbRows,
    eventKeys: [{ key: 'ev_coffee', label: 'Кофе (кол-во)' }],
    metricKeys: [{ key: 'wellbeing', label: 'Самочувствие', betterHigh: true }],
    concernKeys: [],
    envKeys: [],
  }

  it('помечает событийную находку factorKey и outcomeKey', () => {
    const f = computeFindings(wbData).find(x => x.a === 'Кофе (кол-во)' && x.b === 'Самочувствие')
    expect(f).toBeDefined()
    expect(f!.kind).toBe('event')
    expect(f!.factorKey).toBe('ev_coffee')
    expect(f!.outcomeKey).toBe('wellbeing')
  })
})
