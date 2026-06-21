import { describe, it, expect } from 'vitest'
import { validateFocusCheck } from './coach'

describe('validateFocusCheck', () => {
  it('принимает валидные формы', () => {
    expect(validateFocusCheck({ predicate: { kind: 'steps_gte', value: 8000 } }))
      .toEqual({ predicate: { kind: 'steps_gte', value: 8000 } })
    expect(validateFocusCheck({ predicate: { kind: 'bedtime_before', time: '23:00' } })!.predicate.kind).toBe('bedtime_before')
    expect(validateFocusCheck({ predicate: { kind: 'event_absent_after', event: 'coffee', time: '16:00' } })!.predicate.kind).toBe('event_absent_after')
    const wk = validateFocusCheck({ predicate: { kind: 'event_present', event: 'workout' }, target: 3 })
    expect(wk!.target).toBe(3)
  })

  it('отклоняет мусор', () => {
    expect(validateFocusCheck(null)).toBeNull()
    expect(validateFocusCheck({ predicate: { kind: 'unknown' } })).toBeNull()
    expect(validateFocusCheck({ predicate: { kind: 'steps_gte' } })).toBeNull()           // нет value
    expect(validateFocusCheck({ predicate: { kind: 'event_present', event: 'pizza' } })).toBeNull() // плохой event
    expect(validateFocusCheck({ predicate: { kind: 'event_present', event: 'workout' }, target: 9 })).toBeNull() // target вне 1..7
    expect(validateFocusCheck({ predicate: { kind: 'bedtime_before', time: 'вечером' } })).toBeNull()
  })
})
