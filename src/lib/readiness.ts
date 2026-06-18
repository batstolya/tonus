import type { DailyMetrics } from '../types'

export interface ReadinessScore {
  score: number        // 0-100
  label: string        // 'Отличная' | 'Хорошая' | 'Средняя' | 'Низкая'
  color: string
  components: {
    hrv: number | null      // 0-40
    rhr: number | null      // 0-30
    sleep: number | null    // 0-30
  }
  baseline: { hrv: number | null; rhr: number | null; sleep: number | null }
  today: { hrv: number | null; rhr: number | null; sleep: number | null }
}

function avg(vals: number[]): number | null {
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export interface EarlyWarning {
  active: boolean
  signals: { key: string; vars: Record<string, string | number> }[]
}

export function computeReadiness(daily: DailyMetrics[]): ReadinessScore | null {
  if (daily.length < 7) return null

  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  // Baseline: days 8–37 back (avoid last week to not pollute baseline with current state)
  const baseSlice = sorted.slice(-37, -7)
  // Today / recent: average of last 3 days for stability
  const recentSlice = sorted.slice(-3)

  const baseHRV = avg(baseSlice.map(d => d.hrv).filter((v): v is number => v != null))
  const baseRHR = avg(baseSlice.map(d => d.restingHeartRate).filter((v): v is number => v != null))
  const baseSleep = avg(baseSlice.map(d => d.sleepHours).filter((v): v is number => v != null))

  const recentHRV = avg(recentSlice.map(d => d.hrv).filter((v): v is number => v != null))
  const recentRHR = avg(recentSlice.map(d => d.restingHeartRate).filter((v): v is number => v != null))
  const recentSleep = avg(recentSlice.map(d => d.sleepHours).filter((v): v is number => v != null))

  // HRV: 40pts, higher is better
  let hrvScore: number | null = null
  if (recentHRV != null && baseHRV != null && baseHRV > 0) {
    hrvScore = Math.min(40, Math.max(0, 40 * (recentHRV / baseHRV)))
  } else if (recentHRV != null) {
    // No baseline: use absolute score (50ms = full marks)
    hrvScore = Math.min(40, 40 * (recentHRV / 50))
  }

  // RHR: 30pts, lower is better
  let rhrScore: number | null = null
  if (recentRHR != null && baseRHR != null && baseRHR > 0) {
    rhrScore = Math.min(30, Math.max(0, 30 * (baseRHR / recentRHR)))
  } else if (recentRHR != null) {
    // No baseline: 55 bpm = full marks
    rhrScore = Math.min(30, 30 * (55 / recentRHR))
  }

  // Sleep: 30pts, 8h = full marks
  let sleepScore: number | null = null
  if (recentSleep != null) {
    sleepScore = Math.min(30, 30 * (recentSleep / 8))
  }

  const components = { hrv: hrvScore, rhr: rhrScore, sleep: sleepScore }
  const parts = [hrvScore, rhrScore, sleepScore].filter((v): v is number => v != null)
  if (!parts.length) return null

  // If some components missing, scale to 100
  const maxPossible =
    (hrvScore != null ? 40 : 0) +
    (rhrScore != null ? 30 : 0) +
    (sleepScore != null ? 30 : 0)

  const raw = parts.reduce((a, b) => a + b, 0)
  const score = Math.round((raw / maxPossible) * 100)

  const label = score >= 80 ? 'Отличная' : score >= 60 ? 'Хорошая' : score >= 40 ? 'Средняя' : 'Низкая'
  const color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--yellow)' : 'var(--red)'

  return {
    score,
    label,
    color,
    components,
    baseline: { hrv: baseHRV, rhr: baseRHR, sleep: baseSleep },
    today: { hrv: recentHRV, rhr: recentRHR, sleep: recentSleep },
  }
}

export function computeEarlyWarning(daily: DailyMetrics[]): EarlyWarning {
  if (daily.length < 14) return { active: false, signals: [] }

  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const baseline = sorted.slice(-30, -7)
  const recent = sorted.slice(-2)

  const baseRHR = avg(baseline.map(d => d.restingHeartRate).filter((v): v is number => v != null))
  const baseHRV = avg(baseline.map(d => d.hrv).filter((v): v is number => v != null))

  const recentRHR = avg(recent.map(d => d.restingHeartRate).filter((v): v is number => v != null))
  const recentHRV = avg(recent.map(d => d.hrv).filter((v): v is number => v != null))
  const recentSleep = avg(recent.map(d => d.sleepHours).filter((v): v is number => v != null))

  const signals: { key: string; vars: Record<string, string | number> }[] = []
  if (baseRHR && recentRHR && recentRHR > baseRHR + 5) signals.push({ key: 'Пульс покоя выше нормы на {n} уд/мин', vars: { n: Math.round(recentRHR - baseRHR) } })
  if (baseHRV && recentHRV && recentHRV < baseHRV - 10) signals.push({ key: 'HRV ниже нормы на {n} мс', vars: { n: Math.round(baseHRV - recentHRV) } })
  if (recentSleep && recentSleep < 6) signals.push({ key: 'Сон менее 6 ч ({n} ч)', vars: { n: recentSleep.toFixed(1) } })

  return { active: signals.length >= 2, signals }
}
