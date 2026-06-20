import { supabase } from './supabase'
import { callFunction } from './edgeFunctions'
import type { DailyMetrics, HeartRateSample } from '../types'

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
  heartRateSamples: HeartRateSample[] = [],
  notesSummary?: string,
  concernsSummary?: string,
  hairSummary?: string,
  coachProfile?: string,
  calendarSummary?: string,
): string {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - periodDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const slice = sorted.filter(d => d.date >= cutoffStr)
  if (!slice.length) return 'Данных нет.'

  const lines: string[] = []
  if (coachProfile) lines.push(`=== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (помни это) ===\n${coachProfile}\n`)
  lines.push(`Период: ${slice[0].date} — ${slice[slice.length - 1].date} (${slice.length} дней)`)

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

  // Per-night detail (last 7 nights) — достаточно для большинства вопросов
  const recentSleep = slice.filter(d => d.sleepBedtime || d.sleepWakeTime || d.sleepHours != null).slice(-7)
  if (recentSleep.length) {
    lines.push('\nСон по ночам (последние 7):')
    recentSleep.forEach(d => {
      const bed = d.sleepBedtime ? fmtTime(d.sleepBedtime) : '—'
      const wake = d.sleepWakeTime ? fmtTime(d.sleepWakeTime) : '—'
      const dur = d.sleepHours != null ? `${d.sleepHours.toFixed(1)}ч` : '—'
      const stages = [
        d.sleepDeep != null ? `глубокий ${d.sleepDeep.toFixed(1)}ч` : null,
        d.sleepREM != null ? `REM ${d.sleepREM.toFixed(1)}ч` : null,
        d.sleepCore != null ? `лёгкий ${d.sleepCore.toFixed(1)}ч` : null,
      ].filter(Boolean).join(', ')
      lines.push(`  ${d.date}: длительность ${dur}, засыпание ${bed}, пробуждение ${wake}${stages ? `, ${stages}` : ''}`)
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
  const periodEvents = intakeEvents.filter(e => new Date(e.ts).getTime() >= cutoffTs && e.type !== 'water')
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

  // Heart rate samples — last 7 days grouped by date
  if (heartRateSamples.length) {
    const hrCutoff = new Date(); hrCutoff.setDate(hrCutoff.getDate() - 7)
    const recentHR = heartRateSamples
      .filter(s => s.time >= hrCutoff)
      .sort((a, b) => a.time.getTime() - b.time.getTime())
    if (recentHR.length) {
      lines.push('\n=== ПУЛЬС ПО ВРЕМЕНИ (последние 3 дня) ===')
      const byDate: Record<string, HeartRateSample[]> = {}
      for (const s of recentHR) {
        const d = s.time.toISOString().slice(0, 10)
        if (!byDate[d]) byDate[d] = []
        byDate[d].push(s)
      }
      // Only last 3 days of detailed HR
      const last3Days = Object.keys(byDate).sort().slice(-3)
      for (const date of last3Days) {
        const samples = byDate[date]
        const thinned: HeartRateSample[] = []
        let lastTs = 0
        for (const s of samples) {
          const ts = s.time.getTime()
          if (ts - lastTs >= 30 * 60 * 1000) { thinned.push(s); lastTs = ts } // каждые 30 мин вместо 25
        }
        const vals = thinned.map(s => {
          const t = s.time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          return `${t}→${s.value}`
        }).join(', ')
        lines.push(`${date}: ${vals}`)
      }
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

  // Day notes — what the user wrote about their days
  if (notesSummary) {
    lines.push('\n=== ЗАМЕТКИ ДНЯ (со слов пользователя) ===')
    lines.push(notesSummary)
  }

  // Health concerns
  if (concernsSummary) {
    lines.push('\n=== ПРОБЛЕМЫ И СИМПТОМЫ ===')
    lines.push(concernsSummary)
  }

  // Hair tracking
  if (hairSummary) {
    lines.push('\n=== ВОЛОСЫ ===')
    lines.push(hairSummary)
  }

  // Calendar (meetings/events) — load on the day vs stress/HR/sleep
  if (calendarSummary) {
    lines.push('\n=== КАЛЕНДАРЬ (встречи/события — нагрузка дня) ===')
    lines.push(calendarSummary)
  }

  return lines.join('\n')
}

// Профиль коуча (память). Пересобирает раз в сутки через edge-функцию, иначе из БД.
export async function loadCoachProfile(): Promise<string> {
  try {
    const p = await callFunction<{ summary?: string; facts?: string[] }>('coach-profile', { force: false })
    const facts = Array.isArray(p.facts) && p.facts.length ? `\nФакты: ${p.facts.join('; ')}` : ''
    return p.summary ? `${p.summary}${facts}` : ''
  } catch { return '' }
}

// Заметки дня за период
export async function loadNotesSummary(userId: string, periodDays: number): Promise<string> {
  const since = new Date(); since.setDate(since.getDate() - periodDays)
  const { data } = await supabase
    .from('context_notes')
    .select('date, note')
    .eq('user_id', userId)
    .gte('date', since.toISOString().slice(0, 10))
    .order('date', { ascending: false })
  if (!data?.length) return ''
  return data.map((n: any) => `${n.date}: ${n.note}`).join('\n')
}

// Проблемы/симптомы + последние наблюдения
export async function loadConcernsSummary(userId: string): Promise<string> {
  const { data: concerns } = await supabase
    .from('health_concerns')
    .select('id, name, category, status, started_at')
    .eq('user_id', userId)
  if (!concerns?.length) return ''
  const lines: string[] = []
  for (const c of concerns) {
    const { data: logs } = await supabase
      .from('concern_logs')
      .select('date, severity, note')
      .eq('concern_id', c.id)
      .order('date', { ascending: false })
      .limit(5)
    const recent = (logs ?? []).map((l: any) =>
      `${l.date}: выраженность ${l.severity ?? '—'}/5${l.note ? ` (${l.note})` : ''}`).join('; ')
    lines.push(`${c.name} [${c.status}]${c.started_at ? `, с ${c.started_at}` : ''}${recent ? `\n  наблюдения: ${recent}` : ''}`)
  }
  return lines.join('\n')
}

// Записи по волосам (последние)
export async function loadHairSummary(userId: string): Promise<string> {
  const { data } = await supabase
    .from('hair_entries')
    .select('date, shedding_level, density_rating, hairline_rating, notes')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(6)
  if (!data?.length) return ''
  return data.map((e: any) => {
    const parts = [
      e.shedding_level ? `выпадение ${e.shedding_level}/5` : null,
      e.density_rating ? `густота ${e.density_rating}/5` : null,
      e.hairline_rating ? `линия роста ${e.hairline_rating}/5` : null,
    ].filter(Boolean).join(', ')
    return `${e.date}: ${parts}${e.notes ? ` — ${e.notes}` : ''}`
  }).join('\n')
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
  // даты приёма по каждому препарату — чтобы можно было связать с конкретным днём
  const datesBySup: Record<string, string[]> = {}
  for (const l of logs ?? []) (datesBySup[l.supplement_id] ??= []).push(l.date)

  // count days in period
  const days: string[] = []
  const d = new Date(cutoff)
  while (d <= new Date()) { days.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }

  const lines = sups.map((s: any) => {
    const taken = days.filter(day => logSet.has(`${s.id}:${day}`)).length
    const pct = days.length ? Math.round((taken / days.length) * 100) : 0
    const dose = s.default_dose ? ` ${s.default_dose}${s.unit ? ' ' + s.unit : ''}` : ''
    const takenDates = (datesBySup[s.id] ?? []).sort()
    const datesStr = takenDates.length ? `\n  дни приёма: ${takenDates.join(', ')}` : ''
    return `${s.name}${dose}: принято ${taken}/${days.length} дней (${pct}%)${datesStr}`
  })

  return lines.join('\n')
}

export async function loadLabSummary(userId: string): Promise<string> {
  const { data } = await supabase
    .from('lab_results')
    .select('marker, value, unit, ref_range, flag, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(200)

  if (!data || !data.length) return ''

  // Group by marker, show latest value + flag (вне нормы) + reference range + trend
  const byMarker: Record<string, { date: string; value: number; unit: string | null; ref_range: string | null; flag: string | null }[]> = {}
  for (const r of data) {
    if (!byMarker[r.marker]) byMarker[r.marker] = []
    byMarker[r.marker].push(r)
  }

  const flagTxt = (f: string | null) => f === 'high' ? ' ⚠️ВЫШЕ НОРМЫ' : f === 'low' ? ' ⚠️НИЖЕ НОРМЫ' : ''
  const summaryLines: string[] = []
  for (const [marker, entries] of Object.entries(byMarker)) {
    const latest = entries[0]
    const unit = latest.unit ? ` ${latest.unit}` : ''
    const ref = latest.ref_range ? ` [норма ${latest.ref_range}]` : ''
    const fl = flagTxt(latest.flag)
    if (entries.length >= 2) {
      const prev = entries[1]
      const delta = latest.value - prev.value
      const sign = delta > 0 ? '+' : ''
      summaryLines.push(`${marker}: ${latest.value}${unit}${fl}${ref} (${latest.date}, ${sign}${delta.toFixed(1)} vs ${prev.date})`)
    } else {
      summaryLines.push(`${marker}: ${latest.value}${unit}${fl}${ref} (${latest.date})`)
    }
  }

  return summaryLines.join('\n')
}

// Календарь (встречи/события) — компактно: всего за период + по дням.
// Это прямой сигнал нагрузки дня для связи со стрессом/пульсом/сном.
export async function loadCalendarSummary(userId: string, periodDays: number): Promise<string> {
  const since = new Date(); since.setDate(since.getDate() - periodDays)
  const { data } = await supabase
    .from('calendar_events')
    .select('start_ts')
    .eq('user_id', userId)
    .gte('start_ts', since.toISOString())
  if (!data?.length) return ''
  const byDay: Record<string, number> = {}
  for (const e of data) { const d = (e.start_ts as string).slice(0, 10); byDay[d] = (byDay[d] ?? 0) + 1 }
  const perDay = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]))
    .map(([d, c]) => `${d.slice(5)}—${c}`).join(', ')
  return `Всего встреч за ${periodDays} дн: ${data.length}.\nПо дням (загруженность): ${perDay}`
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
    if (res.status === 402) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.message || 'Достигнут месячный лимит ИИ-расходов. Увеличь бюджет в Настройках.')
    }
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
