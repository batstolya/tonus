import { supabase } from './supabase'
import type { DailyMetrics } from '../types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface IntakeEvent {
  id: string
  ts: string
  type: string
  amount: number | null
  unit: string | null
  note: string | null
}

const EVENT_LABELS: Record<string, string> = {
  coffee: 'Кофе', alcohol: 'Алкоголь', meal: 'Еда',
  water: 'Вода', meds: 'Лекарства', custom: 'Другое',
}

function avg(vals: number[]): number | null {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}
function pick(days: DailyMetrics[], key: keyof DailyMetrics): number[] {
  return days.map(d => d[key] as number | null).filter((v): v is number => v != null)
}
function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function buildContextSnapshot(
  daily: DailyMetrics[],
  periodDays = 30,
  labSummary?: string,
  intakeEvents: IntakeEvent[] = [],
  supplementSummary?: string,
): string {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - periodDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const slice = sorted.filter(d => d.date >= cutoffStr)
  if (!slice.length) return 'Данных нет.'

  const lines: string[] = [`Период: ${slice[0].date} — ${slice[slice.length - 1].date} (${slice.length} дней)`]

  const rhr = pick(slice, 'restingHeartRate')
  if (rhr.length) lines.push(`Пульс покоя: среднее ${avg(rhr)?.toFixed(0)} уд/мин, мин ${Math.min(...rhr).toFixed(0)}, макс ${Math.max(...rhr).toFixed(0)}`)

  const hrv = pick(slice, 'hrv')
  if (hrv.length) lines.push(`HRV: среднее ${avg(hrv)?.toFixed(0)} мс`)

  // Sleep with bedtime and wake time
  const sleep = pick(slice, 'sleepHours')
  if (sleep.length) {
    const a = avg(sleep)!
    const good = sleep.filter(v => v >= 7).length
    lines.push(`Сон: среднее ${a.toFixed(1)} ч, ночей с ≥7ч: ${good}/${sleep.length}`)
  }

  const deep = pick(slice, 'sleepDeep')
  if (deep.length) lines.push(`Глубокий сон: среднее ${avg(deep)!.toFixed(1)} ч/ночь`)

  const rem = pick(slice, 'sleepREM')
  if (rem.length) lines.push(`REM сон: среднее ${avg(rem)!.toFixed(1)} ч/ночь`)

  const core = pick(slice, 'sleepCore')
  if (core.length) lines.push(`Основной сон: среднее ${avg(core)!.toFixed(1)} ч/ночь`)

  const bedtimes = slice.filter(d => d.sleepBedtime).map(d => {
    const dt = new Date(d.sleepBedtime!)
    let h = dt.getHours() + dt.getMinutes() / 60
    if (h < 12) h += 24 // normalize late night past midnight
    return h
  })
  if (bedtimes.length) {
    const avgBed = avg(bedtimes)!
    const h = Math.floor(avgBed % 24)
    const m = Math.round((avgBed % 1) * 60)
    lines.push(`Среднее время засыпания: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
  }

  const wakes = slice.filter(d => d.sleepWakeTime).map(d => {
    const dt = new Date(d.sleepWakeTime!)
    return dt.getHours() + dt.getMinutes() / 60
  })
  if (wakes.length) {
    const avgWake = avg(wakes)!
    const h = Math.floor(avgWake)
    const m = Math.round((avgWake % 1) * 60)
    lines.push(`Среднее время пробуждения: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
  }

  // Last 5 bedtime/wake entries for detail
  const recentSleep = slice.filter(d => d.sleepBedtime || d.sleepWakeTime).slice(-5)
  if (recentSleep.length) {
    lines.push('\nПоследние записи сна:')
    recentSleep.forEach(d => {
      const bed = d.sleepBedtime ? fmtTime(d.sleepBedtime) : '—'
      const wake = d.sleepWakeTime ? fmtTime(d.sleepWakeTime) : '—'
      const dur = d.sleepHours ? `${d.sleepHours.toFixed(1)}ч` : '—'
      lines.push(`  ${d.date}: засыпание ${bed}, пробуждение ${wake}, длительность ${dur}`)
    })
  }

  const steps = pick(slice, 'steps')
  if (steps.length) {
    const a = avg(steps)!
    const goal = steps.filter(v => v >= 8000).length
    lines.push(`\nШаги: среднее ${Math.round(a).toLocaleString()}/день, дней с 8к+: ${goal}/${steps.length}`)
  }

  const spo2 = pick(slice, 'oxygenSaturation')
  if (spo2.length) lines.push(`SpO₂: среднее ${(avg(spo2)! * 100).toFixed(1)}%`)

  const energy = pick(slice, 'activeEnergy')
  if (energy.length) lines.push(`Активные калории: среднее ${Math.round(avg(energy)!)} ккал/день`)

  // Intake / quick log events for the period
  const cutoffTs = new Date(cutoffStr + 'T00:00:00').getTime()
  const periodEvents = intakeEvents.filter(e => new Date(e.ts).getTime() >= cutoffTs)
  if (periodEvents.length) {
    lines.push('\n=== БЫСТРЫЙ ЛОГ (питание, кофе, лекарства) ===')
    // Group by type and count
    const byType: Record<string, { count: number; entries: string[] }> = {}
    for (const ev of periodEvents) {
      if (!byType[ev.type]) byType[ev.type] = { count: 0, entries: [] }
      byType[ev.type].count++
      const time = new Date(ev.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      const detail = [ev.amount ? `${ev.amount}${ev.unit ?? ''}` : '', ev.note ?? ''].filter(Boolean).join(', ')
      byType[ev.type].entries.push(`${time}${detail ? ` (${detail})` : ''}`)
    }
    for (const [type, { count, entries }] of Object.entries(byType)) {
      const label = EVENT_LABELS[type] ?? type
      lines.push(`${label}: ${count} раз за период`)
      // Show last 5 entries
      entries.slice(-5).forEach(e => lines.push(`  • ${e}`))
    }
  }

  // Weekly breakdown for trend comparison
  if (slice.length >= 14) {
    lines.push('\n=== ПОНЕДЕЛЬНАЯ РАЗБИВКА ===')
    const weeks: DailyMetrics[][] = []
    for (let i = 0; i < slice.length; i += 7) weeks.push(slice.slice(i, i + 7))
    weeks.forEach((wk, idx) => {
      const label = idx === weeks.length - 1 ? 'Последняя неделя' : idx === weeks.length - 2 ? 'Предыдущая неделя' : `Неделя ${idx + 1}`
      const wRhr = pick(wk, 'restingHeartRate'); const wHrv = pick(wk, 'hrv')
      const wSlp = pick(wk, 'sleepHours'); const wStp = pick(wk, 'steps')
      const parts: string[] = []
      if (wRhr.length) parts.push(`ЧСС ${avg(wRhr)!.toFixed(0)}`)
      if (wHrv.length) parts.push(`HRV ${avg(wHrv)!.toFixed(0)}мс`)
      if (wSlp.length) parts.push(`сон ${avg(wSlp)!.toFixed(1)}ч`)
      if (wStp.length) parts.push(`шаги ${Math.round(avg(wStp)!).toLocaleString()}`)
      lines.push(`${label} (${wk[0].date}…${wk[wk.length-1].date}): ${parts.join(', ')}`)
    })
  }

  if (supplementSummary) {
    lines.push('\n=== ПРЕПАРАТЫ И ДОБАВКИ ===')
    lines.push(supplementSummary)
  }

  // Lab results
  if (labSummary) {
    lines.push('\n=== РЕЗУЛЬТАТЫ АНАЛИЗОВ ===')
    lines.push(labSummary)
  }

  return lines.join('\n')
}

export async function loadSupplementSummary(userId: string, periodDays: number): Promise<string> {
  const { data: sups } = await supabase
    .from('supplements')
    .select('id, name, default_dose, unit')
    .eq('user_id', userId)
    .eq('active', true)

  if (!sups || !sups.length) return ''

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - periodDays)
  const start = cutoff.toISOString().slice(0, 10)
  const end = new Date().toISOString().slice(0, 10)

  const { data: logs } = await supabase
    .from('supplement_logs')
    .select('supplement_id, date, taken')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)
    .eq('taken', true)

  const logSet = new Set((logs ?? []).map((l: any) => `${l.supplement_id}:${l.date}`))

  // count days in period
  const days: string[] = []
  const d = new Date(cutoff)
  while (d <= new Date()) { days.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }

  const lines = sups.map((s: any) => {
    const taken = days.filter(day => logSet.has(`${s.id}:${day}`)).length
    const pct = days.length ? Math.round((taken / days.length) * 100) : 0
    const dose = s.default_dose ? ` ${s.default_dose}${s.unit ? ' ' + s.unit : ''}` : ''
    return `${s.name}${dose}: принято ${taken}/${days.length} дней (${pct}%)`
  })

  return lines.join('\n')
}

