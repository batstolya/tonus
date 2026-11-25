// The metrics added after the original core set (PR #258: breathing
// disturbances, time in daylight; PR #259: the 15 catalog metrics), as one
// list for the server-side consumers: AI context, chat tool, biweekly report.
// Spec: docs/superpowers/specs/2026-11-25-new-metrics-ai-anomaly-report-design.md
//
// Pure module (no Deno APIs) so vitest tests it directly. All lines are
// precomputed facts: the model must not average or compare by itself.
import { METRIC_CATALOG } from './metricCatalog.ts'

interface ExtraDef { label: string; digits: number }

/** Russian label with unit (the model and the bot speak Russian internally). */
const EXTRA_DEFS: Record<string, ExtraDef> = {
  breathingDisturbances: { label: 'Нарушения дыхания во сне, в час', digits: 1 },
  daylightMinutes: { label: 'Время на дневном свете, мин', digits: 0 },
  physicalEffort: { label: 'Интенсивность нагрузки, MET', digits: 1 },
  basalEnergy: { label: 'Энергия покоя, ккал', digits: 0 },
  standHours: { label: 'Часы стояния', digits: 0 },
  standMinutes: { label: 'Минуты стояния', digits: 0 },
  environmentalAudio: { label: 'Шум вокруг, дБ', digits: 0 },
  headphoneAudio: { label: 'Громкость в наушниках, дБ', digits: 0 },
  walkingSpeed: { label: 'Скорость ходьбы, км/ч', digits: 1 },
  walkingStepLength: { label: 'Длина шага, см', digits: 0 },
  walkingAsymmetry: { label: 'Асимметрия ходьбы, %', digits: 1 },
  walkingDoubleSupport: { label: 'Двойная опора при ходьбе, %', digits: 1 },
  stairSpeedUp: { label: 'Скорость подъёма по лестнице, м/с', digits: 2 },
  stairSpeedDown: { label: 'Скорость спуска по лестнице, м/с', digits: 2 },
  sixMinuteWalk: { label: 'Тест 6-минутной ходьбы (оценка iPhone), м', digits: 0 },
  cyclingDistance: { label: 'Велосипед, км', digits: 1 },
  handwashing: { label: 'Мытьё рук, раз в день', digits: 0 },
  walkingSteadiness: { label: 'Устойчивость ходьбы (оценка iPhone), %', digits: 0 },
}

export const EXTRA_METRIC_KEYS: readonly string[] = [
  'breathingDisturbances', 'daylightMinutes', ...METRIC_CATALOG.map(e => e.key),
]

/** Display precision of a newer metric; values go to the model rounded to it. */
export function extraDigits(key: string): number | null {
  return EXTRA_DEFS[key]?.digits ?? null
}

export interface ExtraMetricRow { date: string; metric: string; avg_val: number | null; sum_val: number | null }

export interface ExtraMetricSummary {
  key: string
  label: string
  digits: number
  /** Mean over days that have the metric (absence is unknown, not zero). */
  avg: number
  days: number
  latest: number
  latestDate: string
}

/** One metrics_daily row's value: averages live in avg_val, totals in sum_val. */
const valueOf = (r: ExtraMetricRow): number | null => r.avg_val ?? r.sum_val ?? null

export function summarizeExtraMetrics(rows: ExtraMetricRow[]): ExtraMetricSummary[] {
  const out: ExtraMetricSummary[] = []
  for (const key of EXTRA_METRIC_KEYS) {
    const def = EXTRA_DEFS[key]
    const pts = rows
      .filter(r => r.metric === key)
      .map(r => ({ date: r.date, v: valueOf(r) }))
      .filter((p): p is { date: string; v: number } => typeof p.v === 'number' && !isNaN(p.v))
      .sort((a, b) => a.date.localeCompare(b.date))
    if (!def || !pts.length) continue
    const last = pts[pts.length - 1]
    out.push({
      key,
      label: def.label,
      digits: def.digits,
      avg: pts.reduce((a, p) => a + p.v, 0) / pts.length,
      days: pts.length,
      latest: last.v,
      latestDate: last.date,
    })
  }
  return out
}

export function extraMetricsLines(summary: ExtraMetricSummary[]): string[] {
  return summary.map(s =>
    `${s.label}: средн ${s.avg.toFixed(s.digits)} (дней с данными: ${s.days}), последнее ${s.latest.toFixed(s.digits)} (${s.latestDate})`)
}

/** "current vs previous" lines for metrics present in both periods. */
export function compareExtraLines(current: ExtraMetricSummary[], previous: ExtraMetricSummary[]): string[] {
  const prev = new Map(previous.map(p => [p.key, p]))
  return current.flatMap(c => {
    const p = prev.get(c.key)
    if (!p) return []
    const cur = +c.avg.toFixed(c.digits), was = +p.avg.toFixed(c.digits)
    const delta = cur - was
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
    // Day counts travel with the comparison: a weekly or rare metric (1 day vs
    // 14) must not read like two equivalent periods.
    return [`${c.label}: ${cur.toFixed(c.digits)} (было ${was.toFixed(c.digits)}, ${sign}${Math.abs(delta).toFixed(c.digits)}; дней с данными ${c.days} и ${p.days})`]
  })
}
