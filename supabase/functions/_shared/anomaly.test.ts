import { describe, it, expect } from 'vitest'
import { detectAnomaly, shouldSendAlert, buildAlertMessage, type AnomalyDay } from './anomaly'

// Страж здоровья: z-score последнего дня против персональной базы
// (30 дней до последних 2 — болезнь не загрязняет собственную норму).

const day = (date: string, over: Partial<AnomalyDay> = {}): AnomalyDay => ({
  date,
  rhr: 55 + (date.charCodeAt(9) % 2 ? 1 : -1), // 54/56 — лёгкий шум, std≈1
  wristTemp: 36.5 + (date.charCodeAt(9) % 2 ? 0.05 : -0.05),
  hrv: 50 + (date.charCodeAt(9) % 2 ? 2 : -2),
  respiratoryRate: 15 + (date.charCodeAt(9) % 2 ? 0.3 : -0.3),
  spo2: 0.97 + (date.charCodeAt(9) % 2 ? 0.005 : -0.005),
  ...over,
})

function series(n: number, overLast: Partial<AnomalyDay> = {}): AnomalyDay[] {
  const out: AnomalyDay[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10)
    out.push(day(d))
  }
  if (out.length) out[out.length - 1] = { ...out[out.length - 1], ...overLast }
  return out
}

describe('detectAnomaly', () => {
  it('returns null on a healthy steady series', () => {
    expect(detectAnomaly(series(30))).toBeNull()
  })

  it('returns null with fewer than 12 days of history (10 baseline + 2 excluded)', () => {
    expect(detectAnomaly(series(11, { rhr: 75, wristTemp: 37.4 }))).toBeNull()
  })

  it('red when two metrics deviate together (RHR up + temp up)', () => {
    const r = detectAnomaly(series(30, { rhr: 63, wristTemp: 37.1 }))
    expect(r?.level).toBe('red')
    const metrics = r!.findings.map(f => f.metric)
    expect(metrics).toContain('rhr')
    expect(metrics).toContain('wristTemp')
  })

  it('yellow when only HRV drops hard', () => {
    const r = detectAnomaly(series(30, { hrv: 35 }))
    expect(r?.level).toBe('yellow')
    expect(r!.findings).toHaveLength(1)
    expect(r!.findings[0].metric).toBe('hrv')
    expect(r!.findings[0].z).toBeLessThan(0)
  })

  it('good-direction deviation is not an anomaly (HRV up, RHR down)', () => {
    expect(detectAnomaly(series(30, { hrv: 70, rhr: 48 }))).toBeNull()
  })

  it('sick previous day does not pollute the baseline', () => {
    const s = series(30)
    // болеем два дня: вчера и сегодня — база должна остаться здоровой
    s[s.length - 2] = { ...s[s.length - 2], rhr: 64, wristTemp: 37.2 }
    s[s.length - 1] = { ...s[s.length - 1], rhr: 65, wristTemp: 37.3 }
    const r = detectAnomaly(s)
    expect(r?.level).toBe('red')
  })

  it('skips constant metrics (std=0) without crashing', () => {
    const s = series(30).map(d => ({ ...d, respiratoryRate: 15 })) // константа
    s[s.length - 1] = { ...s[s.length - 1], respiratoryRate: 15.2 }
    expect(detectAnomaly(s)).toBeNull()
  })

  it('handles missing metrics (nulls) gracefully', () => {
    const s = series(30).map(d => ({ ...d, wristTemp: null, spo2: null }))
    const r = detectAnomaly(s.map((d, i) => i === s.length - 1 ? { ...d, rhr: 63, respiratoryRate: 17.5 } : d))
    expect(r?.level).toBe('red')
  })
})

describe('shouldSendAlert (кулдаун 24ч, эскалация разрешена)', () => {
  const now = new Date('2026-07-05T12:00:00Z')
  const at = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString()

  it('sends when no recent alerts', () => {
    expect(shouldSendAlert([], 'yellow', now)).toBe(true)
  })

  it('suppresses same level within 24h', () => {
    expect(shouldSendAlert([{ level: 'yellow', created_at: at(5) }], 'yellow', now)).toBe(false)
    expect(shouldSendAlert([{ level: 'red', created_at: at(5) }], 'red', now)).toBe(false)
  })

  it('suppresses yellow when red was sent recently', () => {
    expect(shouldSendAlert([{ level: 'red', created_at: at(5) }], 'yellow', now)).toBe(false)
  })

  it('allows escalation yellow → red immediately', () => {
    expect(shouldSendAlert([{ level: 'yellow', created_at: at(1) }], 'red', now)).toBe(true)
  })

  it('sends again after 24h', () => {
    expect(shouldSendAlert([{ level: 'red', created_at: at(25) }], 'red', now)).toBe(true)
  })
})

describe('buildAlertMessage', () => {
  it('mentions level, metrics and disclaimer', () => {
    const msg = buildAlertMessage({
      level: 'red',
      findings: [
        { metric: 'rhr', value: 63, baseline: 55, z: 2.4 },
        { metric: 'wristTemp', value: 37.1, baseline: 36.5, z: 2.1 },
      ],
    })
    expect(msg).toContain('Пульс покоя')
    expect(msg).toContain('63')
    expect(msg).toContain('Температура запястья')
    expect(msg).toContain('не диагноз')
  })
})
