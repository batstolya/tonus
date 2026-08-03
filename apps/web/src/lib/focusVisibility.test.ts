import { describe, it, expect } from 'vitest'
import { nextMorning, isHidden, MORNING_HOUR } from './focusVisibility'

// Local time throughout: the user's morning is the one where they live, so
// every expectation is built with the local-time constructor rather than a Z
// string, which would silently bind these to whatever TZ CI runs in.
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min)

describe('nextMorning', () => {
  it('returns this morning when the day has not reached it yet', () => {
    expect(nextMorning(at(2026, 8, 3, 4, 0))).toEqual(at(2026, 8, 3, MORNING_HOUR, 0))
  })

  it('returns tomorrow once the morning hour has arrived', () => {
    expect(nextMorning(at(2026, 8, 3, MORNING_HOUR, 0))).toEqual(at(2026, 8, 4, MORNING_HOUR, 0))
  })

  it('returns tomorrow from the middle of the day', () => {
    expect(nextMorning(at(2026, 8, 3, 14, 30))).toEqual(at(2026, 8, 4, MORNING_HOUR, 0))
  })

  // The reason the cutoff is a morning hour and not midnight: hiding the card
  // late in the evening should buy a night, not twenty minutes.
  it('keeps a late-evening dismissal until the next morning', () => {
    expect(nextMorning(at(2026, 8, 3, 23, 40))).toEqual(at(2026, 8, 4, MORNING_HOUR, 0))
  })

  it('treats after-midnight as the same night, not a new one', () => {
    expect(nextMorning(at(2026, 8, 4, 1, 15))).toEqual(at(2026, 8, 4, MORNING_HOUR, 0))
  })

  it('crosses a month boundary', () => {
    expect(nextMorning(at(2026, 8, 31, 22, 0))).toEqual(at(2026, 9, 1, MORNING_HOUR, 0))
  })
})

describe('isHidden', () => {
  const stored = at(2026, 8, 4, MORNING_HOUR, 0).toISOString()

  it('hides while now is before the stored moment', () => {
    expect(isHidden(at(2026, 8, 3, 23, 0), stored)).toBe(true)
  })

  it('shows once the stored moment has passed', () => {
    expect(isHidden(at(2026, 8, 4, 5, 1), stored)).toBe(false)
  })

  it('shows exactly at the stored moment', () => {
    expect(isHidden(at(2026, 8, 4, MORNING_HOUR, 0), stored)).toBe(false)
  })

  // Every unreadable state resolves to visible. Losing the card because a
  // stored value went strange would be the worse failure of the two.
  it('shows when nothing is stored', () => {
    expect(isHidden(at(2026, 8, 3, 12, 0), null)).toBe(false)
  })

  it('shows when the stored value is not a date', () => {
    expect(isHidden(at(2026, 8, 3, 12, 0), 'yesterday')).toBe(false)
  })

  it('shows when the stored value is empty', () => {
    expect(isHidden(at(2026, 8, 3, 12, 0), '')).toBe(false)
  })
})
