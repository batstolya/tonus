import { supabase } from './supabase'
import type { DailyMetrics } from '../types'

// ── Типы ────────────────────────────────────────────────────────────────────
export interface Finding {
  kind: 'corr' | 'event'        // парная корреляция или эффект события
  a: string                      // фактор A (человекочитаемо)
  b: string                      // фактор B / метрика
  n: number                      // размер выборки
  // для corr: коэффициент Пирсона r ∈ [-1,1]
  r?: number
  // для event: средние и дельта (b на днях с событием vs без)
  withMean?: number
  withoutMean?: number
  delta?: number
  deltaPct?: number
  lag?: 0 | 1                     // 0 — тот же день, 1 — следующий день
  direction: 'pos' | 'neg'
  strength: number               // |r| или нормированная |дельта| — для ранжирования
}

interface DayRow { date: string; [k: string]: number | string | null }

// ── Утилиты статистики ──────────────────────────────────────────────────────
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 5) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}
const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
const std = (a: number[]) => { const m = mean(a); if (m == null || a.length < 2) return null; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) }

// Континуальные метрики, которые анализируем
const METRICS: { key: keyof DailyMetrics; label: string; betterHigh: boolean }[] = [
  { key: 'hrv', label: 'HRV', betterHigh: true },
  { key: 'restingHeartRate', label: 'Пульс покоя', betterHigh: false },
  { key: 'sleepHours', label: 'Длительность сна', betterHigh: true },
  { key: 'sleepDeep', label: 'Глубокий сон', betterHigh: true },
  { key: 'sleepREM', label: 'REM сон', betterHigh: true },
  { key: 'steps', label: 'Шаги', betterHigh: true },
  { key: 'activeEnergy', label: 'Активные калории', betterHigh: true },
  { key: 'oxygenSaturation', label: 'SpO₂', betterHigh: true },
]

// ── Сбор факторов по дням ───────────────────────────────────────────────────
export interface ResearchData {
  rows: DayRow[]                 // по одной строке на день, со всеми факторами
  eventKeys: { key: string; label: string }[]   // бинарные/счётные события
  metricKeys: { key: string; label: string; betterHigh: boolean }[]
  concernKeys: { key: string; label: string }[]
}

export async function loadResearchData(userId: string, daily: DailyMetrics[], periodDays: number): Promise<ResearchData> {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - periodDays)
  const sinceStr = cutoff.toISOString().slice(0, 10)

  const [intakeRes, supRes, logRes, concernRes, concernLogRes] = await Promise.all([
    supabase.from('intake_events').select('ts, type').eq('user_id', userId).gte('ts', `${sinceStr}T00:00:00Z`),
    supabase.from('supplements').select('id, name').eq('user_id', userId).eq('active', true),
    supabase.from('supplement_logs').select('supplement_id, date, taken').eq('user_id', userId).gte('date', sinceStr).eq('taken', true),
    supabase.from('health_concerns').select('id, name').eq('user_id', userId),
    supabase.from('concern_logs').select('concern_id, date, severity').eq('user_id', userId).gte('date', sinceStr),
  ])

  const sups = supRes.data ?? []
  const concerns = concernRes.data ?? []

  // словарь дат → строка факторов
  const byDate = new Map<string, DayRow>()
  const ensure = (d: string) => { if (!byDate.has(d)) byDate.set(d, { date: d }); return byDate.get(d)! }

  // метрики
  for (const dm of daily) {
    if (dm.date < sinceStr) continue
    const row = ensure(dm.date)
    for (const m of METRICS) { const v = dm[m.key]; if (typeof v === 'number') row[m.key as string] = m.key === 'oxygenSaturation' ? v * 100 : v }
  }

  // события: алкоголь (бинарно), кофе (счётчик)
  for (const ev of intakeRes.data ?? []) {
    const d = (ev.ts as string).slice(0, 10)
    const row = ensure(d)
    if (ev.type === 'alcohol') row['ev_alcohol'] = 1
    if (ev.type === 'coffee') row['ev_coffee'] = ((row['ev_coffee'] as number) ?? 0) + 1
  }
  // дни без события считаем 0 — для дней, где вообще есть данные
  for (const row of byDate.values()) {
    if (row['ev_alcohol'] == null) row['ev_alcohol'] = 0
    if (row['ev_coffee'] == null) row['ev_coffee'] = 0
  }

  // препараты: бинарно «принял в этот день»
  const supTaken = new Set((logRes.data ?? []).map((l: any) => `${l.supplement_id}:${l.date}`))
  for (const s of sups) {
    for (const row of byDate.values()) {
      row[`sup_${s.id}`] = supTaken.has(`${s.id}:${row.date}`) ? 1 : 0
    }
  }

  // проблемы: дневная выраженность
  const sevByConcern: Record<string, Record<string, number>> = {}
  for (const l of concernLogRes.data ?? []) {
    if (l.severity == null) continue
    ;(sevByConcern[l.concern_id] ??= {})[l.date] = l.severity
  }
  for (const c of concerns) {
    const map = sevByConcern[c.id]
    if (!map) continue
    for (const [d, sev] of Object.entries(map)) ensure(d)[`cn_${c.id}`] = sev
  }

  const eventKeys = [
    { key: 'ev_alcohol', label: 'Алкоголь (день)' },
    { key: 'ev_coffee', label: 'Кофе (кол-во)' },
    ...sups.map((s: any) => ({ key: `sup_${s.id}`, label: `Приём: ${s.name}` })),
  ]
  const concernKeys = concerns
    .filter((c: any) => sevByConcern[c.id])
    .map((c: any) => ({ key: `cn_${c.id}`, label: `Проблема: ${c.name}` }))

  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  return { rows, eventKeys, metricKeys: METRICS.map(m => ({ key: m.key as string, label: m.label, betterHigh: m.betterHigh })), concernKeys }
}

