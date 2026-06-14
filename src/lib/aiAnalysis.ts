import { supabase } from './supabase'
import type { DailyMetrics } from '../types'

export type AnalysisPeriod = '14d' | '30d'

export interface AiAnalysis {
  id: string
  period_start: string
  period_end: string
  created_at: string
  summary: string
  good: string[]
  improve: string[]
  focus: string[]
  model: string
  tokens_used: number | null
}

function avg(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function buildDigest(slice: DailyMetrics[], prevSlice: DailyMetrics[]): string {
  const lines: string[] = []

  const metric = (arr: DailyMetrics[], key: keyof DailyMetrics) =>
    arr.map(d => d[key] as number | null).filter((v): v is number => v != null)

  const fmt = (v: number, dec = 1) => v.toFixed(dec)
  const trend = (cur: number, prev: number, unit = '') => {
    if (!prev) return ''
    const diff = cur - prev
    const sign = diff > 0 ? '+' : ''
    return ` (${sign}${fmt(diff)}${unit} vs пред. период)`
  }

  // Resting HR
  const hr = metric(slice, 'restingHeartRate')
  const hrPrev = metric(prevSlice, 'restingHeartRate')
  if (hr.length) {
    const a = avg(hr); const p = avg(hrPrev)
    lines.push(`Пульс покоя: среднее ${fmt(a)} уд/мин${trend(a, p, ' уд/мин')}, мин ${Math.min(...hr)}, макс ${Math.max(...hr)}`)
  }

  // HRV
  const hrv = metric(slice, 'hrv')
  const hrvPrev = metric(prevSlice, 'hrv')
  if (hrv.length) {
    const a = avg(hrv); const p = avg(hrvPrev)
    lines.push(`HRV: среднее ${fmt(a)} мс${trend(a, p, ' мс')}`)
  }

  // Sleep
  const sleep = metric(slice, 'sleepHours')
  const sleepPrev = metric(prevSlice, 'sleepHours')
  if (sleep.length) {
    const a = avg(sleep); const p = avg(sleepPrev)
    const regular = sleep.filter(v => Math.abs(v - a) < 1).length
    lines.push(`Сон: среднее ${fmt(a)} ч${trend(a, p, ' ч')}, регулярность ${regular}/${sleep.length} дней в пределах 1ч от среднего`)
  }

  // Steps
  const steps = metric(slice, 'steps')
  const stepsPrev = metric(prevSlice, 'steps')
  if (steps.length) {
    const a = avg(steps); const p = avg(stepsPrev)
    const goal = steps.filter(v => v >= 8000).length
    lines.push(`Шаги: среднее ${Math.round(a).toLocaleString()}${trend(a, p, ' шагов')}, дней с 8к+ шагов: ${goal}/${steps.length}`)
  }

  // SpO2
  const spo2 = metric(slice, 'oxygenSaturation')
  if (spo2.length) lines.push(`SpO₂: среднее ${fmt(avg(spo2))}%`)

  // Active energy
  const energy = metric(slice, 'activeEnergy')
  const energyPrev = metric(prevSlice, 'activeEnergy')
  if (energy.length) {
    const a = avg(energy); const p = avg(energyPrev)
    lines.push(`Активные калории: среднее ${Math.round(a)} ккал/день${trend(a, p, ' ккал')}`)
  }

  // VO2max
  const vo2 = metric(slice, 'vo2max')
  if (vo2.length) lines.push(`VO₂max: ${fmt(avg(vo2))} мл/кг/мин`)

  lines.push(`\nПериод анализа: ${slice.length} дней данных`)
  if (prevSlice.length) lines.push(`Для сравнения: предыдущий период ${prevSlice.length} дней`)

  return lines.join('\n')
}

export async function runAnalysis(
  userId: string,
  daily: DailyMetrics[],
  period: AnalysisPeriod
): Promise<AiAnalysis> {
  const days = period === '14d' ? 14 : 30
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const slice = sorted.slice(-days)
  const prevSlice = sorted.slice(-(days * 2), -days)

  if (slice.length === 0) throw new Error('Нет данных за период')

  const periodStart = slice[0].date
  const periodEnd = slice[slice.length - 1].date
  const digest = buildDigest(slice, prevSlice)

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Не авторизован')

  const supabaseUrl = (supabase as any).supabaseUrl as string
  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-health`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ digest, periodStart, periodEnd }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Ошибка сервера')
  }

  return res.json()
}

export async function loadAnalyses(_userId: string): Promise<AiAnalysis[]> {
  const { data } = await supabase
    .from('ai_analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  return (data ?? []) as AiAnalysis[]
}
