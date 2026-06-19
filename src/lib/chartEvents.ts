import type { IntakeEvent } from './chat'

// Контекстные события, которые объясняют изменения метрик на графиках (#6).
export const CHART_EVENT_TYPES: { type: string; emoji: string; color: string; label: string }[] = [
  { type: 'alcohol', emoji: '🍷', color: '#f43f5e', label: 'Алкоголь' },
  { type: 'illness', emoji: '🤒', color: '#ef4444', label: 'Болезнь' },
  { type: 'stress', emoji: '😰', color: '#f59e0b', label: 'Стресс' },
  { type: 'workout', emoji: '🏋️', color: '#22c55e', label: 'Тренировка' },
  { type: 'travel', emoji: '🧳', color: '#8b5cf6', label: 'Поездка' },
]

export interface EventMarker { x: string; emoji: string; color: string; type: string }

// Маркеры для событий, попадающих в показанные даты графика.
// dateKey(ts) приводит timestamp к той же форме, что dataKey оси X.
export function eventMarkers(
  events: IntakeEvent[],
  shownDates: Set<string>,
  dateKey: (isoDate: string) => string,
): EventMarker[] {
  const byType = new Map(CHART_EVENT_TYPES.map(e => [e.type, e]))
  const seen = new Set<string>()
  const out: EventMarker[] = []
  for (const ev of events) {
    const cfg = byType.get(ev.type)
    if (!cfg) continue
    const isoDate = (ev.ts ?? '').slice(0, 10)
    const x = dateKey(isoDate)
    if (!shownDates.has(x)) continue
    const k = `${x}:${ev.type}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ x, emoji: cfg.emoji, color: cfg.color, type: ev.type })
  }
  return out
}
