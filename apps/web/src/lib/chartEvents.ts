import type { IntakeEvent } from './chat'

// Контекстные события, которые объясняют изменения метрик на графиках (#6).
// One recessive colour for all five, not five hues. These are annotations over
// a metric line, and each already carries its own glyph plus a label in the
// tooltip — identity never rests on the colour. Five separate hues could not be
// made to pass the separation checks anyway (the categorical theme holds four),
// and they competed with the series they were meant to annotate.
const MARKER = 'var(--chart-axis)'

export const CHART_EVENT_TYPES: { type: string; emoji: string; color: string; label: string }[] = [
  { type: 'alcohol', emoji: '🍷', color: MARKER, label: 'Алкоголь' },
  { type: 'illness', emoji: '🤒', color: MARKER, label: 'Болезнь' },
  { type: 'stress', emoji: '😰', color: MARKER, label: 'Стресс' },
  { type: 'workout', emoji: '🏋️', color: MARKER, label: 'Тренировка' },
  { type: 'travel', emoji: '🧳', color: MARKER, label: 'Поездка' },
]

export interface EventMarker { x: string; emoji: string; color: string; type: string; label: string }

export interface GroupedEventMarker {
  x: string
  // Один элемент на тип события: рисуем точку на каждый, называем в тултипе.
  events: { type: string; emoji: string; color: string; label: string }[]
  // Цвет самой вертикальной линии — по первому событию дня.
  color: string
}

// Точек на дату рисуем не больше: пять типов в один день — редкость, а лишние
// точки размывают полосу. Полный список всё равно виден в тултипе.
export const MAX_MARKER_DOTS = 3

// Одна вертикальная линия на дату вместо линии на каждое событие: несколько
// событий в день сливаются в один маркер.
export function groupMarkersByDate(markers: EventMarker[]): GroupedEventMarker[] {
  const byDate = new Map<string, GroupedEventMarker>()
  for (const m of markers) {
    const entry = { type: m.type, emoji: m.emoji, color: m.color, label: m.label }
    const g = byDate.get(m.x)
    if (g) g.events.push(entry)
    else byDate.set(m.x, { x: m.x, events: [entry], color: m.color })
  }
  return [...byDate.values()]
}

// Индекс для тултипа: он знает только дату наведённой точки.
export function markersByDate(grouped: GroupedEventMarker[]): Map<string, GroupedEventMarker> {
  return new Map(grouped.map(g => [g.x, g]))
}

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
    out.push({ x, emoji: cfg.emoji, color: cfg.color, type: ev.type, label: cfg.label })
  }
  return out
}