export async function loadLabSummary(userId: string): Promise<string> {
  const { data } = await supabase
    .from('lab_results')
    .select('marker, value, unit, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(50)

  if (!data || !data.length) return ''

  // Group by marker, show latest value + trend
  const byMarker: Record<string, { date: string; value: number; unit: string | null }[]> = {}
  for (const r of data) {
    if (!byMarker[r.marker]) byMarker[r.marker] = []
    byMarker[r.marker].push(r)
  }

  const summaryLines: string[] = []
  for (const [marker, entries] of Object.entries(byMarker)) {
    const latest = entries[0]
    const unit = latest.unit ? ` ${latest.unit}` : ''
    if (entries.length >= 2) {
      const prev = entries[1]
      const delta = latest.value - prev.value
      const sign = delta > 0 ? '+' : ''
      summaryLines.push(`${marker}: ${latest.value}${unit} (${latest.date}, ${sign}${delta.toFixed(1)} vs ${prev.date})`)
    } else {
      summaryLines.push(`${marker}: ${latest.value}${unit} (${latest.date})`)
    }
  }

  return summaryLines.join('\n')
}

export async function sendChatMessage(
  message: string,
  sessionId: string | null,
  contextSnapshot: string | null,
  periodLabel: string,
): Promise<{ reply: string; sessionId: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Не авторизован')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/chat-health`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ sessionId, message, contextSnapshot, periodLabel }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Ошибка чата')
  }

  return res.json()
}

export async function loadChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  return (data ?? []) as ChatMessage[]
}
