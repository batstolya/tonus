import { supabase } from './supabase'
import type { DailyMetrics } from '../types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// Build compact context snapshot to send once per session
function avg(vals: number[]): number | null {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}
function pick(days: DailyMetrics[], key: keyof DailyMetrics): number[] {
  return days.map(d => d[key] as number | null).filter((v): v is number => v != null)
}

export function buildContextSnapshot(daily: DailyMetrics[], periodDays = 30): string {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const slice = sorted.slice(-periodDays)
  if (!slice.length) return 'Данных нет.'

  const lines: string[] = [`Период: ${slice[0].date} — ${slice[slice.length - 1].date} (${slice.length} дней)`]

  const rhr = pick(slice, 'restingHeartRate')
  if (rhr.length) lines.push(`Пульс покоя: среднее ${avg(rhr)?.toFixed(0)} уд/мин, мин ${Math.min(...rhr).toFixed(0)}, макс ${Math.max(...rhr).toFixed(0)}`)

  const hrv = pick(slice, 'hrv')
  if (hrv.length) lines.push(`HRV: среднее ${avg(hrv)?.toFixed(0)} мс`)

  const sleep = pick(slice, 'sleepHours')
  if (sleep.length) {
    const a = avg(sleep)!
    const good = sleep.filter(v => v >= 7).length
    lines.push(`Сон: среднее ${a.toFixed(1)} ч, ночей с ≥7ч: ${good}/${sleep.length}`)
  }

  const steps = pick(slice, 'steps')
  if (steps.length) {
    const a = avg(steps)!
    const goal = steps.filter(v => v >= 8000).length
    lines.push(`Шаги: среднее ${Math.round(a).toLocaleString()}/день, дней с 8к+: ${goal}/${steps.length}`)
  }

  const spo2 = pick(slice, 'oxygenSaturation')
  if (spo2.length) lines.push(`SpO₂: среднее ${(avg(spo2)! * 100).toFixed(1)}%`)

  const energy = pick(slice, 'activeEnergy')
  if (energy.length) lines.push(`Активные калории: среднее ${Math.round(avg(energy)!)} ккал/день`)

  return lines.join('\n')
}

export async function sendChatMessage(
  message: string,
  sessionId: string | null,
  contextSnapshot: string | null,
  periodLabel: string,
): Promise<{ reply: string; sessionId: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Не авторизован')

  const supabaseUrl = (supabase as any).supabaseUrl as string
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
