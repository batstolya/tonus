// Соблюдение препаратов (F6, spec: 2026-07-05-smart-tonus-design.md):
// % дней с приёмом за окно (14/30 дней), серия подряд, общий процент.
// Чистая логика поверх supplements + supplement_logs; тесты — adherence.test.ts.

export interface SupplementInfo {
  id: string
  name: string
  /** Doses expected per day; absent means the old one-a-day behaviour. */
  doses_per_day?: number | null
}

export interface AdherenceLog {
  supplement_id: string
  date: string // YYYY-MM-DD
  taken: boolean
  /** Doses taken that day; absent means one, as before dose counts existed. */
  taken_count?: number | null
}

export interface SupplementAdherence {
  id: string
  name: string
  taken: number   // дней с приёмом в окне (частичный день — дробью)
  days: number    // размер окна
  pct: number     // 0..100
  streak: number  // дней подряд (сегодня или до вчера включительно)
}

export interface AdherenceResult {
  items: SupplementAdherence[]
  overallPct: number | null // суммарно по всем препаратам; null если препаратов нет
}

import { clampDosesPerDay, doseFraction } from './supplementDose'

const dayBefore = (date: string): string => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function computeAdherence(
  supplements: SupplementInfo[],
  logs: AdherenceLog[],
  periodDays: number,
  today: string = new Date().toISOString().slice(0, 10),
): AdherenceResult {
  if (!supplements.length) return { items: [], overallPct: null }

  const windowStart = (() => {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - (periodDays - 1))
    return d.toISOString().slice(0, 10)
  })()

  // supplement_id → дата → доля дня (частичный приём считается дробью).
  // День с любой дозой держит серию: пропущенный вечерний приём не обнуляет её.
  const takenDates = new Map<string, Map<string, number>>()
  const dosesById = new Map(
    supplements.map(s => [s.id, clampDosesPerDay(s.doses_per_day ?? 1)]),
  )
  for (const l of logs) {
    if (!l.taken || l.date < windowStart || l.date > today) continue
    const perDay = dosesById.get(l.supplement_id) ?? 1
    const count = l.taken_count ?? 1
    let byDate = takenDates.get(l.supplement_id)
    if (!byDate) takenDates.set(l.supplement_id, byDate = new Map())
    byDate.set(l.date, doseFraction(count, perDay))
  }

  const items: SupplementAdherence[] = supplements.map(s => {
    const dates = takenDates.get(s.id) ?? new Map<string, number>()
    // серия: с сегодня; если сегодня ещё не отмечен — с вчера
    let cursor = dates.has(today) ? today : dayBefore(today)
    let streak = 0
    while (dates.has(cursor)) { streak++; cursor = dayBefore(cursor) }
    const taken = [...dates.values()].reduce((a, b) => a + b, 0)
    return {
      id: s.id,
      name: s.name,
      taken,
      days: periodDays,
      pct: Math.round((taken / periodDays) * 100),
      streak,
    }
  })

  const totalTaken = items.reduce((a, i) => a + i.taken, 0)
  const totalDays = periodDays * items.length
  return { items, overallPct: totalDays ? Math.round((totalTaken / totalDays) * 100) : null }
}
