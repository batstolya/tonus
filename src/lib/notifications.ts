import type { DailyMetrics } from '../types'
import { computeStreak, isActiveDay, hasDayData } from './streak'

// Порог «данные протухли»: последний день с метриками старше этого — сигнал.
export const STALE_AFTER_DAYS = 2

// Клиентские (derived) уведомления колокольчика: вычисляются из daily на лету,
// нигде не персистятся — исчезают сами, когда условие снято. Тексты собирает
// компонент (t() живёт в React), lib отдаёт только факты.
export type BellItem =
  | { kind: 'streak-risk'; id: string; streak: number; steps: number; exercise: number; freezes: number }
  | { kind: 'stale-sync'; id: string; days: number }

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function buildBellItems(daily: DailyMetrics[], today: Date = new Date()): BellItem[] {
  const items: BellItem[] = []
  const todayStr = ymd(today)

  // Стрик под угрозой: есть что терять и сегодняшний порог ещё не закрыт.
  const streak = computeStreak(daily, today)
  const todayEntry = daily.find(d => d.date === todayStr)
  const todayActive = todayEntry ? isActiveDay(todayEntry) : false
  if (streak.current > 0 && !todayActive) {
    items.push({
      kind: 'streak-risk',
      id: `streak-risk:${todayStr}`,
      streak: streak.current,
      steps: todayEntry?.steps ?? 0,
      exercise: todayEntry?.exerciseMinutes ?? 0,
      freezes: streak.freezesAvailable,
    })
  }

  // Данные протухли: последний день с метриками — STALE_AFTER_DAYS и старше.
  const lastData = daily.filter(hasDayData).map(d => d.date).sort().at(-1)
  if (lastData) {
    const diffDays = Math.floor(
      (new Date(todayStr + 'T12:00:00').getTime() - new Date(lastData + 'T12:00:00').getTime()) / 86400000,
    )
    if (diffDays >= STALE_AFTER_DAYS) {
      items.push({ kind: 'stale-sync', id: `stale-sync:${todayStr}`, days: diffDays })
    }
  }

  return items
}
