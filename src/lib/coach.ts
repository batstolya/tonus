import { supabase } from './supabase'
import { callFunction } from './edgeFunctions'

export interface CoachFocus { text: string; set_at: string; check?: FocusCheck | null }

export interface FocusCheck {
  predicate: DayPredicate
  target?: number   // задан → цель-частота (знаменатель = target); иначе ежедневная (=7)
  label?: string
}

export type DayPredicate =
  | { kind: 'steps_gte'; value: number }
  | { kind: 'sleep_hours_gte'; value: number }
  | { kind: 'bedtime_before'; time: string }
  | { kind: 'meals_gte'; value: number }
  | { kind: 'event_count_lte'; event: string; value: number }
  | { kind: 'event_absent_after'; event: string; time: string }
  | { kind: 'event_present'; event: string }
  | { kind: 'event_absent'; event: string }
  | { kind: 'wellbeing_gte'; value: number }

export const FOCUS_EVENT_TYPES = ['coffee', 'alcohol', 'meal', 'water', 'meds', 'workout', 'illness', 'stress', 'travel', 'custom']

export function validateFocusCheck(obj: any): FocusCheck | null {
  if (!obj || typeof obj !== 'object') return null
  const p = obj.predicate
  if (!p || typeof p !== 'object') return null
  const numOk = (v: any) => typeof v === 'number' && isFinite(v)
  const timeOk = (v: any) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v)
  const evOk = (v: any) => typeof v === 'string' && FOCUS_EVENT_TYPES.includes(v)
  let ok = false
  switch (p.kind) {
    case 'steps_gte': case 'sleep_hours_gte': case 'meals_gte': case 'wellbeing_gte': ok = numOk(p.value); break
    case 'bedtime_before': ok = timeOk(p.time); break
    case 'event_count_lte': ok = evOk(p.event) && numOk(p.value); break
    case 'event_absent_after': ok = evOk(p.event) && timeOk(p.time); break
    case 'event_present': case 'event_absent': ok = evOk(p.event); break
    default: ok = false
  }
  if (!ok) return null
  const out: FocusCheck = { predicate: p as DayPredicate }
  if (obj.target != null) {
    if (!numOk(obj.target) || obj.target < 1 || obj.target > 7) return null
    out.target = Math.round(obj.target)
  }
  if (typeof obj.label === 'string') out.label = obj.label
  return out
}

// Эвристика на фронте: если коуч не приложил машинный check, попробовать вывести его
// из текста фокуса, чтобы частые ежедневные цели (еда/сон/шаги/отбой) считались автоматически.
// Используется как запасной вариант — машинный check от коуча всегда в приоритете.
export function inferFocusCheck(text: string): FocusCheck | null {
  const s = text.toLowerCase()

  // Время отхода ко сну: «лечь до 23:00», «отбой до 00:30»
  const bed = s.match(/(?:леч|ложит|ложус|отбой|в постел|спать).{0,24}?(\d{1,2})[:.](\d{2})/)
  if (bed) return { predicate: { kind: 'bedtime_before', time: `${bed[1].padStart(2, '0')}:${bed[2]}` } }

  // Сон в часах: «спать 7 часов», «высыпаться»
  if (/(?:сон|выспат|высыпат|спать|sleep)/.test(s)) {
    const m = s.match(/(\d{1,2})\s*(?:ч|h)/)
    const h = m ? parseInt(m[1], 10) : 7
    if (h >= 4 && h <= 12) return { predicate: { kind: 'sleep_hours_gte', value: h } }
  }

  // Шаги: «10000 шагов», «больше ходить»
  if (/(?:шаг|ходьб|пройти|проход|steps|walk)/.test(s)) {
    const m = s.match(/(\d[\d\s]{2,}\d)/)
    const v = m ? parseInt(m[1].replace(/\s/g, ''), 10) : 8000
    if (v >= 1000 && v <= 30000) return { predicate: { kind: 'steps_gte', value: v } }
  }

  // Полноценные приёмы пищи: «есть 3 раза», «полноценный приём пищи»
  if (/при[ёе]м(?:ов|а)?\s+пищи|полноцен|поесть|поешь|регулярн.{0,12}(?:ед|пита)|завтрак|\bmeal/.test(s)) {
    const m = s.match(/\b([1-6])\b/)
    return { predicate: { kind: 'meals_gte', value: m ? parseInt(m[1], 10) : 3 } }
  }

  return null
}

export async function loadFocus(userId: string): Promise<CoachFocus | null> {
  const { data } = await supabase.from('coach_profile').select('focus').eq('user_id', userId).maybeSingle()
  const f = data?.focus
  return f && f.text ? f as CoachFocus : null
}

// Чек-ины фокуса за текущую неделю (с момента установки фокуса)
export async function loadCheckins(userId: string, sinceISO: string): Promise<string[]> {
  const { data } = await supabase
    .from('coach_events')
    .select('created_at')
    .eq('user_id', userId).eq('type', 'focus_checkin')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false })
  return (data ?? []).map((e: any) => e.created_at.slice(0, 10))
}

export async function checkInToday(userId: string): Promise<void> {
  await supabase.from('coach_events').insert({ user_id: userId, type: 'focus_checkin', payload: { date: new Date().toISOString().slice(0, 10) } })
}

export async function removeCheckinToday(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  await supabase.from('coach_events')
    .delete()
    .eq('user_id', userId).eq('type', 'focus_checkin')
    .gte('created_at', `${today}T00:00:00`)
}

// Запустить разбор недели вручную (кнопка) — возвращает текст
export async function runWeeklyReview(): Promise<string | null> {
  try {
    const j = await callFunction<{ text?: string }>('coach-weekly', {})
    return j.text ?? null
  } catch { return null }
}

// Данные для авто-оценки фокуса: intake-события + самочувствие по дням, начиная с sinceDate.
export async function loadFocusInputs(userId: string, sinceDate: string): Promise<{ intake: { ts: string; type: string }[]; wellbeingByDate: Record<string, number> }> {
  const [intakeRes, noteRes] = await Promise.all([
    supabase.from('intake_events').select('ts, type').eq('user_id', userId).gte('ts', `${sinceDate}T00:00:00Z`),
    supabase.from('context_notes').select('date, wellbeing').eq('user_id', userId).gte('date', sinceDate),
  ])
  const wellbeingByDate: Record<string, number> = {}
  for (const r of noteRes.data ?? []) if (typeof (r as any).wellbeing === 'number') wellbeingByDate[(r as any).date] = (r as any).wellbeing
  return { intake: (intakeRes.data ?? []) as { ts: string; type: string }[], wellbeingByDate }
}
