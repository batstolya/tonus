import { describe, it, expect } from 'vitest'
import { validateFocusCheck, inferFocusCheck } from './coach'

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

describe('inferFocusCheck', () => {
  it('выводит приёмы пищи', () => {
    expect(inferFocusCheck('Добавить полноценный прием пищи 3 раза на неделе'))
      .toEqual({ predicate: { kind: 'meals_gte', value: 3 } })
    expect(inferFocusCheck('Есть 4 полноценных приёма пищи'))
      .toEqual({ predicate: { kind: 'meals_gte', value: 4 } })
  })

  it('выводит сон в часах', () => {
    expect(inferFocusCheck('Спать не меньше 8 часов'))
      .toEqual({ predicate: { kind: 'sleep_hours_gte', value: 8 } })
    expect(inferFocusCheck('Высыпаться каждый день'))
      .toEqual({ predicate: { kind: 'sleep_hours_gte', value: 7 } })
  })

  it('выводит шаги', () => {
    expect(inferFocusCheck('Проходить 10000 шагов в день'))
      .toEqual({ predicate: { kind: 'steps_gte', value: 10000 } })
  })

  it('выводит время отбоя', () => {
    expect(inferFocusCheck('Ложиться спать до 23:30'))
      .toEqual({ predicate: { kind: 'bedtime_before', time: '23:30' } })
  })

  it('возвращает null для невыразимых целей', () => {
    expect(inferFocusCheck('Быть благодарным и меньше нервничать')).toBeNull()
    expect(inferFocusCheck('Меньше кофе после обеда')).toBeNull()
  })
})
