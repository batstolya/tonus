import type { DailyMetrics } from '../types'

export interface MetricDef { key: keyof DailyMetrics; label: string; unit: string; betterHigh: boolean; decimals: number }

export const INSIGHT_METRICS: MetricDef[] = [
  { key: 'hrv', label: 'HRV', unit: 'мс', betterHigh: true, decimals: 0 },
  { key: 'restingHeartRate', label: 'Пульс покоя', unit: 'уд/мин', betterHigh: false, decimals: 0 },
  { key: 'sleepHours', label: 'Сон', unit: 'ч', betterHigh: true, decimals: 1 },
  { key: 'sleepDeep', label: 'Глубокий сон', unit: 'ч', betterHigh: true, decimals: 1 },
  { key: 'steps', label: 'Шаги', unit: '', betterHigh: true, decimals: 0 },
  { key: 'activeEnergy', label: 'Активные калории', unit: 'ккал', betterHigh: true, decimals: 0 },
]

const num = (d: DailyMetrics, k: keyof DailyMetrics): number | null => {
  const v = d[k]; return typeof v === 'number' ? v : null
}
const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
const std = (a: number[]) => { const m = avg(a); if (m == null || a.length < 2) return null; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) }

// ── A1. Тренды (последние 7 дней vs предыдущие 7) ───────────────────────────
export interface TrendCard { label: string; unit: string; cur: number; prev: number; deltaPct: number; good: boolean | null; decimals: number }

export function computeTrends(daily: DailyMetrics[]): TrendCard[] {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const out: TrendCard[] = []
  for (const m of INSIGHT_METRICS) {
    const series = sorted.map(d => ({ date: d.date, v: num(d, m.key) })).filter(x => x.v != null) as { date: string; v: number }[]
    if (series.length < 8) continue
    const recent = series.slice(-7).map(x => x.v)
    const prior = series.slice(-14, -7).map(x => x.v)
    if (prior.length < 3) continue
    const cur = avg(recent)!, prev = avg(prior)!
    if (prev === 0) continue
    const deltaPct = ((cur - prev) / prev) * 100
    let good: boolean | null = null
    if (Math.abs(deltaPct) >= 3) good = m.betterHigh ? deltaPct > 0 : deltaPct < 0
    out.push({ label: m.label, unit: m.unit, cur, prev, deltaPct, good, decimals: m.decimals })
  }
  return out
}

// ── A2. Рекорды ─────────────────────────────────────────────────────────────
export interface RecordCard { label: string; value: number; unit: string; date: string; decimals: number }

export function computeRecords(daily: DailyMetrics[]): RecordCard[] {
  const out: RecordCard[] = []
  for (const m of INSIGHT_METRICS) {
    const pts = daily.map(d => ({ date: d.date, v: num(d, m.key) })).filter(x => x.v != null) as { date: string; v: number }[]
    if (pts.length < 5) continue
    const best = m.betterHigh
      ? pts.reduce((a, b) => b.v > a.v ? b : a)
      : pts.reduce((a, b) => b.v < a.v ? b : a)
    out.push({ label: m.label, value: best.v, unit: m.unit, date: best.date, decimals: m.decimals })
  }
  return out
}

// ── A3. Серии (текущие streak'и) ────────────────────────────────────────────
export interface StreakCard { label: string; days: number; threshold: string }

export function computeStreaks(daily: DailyMetrics[]): StreakCard[] {
  const sorted = [...daily].sort((a, b) => b.date.localeCompare(a.date)) // от свежих к старым
  const out: StreakCard[] = []
  const streak = (pred: (d: DailyMetrics) => boolean | null) => {
    let n = 0
    for (const d of sorted) { const r = pred(d); if (r === null) continue; if (r) n++; else break }
    return n
  }
  const s1 = streak(d => { const v = num(d, 'steps'); return v == null ? null : v >= 8000 })
  if (s1 >= 2) out.push({ label: 'дней подряд ≥8к шагов', days: s1, threshold: '8000' })
  const s2 = streak(d => { const v = num(d, 'sleepHours'); return v == null ? null : v >= 7 })
  if (s2 >= 2) out.push({ label: 'ночей подряд сон ≥7ч', days: s2, threshold: '7' })
  return out
}

