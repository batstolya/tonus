// Страж здоровья: детектор ранних признаков заболевания.
// z-score последнего дня против персональной базы — 30 дней ДО последних 2
// (болезнь не должна загрязнять собственную норму). Чистый модуль без
// Deno/браузерных зависимостей, тесты — anomaly.test.ts (vitest).
// Спека: docs/superpowers/specs/2026-07-05-smart-tonus-design.md (F1).

export interface AnomalyDay {
  date: string
  rhr: number | null
  wristTemp: number | null
  hrv: number | null
  respiratoryRate: number | null
  spo2: number | null
}

export type AnomalyMetric = 'rhr' | 'wristTemp' | 'hrv' | 'respiratoryRate' | 'spo2'

export interface AnomalyFinding {
  metric: AnomalyMetric
  value: number
  baseline: number
  z: number
}

export interface AnomalyResult {
  level: 'yellow' | 'red'
  findings: AnomalyFinding[]
}

// «Плохое» направление: +1 — рост это плохо, −1 — падение это плохо.
const BAD_DIRECTION: Record<AnomalyMetric, 1 | -1> = {
  rhr: 1,
  wristTemp: 1,
  respiratoryRate: 1,
  hrv: -1,
  spo2: -1,
}

const MIN_BASELINE_DAYS = 10
const BASELINE_WINDOW = 30
const EXCLUDE_RECENT = 2 // сегодня и вчера не участвуют в базе
const Z_YELLOW = 2
const Z_RED = 1.5

function meanStd(vals: number[]): { mean: number; std: number } {
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
  return { mean, std: Math.sqrt(variance) }
}

// Возвращает null (всё спокойно) либо уровень с отклонившимися метриками.
export function detectAnomaly(days: AnomalyDay[]): AnomalyResult | null {
  if (days.length < MIN_BASELINE_DAYS + EXCLUDE_RECENT) return null
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const target = sorted[sorted.length - 1]
  const pool = sorted.slice(0, sorted.length - EXCLUDE_RECENT).slice(-BASELINE_WINDOW)

  // badness = z в «плохую» сторону (всегда ≥ 0, если отклонение плохое)
  const deviations: (AnomalyFinding & { badness: number })[] = []
  for (const metric of Object.keys(BAD_DIRECTION) as AnomalyMetric[]) {
    const value = target[metric]
    if (value == null || isNaN(value)) continue
    const base = pool.map(d => d[metric]).filter((v): v is number => v != null && !isNaN(v))
    if (base.length < MIN_BASELINE_DAYS) continue
    const { mean, std } = meanStd(base)
    if (std === 0) continue // константная метрика — судить не о чем
    const z = (value - mean) / std
    const badness = z * BAD_DIRECTION[metric]
    if (badness > 0) deviations.push({ metric, value, baseline: mean, z, badness })
  }

  const strip = (d: AnomalyFinding & { badness: number }): AnomalyFinding =>
    ({ metric: d.metric, value: d.value, baseline: d.baseline, z: d.z })
  const red = deviations.filter(d => d.badness >= Z_RED)
  if (red.length >= 2) return { level: 'red', findings: red.map(strip) }
  const yellow = deviations.filter(d => d.badness >= Z_YELLOW)
  if (yellow.length === 1) return { level: 'yellow', findings: yellow.map(strip) }
  return null
}

// Кулдаун: не шлём алерт, если за 24ч уже был этого уровня или выше.
// Эскалация yellow → red проходит сразу.
const LEVEL_RANK = { yellow: 1, red: 2 } as const

export function shouldSendAlert(
  recent: { level: 'yellow' | 'red'; created_at: string }[],
  candidate: 'yellow' | 'red',
  now: Date = new Date(),
): boolean {
  const dayAgo = now.getTime() - 24 * 3600_000
  return !recent.some(a =>
    new Date(a.created_at).getTime() >= dayAgo && LEVEL_RANK[a.level] >= LEVEL_RANK[candidate],
  )
}

// Текст алерта (ru — язык бота). Формат метрик человеческий, не сырые z.
const METRIC_LABELS: Record<AnomalyMetric, { name: string; fmt: (v: number) => string }> = {
  rhr: { name: 'Пульс покоя', fmt: v => `${Math.round(v)} уд/мин` },
  wristTemp: { name: 'Температура запястья', fmt: v => `${v.toFixed(1)}°` },
  hrv: { name: 'HRV', fmt: v => `${Math.round(v)} мс` },
  respiratoryRate: { name: 'Частота дыхания', fmt: v => `${v.toFixed(1)}/мин` },
  spo2: { name: 'SpO₂', fmt: v => `${Math.round(v * 100)}%` },
}

export function buildAlertMessage(result: AnomalyResult): string {
  const head = result.level === 'red'
    ? '🔴 <b>Организм с чем-то борется</b>'
    : '🟡 <b>Присмотрись к самочувствию</b>'
  const lines = result.findings.map(f => {
    const { name, fmt } = METRIC_LABELS[f.metric]
    const arrow = f.z > 0 ? '↑' : '↓'
    return `${arrow} ${name}: ${fmt(f.value)} при твоей норме ${fmt(f.baseline)} (${Math.abs(f.z).toFixed(1)}σ)`
  })
  const advice = result.level === 'red'
    ? 'Совет: день без нагрузок, больше воды и сна. Если появятся симптомы — не геройствуй.'
    : 'Совет: полегче сегодня, понаблюдай за собой.'
  return `${head}\n\n${lines.join('\n')}\n\n${advice}\n<i>Это наблюдение по данным часов, не диагноз.</i>`
}
