// Соблюдение препаратов (F6, spec: 2026-07-05-smart-tonus-design.md):
// % дней с приёмом за окно (14/30 дней), серия подряд, общий процент.
// Чистая логика поверх supplements + supplement_logs; тесты — adherence.test.ts.

export interface SupplementInfo {
  id: string
  name: string
}

export interface AdherenceLog {
  supplement_id: string
  date: string // YYYY-MM-DD
  taken: boolean
}

export interface SupplementAdherence {
  id: string
  name: string
  taken: number   // дней с приёмом в окне
  days: number    // размер окна
  pct: number     // 0..100
  streak: number  // дней подряд (сегодня или до вчера включительно)
}

export interface AdherenceResult {
  items: SupplementAdherence[]
  overallPct: number | null // суммарно по всем препаратам; null если препаратов нет
}

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

  // supplement_id → set дат приёма (только taken, только внутри окна)
  const takenDates = new Map<string, Set<string>>()
  for (const l of logs) {
    if (!l.taken || l.date < windowStart || l.date > today) continue
    let set = takenDates.get(l.supplement_id)
    if (!set) takenDates.set(l.supplement_id, set = new Set())
    set.add(l.date)
  }

  const items: SupplementAdherence[] = supplements.map(s => {
    const dates = takenDates.get(s.id) ?? new Set<string>()
    // серия: с сегодня; если сегодня ещё не отмечен — с вчера
    let cursor = dates.has(today) ? today : dayBefore(today)
    let streak = 0
    while (dates.has(cursor)) { streak++; cursor = dayBefore(cursor) }
    return {
      id: s.id,
      name: s.name,
      taken: dates.size,
      days: periodDays,
      pct: Math.round((dates.size / periodDays) * 100),
      streak,
    }
  })

  const totalTaken = items.reduce((a, i) => a + i.taken, 0)
  const totalDays = periodDays * items.length
  return { items, overallPct: totalDays ? Math.round((totalTaken / totalDays) * 100) : null }
}