// ── Расчёт находок ──────────────────────────────────────────────────────────
export function computeFindings(data: ResearchData): Finding[] {
  const { rows, eventKeys, metricKeys, concernKeys } = data
  const out: Finding[] = []
  const col = (k: string) => rows.map(r => (typeof r[k] === 'number' ? r[k] as number : null))

  // 1) Корреляции метрика↔метрика + проблема↔метрика
  const contKeys = [...metricKeys, ...concernKeys.map(c => ({ ...c, betterHigh: false }))]
  for (let i = 0; i < contKeys.length; i++) {
    for (let j = i + 1; j < contKeys.length; j++) {
      const xa = col(contKeys[i].key), ya = col(contKeys[j].key)
      const xs: number[] = [], ys: number[] = []
      for (let k = 0; k < rows.length; k++) if (xa[k] != null && ya[k] != null) { xs.push(xa[k]!); ys.push(ya[k]!) }
      const r = pearson(xs, ys)
      if (r != null && Math.abs(r) >= 0.3 && xs.length >= 7) {
        out.push({ kind: 'corr', a: contKeys[i].label, b: contKeys[j].label, n: xs.length, r, direction: r > 0 ? 'pos' : 'neg', strength: Math.abs(r) })
      }
    }
  }

  // 2) Эффект событий на метрики (тот же день и следующий)
  const targets = [...metricKeys, ...concernKeys.map(c => ({ ...c, betterHigh: false }))]
  for (const ev of eventKeys) {
    const evCol = col(ev.key)
    const binary = evCol.every(v => v == null || v === 0 || v === 1)
    for (const lag of [0, 1] as const) {
      for (const m of targets) {
        const withV: number[] = [], withoutV: number[] = []
        for (let k = 0; k < rows.length - lag; k++) {
          const e = evCol[k]; const mv = (typeof rows[k + lag][m.key] === 'number') ? rows[k + lag][m.key] as number : null
          if (e == null || mv == null) continue
          const active = binary ? e === 1 : e > (mean(evCol.filter((x): x is number => x != null)) ?? 0)
          ;(active ? withV : withoutV).push(mv)
        }
        if (withV.length >= 4 && withoutV.length >= 4) {
          const mw = mean(withV)!, mo = mean(withoutV)!
          const pooledStd = std([...withV, ...withoutV]) ?? 0
          const delta = mw - mo
          const effect = pooledStd ? Math.abs(delta) / pooledStd : 0   // Cohen's d (грубо)
          if (effect >= 0.5) {
            out.push({
              kind: 'event', a: ev.label, b: m.label, n: withV.length + withoutV.length,
              withMean: mw, withoutMean: mo, delta, deltaPct: mo ? (delta / mo) * 100 : undefined,
              lag, direction: delta > 0 ? 'pos' : 'neg', strength: effect,
            })
          }
        }
      }
    }
  }

  return out.sort((a, b) => b.strength - a.strength).slice(0, 25)
}

// ── Архив прогонов ──────────────────────────────────────────────────────────
export interface ResearchRun {
  id: string
  period_days: number
  findings: Finding[]
  reply: string | null
  created_at: string
}

export async function saveResearchRun(userId: string, periodDays: number, findings: Finding[], reply: string): Promise<ResearchRun | null> {
  const { data } = await supabase
    .from('research_runs')
    .insert({ user_id: userId, period_days: periodDays, findings, reply })
    .select('id, period_days, findings, reply, created_at')
    .single()
  return (data as ResearchRun) ?? null
}

export async function loadResearchRuns(userId: string): Promise<ResearchRun[]> {
  const { data } = await supabase
    .from('research_runs')
    .select('id, period_days, findings, reply, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  return (data as ResearchRun[]) ?? []
}

export async function deleteResearchRun(id: string): Promise<void> {
  await supabase.from('research_runs').delete().eq('id', id)
}

// Человекочитаемый текст находок — для отправки в ИИ
export function findingsToText(findings: Finding[]): string {
  return findings.map(f => {
    if (f.kind === 'corr') {
      const dir = f.direction === 'pos' ? 'растут вместе' : 'движутся в противоположные стороны'
      return `• ${f.a} ↔ ${f.b}: r=${f.r!.toFixed(2)} (${dir}), n=${f.n}`
    }
    const lag = f.lag === 1 ? ' на следующий день' : ''
    const sign = f.delta! > 0 ? '+' : ''
    return `• ${f.a} → ${f.b}${lag}: ${sign}${f.delta!.toFixed(1)} (${f.withMean!.toFixed(1)} vs ${f.withoutMean!.toFixed(1)}), n=${f.n}`
  }).join('\n')
}
