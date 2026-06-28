import { callFunction } from './edgeFunctions'

// AI "ideal supplement timing" — types, a defensive parser for the model's JSON,
// and the mapping from a schedule to reminder times. The parser/mapper are pure
// so they're unit-tested directly (node env, no DOM).

export interface ScheduleItem {
  supplement: string
  reason: string
}

export interface Slot {
  time: string // "HH:MM"
  label: string
  items: ScheduleItem[]
}

export interface Schedule {
  slots: Slot[]
  notes: string
  disclaimer: string
}

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

function normTime(t: unknown): string | null {
  if (typeof t !== 'string') return null
  const s = t.trim()
  if (!TIME_RE.test(s)) return null
  const [h, m] = s.split(':')
  return `${h.padStart(2, '0')}:${m}`
}

// Validates + cleans the model's response. Drops malformed slots/items rather
// than failing the whole thing; returns null only if nothing usable remains.
export function parseSchedule(raw: unknown): Schedule | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const rawSlots = Array.isArray(obj.slots) ? obj.slots : []

  const slots: Slot[] = []
  for (const s of rawSlots) {
    if (!s || typeof s !== 'object') continue
    const slot = s as Record<string, unknown>
    const time = normTime(slot.time)
    if (!time) continue
    const rawItems = Array.isArray(slot.items) ? slot.items : []
    const items: ScheduleItem[] = []
    for (const it of rawItems) {
      if (!it || typeof it !== 'object') continue
      const item = it as Record<string, unknown>
      const supplement = typeof item.supplement === 'string' ? item.supplement.trim() : ''
      if (!supplement) continue
      const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
      items.push({ supplement, reason })
    }
    if (!items.length) continue
    const label = typeof slot.label === 'string' ? slot.label.trim() : ''
    slots.push({ time, label, items })
  }

  if (!slots.length) return null
  slots.sort((a, b) => a.time.localeCompare(b.time))

  return {
    slots,
    notes: typeof obj.notes === 'string' ? obj.notes.trim() : '',
    disclaimer: typeof obj.disclaimer === 'string' ? obj.disclaimer.trim() : '',
  }
}

// Collapses a schedule into { supplementName: [sorted, deduped times] } so each
// supplement's recommended times can be written to its reminder setting.
export function scheduleToReminderTimes(schedule: Schedule): Record<string, string[]> {
  const map: Record<string, Set<string>> = {}
  for (const slot of schedule.slots) {
    for (const item of slot.items) {
      ;(map[item.supplement] ??= new Set()).add(slot.time)
    }
  }
  const out: Record<string, string[]> = {}
  for (const [name, times] of Object.entries(map)) {
    out[name] = [...times].sort()
  }
  return out
}

export interface ScheduleResponse {
  schedule?: Schedule
  message?: string
}

// Calls the edge function and parses its response. Returns a message (e.g. "no
// supplements") when there's no schedule to show.
export async function fetchSupplementSchedule(): Promise<ScheduleResponse> {
  const json = await callFunction<{ slots?: unknown; notes?: unknown; disclaimer?: unknown; message?: string }>(
    'supplement-schedule',
  )
  const schedule = parseSchedule(json)
  if (!schedule) return { message: json?.message }
  return { schedule }
}
