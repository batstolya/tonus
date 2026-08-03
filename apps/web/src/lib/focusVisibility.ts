// The weekly-focus card is useful in the morning and in the way afterwards, so
// it can be hidden for the rest of the day and comes back on its own.
//
// The cutoff is a morning hour rather than midnight on purpose: hiding the card
// at 23:40 should buy a night, not twenty minutes, and work past midnight still
// belongs to the same evening.

export const MORNING_HOUR = 5

export const FOCUS_HIDDEN_KEY = 'tonus_focus_hidden_until'

/** The next moment the card should reappear, in local time. */
export function nextMorning(now: Date): Date {
  const morning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), MORNING_HOUR, 0, 0, 0)
  if (now.getTime() >= morning.getTime()) morning.setDate(morning.getDate() + 1)
  return morning
}

/**
 * Whether the card is hidden right now.
 *
 * Every unreadable state — absent, empty, unparseable — resolves to visible.
 * Between showing the card when it should be hidden and losing it because a
 * stored value went strange, the first is the far cheaper mistake.
 */
export function isHidden(now: Date, storedUntil: string | null): boolean {
  if (!storedUntil) return false
  const until = new Date(storedUntil).getTime()
  if (Number.isNaN(until)) return false
  return now.getTime() < until
}
