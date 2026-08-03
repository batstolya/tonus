import type { IntakeEvent } from './chat'
import type { IconName } from './icons'

// Контекстные события, которые объясняют изменения метрик на графиках (#6).
//
// No colour field at all. These are annotations over a metric line, and every
// way of colouring them failed: five distinct hues cannot pass the separation
// checks (the categorical theme holds four), and the hues they did take
// collided with the series they annotate. Painting all five the same recessive
// grey then made them indistinguishable, which is worse — a row of identical
// dots says only "something happened". Identity now comes from the icon and
// label in the tooltip, and from the filter chips that decide which types are
// drawn at all.
export const CHART_EVENT_TYPES: { type: string; icon: IconName; label: string }[] = [
  { type: 'alcohol', icon: 'alcohol', label: 'Алкоголь' },
  { type: 'illness', icon: 'illness', label: 'Болезнь' },
  { type: 'stress', icon: 'stressAnxious', label: 'Стресс' },
  { type: 'workout', icon: 'sportGym', label: 'Тренировка' },
  { type: 'travel', icon: 'travel', label: 'Поездка' },
]

export interface EventMarker { x: string; icon: IconName; type: string; label: string }

export interface GroupedEventMarker {
  x: string
  // Один элемент на тип события: тултип называет каждое.
  events: { type: string; icon: IconName; label: string }[]
}

// Одна вертикальная линия на дату вместо линии на каждое событие: несколько
// событий в день сливаются в один маркер.
export function groupMarkersByDate(markers: EventMarker[]): GroupedEventMarker[] {
  const byDate = new Map<string, GroupedEventMarker>()
  for (const m of markers) {
    const entry = { type: m.type, icon: m.icon, label: m.label }
    const g = byDate.get(m.x)
    if (g) g.events.push(entry)
    else byDate.set(m.x, { x: m.x, events: [entry] })
  }
  return [...byDate.values()]
}

// Индекс для тултипа: он знает только дату наведённой точки.
export function markersByDate(grouped: GroupedEventMarker[]): Map<string, GroupedEventMarker> {
  return new Map(grouped.map(g => [g.x, g]))
}

// Маркеры для событий, попадающих в показанные даты графика.
// dateKey(ts) приводит timestamp к той же форме, что dataKey оси X.
// activeTypes ограничивает выборку типами, включёнными в легенде-фильтре.
export function eventMarkers(
  events: IntakeEvent[],
  shownDates: Set<string>,
  dateKey: (isoDate: string) => string,
  activeTypes?: Set<string>,
): EventMarker[] {
  const byType = new Map(CHART_EVENT_TYPES.map(e => [e.type, e]))
  const seen = new Set<string>()
  const out: EventMarker[] = []
  for (const ev of events) {
    const cfg = byType.get(ev.type)
    if (!cfg) continue
    if (activeTypes && !activeTypes.has(ev.type)) continue
    const isoDate = (ev.ts ?? '').slice(0, 10)
    const x = dateKey(isoDate)
    if (!shownDates.has(x)) continue
    const k = `${x}:${ev.type}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ x, icon: cfg.icon, type: ev.type, label: cfg.label })
  }
  return out
}