// ── A4. Аномалии (выбросы за последние 14 дней) ─────────────────────────────
export interface AnomalyCard { label: string; date: string; value: number; unit: string; z: number; decimals: number }

export function computeAnomalies(daily: DailyMetrics[]): AnomalyCard[] {
  const out: AnomalyCard[] = []
  const last14 = [...daily].sort((a, b) => a.date.localeCompare(b.date)).slice(-30)
  for (const m of INSIGHT_METRICS) {
    const pts = last14.map(d => ({ date: d.date, v: num(d, m.key) })).filter(x => x.v != null) as { date: string; v: number }[]
    if (pts.length < 8) continue
    const vals = pts.map(p => p.v)
    const mean = avg(vals)!, sd = std(vals)
    if (!sd) continue
    // ищем «плохой» выброс среди последних 14 дней
    const recent = pts.slice(-14)
    for (const p of recent) {
      const z = (p.v - mean) / sd
      const bad = m.betterHigh ? z <= -2 : z >= 2
      if (bad) out.push({ label: m.label, date: p.date, value: p.v, unit: m.unit, z, decimals: m.decimals })
    }
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 4)
}

// ── C. Хитмап (последние ~10 недель) ────────────────────────────────────────
export interface HeatCell { date: string; v: number | null; pct: number | null } // pct 0..1 для цвета

export function buildHeatmap(daily: DailyMetrics[], key: keyof DailyMetrics, betterHigh: boolean): { cells: HeatCell[]; weeks: number } {
  const map = new Map<string, number | null>()
  for (const d of daily) map.set(d.date, num(d, key))
  const vals = [...map.values()].filter((v): v is number => v != null)
  if (!vals.length) return { cells: [], weeks: 0 }
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1

  // строим сетку: последние 70 дней, выровнено по понедельникам
  const today = new Date()
  const start = new Date(today); start.setDate(start.getDate() - 69)
  // сдвиг к понедельнику
  const dow = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - dow)
  const cells: HeatCell[] = []
  const d = new Date(start)
  while (d <= today) {
    const ds = d.toISOString().slice(0, 10)
    const v = map.has(ds) ? map.get(ds)! : null
    let pct: number | null = null
    if (v != null) { const norm = (v - min) / range; pct = betterHigh ? norm : 1 - norm }
    cells.push({ date: ds, v, pct })
    d.setDate(d.getDate() + 1)
  }
  return { cells, weeks: Math.ceil(cells.length / 7) }
}

// ── D. Паттерны по дням недели ──────────────────────────────────────────────
export interface WeekdayPattern { label: string; weekday: number; delta: number; unit: string; higher: boolean; decimals: number }

const WD_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
export { WD_NAMES }

export function computeWeekdayPatterns(daily: DailyMetrics[]): WeekdayPattern[] {
  const out: WeekdayPattern[] = []
  for (const m of INSIGHT_METRICS) {
    const byWd: number[][] = [[], [], [], [], [], [], []]
    const all: number[] = []
    for (const d of daily) {
      const v = num(d, m.key); if (v == null) continue
      const wd = (new Date(d.date + 'T00:00:00').getDay() + 6) % 7
      byWd[wd].push(v); all.push(v)
    }
    if (all.length < 14) continue
    const overall = avg(all)!, sd = std(all)
    if (!sd) continue
    for (let wd = 0; wd < 7; wd++) {
      if (byWd[wd].length < 3) continue
      const wdMean = avg(byWd[wd])!
      const delta = wdMean - overall
      if (Math.abs(delta) / sd >= 0.6) {
        out.push({ label: m.label, weekday: wd, delta, unit: m.unit, higher: delta > 0, decimals: m.decimals })
      }
    }
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6)
}
