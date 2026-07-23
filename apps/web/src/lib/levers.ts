import type { Finding } from './research'

export interface Lever {
  factorLabel: string
  outcomeLabel: string
  direction: 'pos' | 'neg'
  impactText: string          // «-22%» / «+0.5»
  score: number
  confidence: number
  badge: 'high' | 'medium' | 'low'
  controllability: number
  finding: Finding
}

// Исходы, против которых имеет смысл ранжировать рычаги.
const OUTCOME_KEYS = new Set(['wellbeing', 'sleepHours', 'hrv', 'readiness'])

// Управляемость фактора (вес в скоре). sup_* — приём препарата, управляем.
const CONTROLLABILITY: Record<string, number> = {
  ev_coffee: 1, ev_alcohol: 1, ev_late_meal: 1, ev_workout: 1, ev_stress: 0.5,
}
function controllabilityOf(factorKey?: string): number {
  if (!factorKey) return 0
  if (factorKey.startsWith('sup_')) return 1
  return CONTROLLABILITY[factorKey] ?? 0
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

function impactNorm(f: Finding): number {
  return f.kind === 'event' ? Math.min(f.strength / 1.5, 1) : Math.min(Math.abs(f.r ?? f.strength), 1)
}

function confidenceOf(f: Finding): number {
  const thr = f.kind === 'event' ? 0.5 : 0.3
  const strong = f.kind === 'event' ? 1.0 : 0.6
  const nPart = clamp01(f.n / 28)
  const ePart = clamp01((f.strength - thr) / (strong - thr))
  return 0.6 * nPart + 0.4 * ePart
}

export function confidenceBadge(f: Finding): 'high' | 'medium' | 'low' {
  const c = confidenceOf(f)
  return c >= 0.66 ? 'high' : c >= 0.33 ? 'medium' : 'low'
}

function impactText(f: Finding): string {
  if (f.kind === 'corr') return `r=${(f.r ?? 0).toFixed(2)}`
  if (f.deltaPct != null && Math.abs(f.deltaPct) >= 1) {
    return `${f.deltaPct > 0 ? '+' : ''}${Math.round(f.deltaPct)}%`
  }
  const d = f.delta ?? 0
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}`
}

export function computeLevers(findings: Finding[]): { levers: Lever[]; context: Finding[] } {
  const context = findings.filter(f => f.modifiable === false)
  const levers: Lever[] = []
  for (const f of findings) {
    if (f.kind !== 'event') continue
    if (!f.outcomeKey || !OUTCOME_KEYS.has(f.outcomeKey)) continue
    const controllability = controllabilityOf(f.factorKey)
    if (controllability <= 0) continue
    const confidence = confidenceOf(f)
    levers.push({
      factorLabel: f.a,
      outcomeLabel: f.b,
      direction: f.direction,
      impactText: impactText(f),
      score: impactNorm(f) * confidence * controllability,
      confidence,
      badge: confidenceBadge(f),
      controllability,
      finding: f,
    })
  }
  levers.sort((a, b) => b.score - a.score)
  return { levers: levers.slice(0, 5), context }
}

// ── Привязка к экспериментам ──────────────────────────────────────────────────
export interface ExperimentPrefill { hypothesis: string; change_rule: string; target_metric: string }
export const EXPERIMENT_PREFILL_KEY = 'tonus:experiment-prefill'

// Исход рычага → валидная метрика эксперимента (DailyMetrics). wellbeing/readiness
// эксперимент пока не измеряет → дефолт hrv (пользователь правит в форме).
const OUTCOME_TO_METRIC: Record<string, string> = { hrv: 'hrv', sleepHours: 'sleepHours' }

export function buildExperimentPrefill(l: Lever): ExperimentPrefill {
  return {
    hypothesis: `«${l.factorLabel}» влияет на «${l.outcomeLabel}» (${l.impactText})`,
    change_rule: `Сократить/убрать: ${l.factorLabel}`,
    target_metric: (l.finding.outcomeKey && OUTCOME_TO_METRIC[l.finding.outcomeKey]) || 'hrv',
  }
}
