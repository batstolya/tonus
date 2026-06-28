import { describe, it, expect } from 'vitest'
import { parseSchedule, scheduleToReminderTimes, type Schedule } from './supplementSchedule'
import { translations } from './translations'

describe('parseSchedule', () => {
  it('parses a valid response and sorts slots by time', () => {
    const raw = {
      slots: [
        { time: '21:00', label: 'Вечер', items: [{ supplement: 'Магний', reason: 'для сна' }] },
        { time: '8:00', label: 'Утро', items: [{ supplement: 'Витамин D', reason: 'с едой' }] },
      ],
      notes: 'кальций и железо врозь',
      disclaimer: 'не мед. совет',
    }
    const out = parseSchedule(raw)!
    expect(out.slots.map((s) => s.time)).toEqual(['08:00', '21:00'])
    expect(out.slots[0].items[0].supplement).toBe('Витамин D')
    expect(out.notes).toBe('кальций и железо врозь')
    expect(out.disclaimer).toBe('не мед. совет')
  })

  it('drops malformed slots/items but keeps usable ones', () => {
    const raw = {
      slots: [
        { time: 'noon', items: [{ supplement: 'X' }] }, // bad time → dropped
        { time: '09:00', items: [{ reason: 'no name' }] }, // no supplement → empty → dropped
        { time: '09:00', items: [{ supplement: 'Цинк', reason: 'натощак' }, { supplement: '  ' }] },
      ],
    }
    const out = parseSchedule(raw)!
    expect(out.slots).toHaveLength(1)
    expect(out.slots[0].items).toHaveLength(1)
    expect(out.slots[0].items[0].supplement).toBe('Цинк')
    expect(out.notes).toBe('')
  })

  it('returns null for junk or empty results', () => {
    expect(parseSchedule(null)).toBeNull()
    expect(parseSchedule('nope')).toBeNull()
    expect(parseSchedule({ slots: [] })).toBeNull()
    expect(parseSchedule({ slots: [{ time: 'bad', items: [] }] })).toBeNull()
  })
})

describe('scheduleToReminderTimes', () => {
  it('maps each supplement to sorted, deduped times', () => {
    const schedule: Schedule = {
      slots: [
        { time: '08:00', label: '', items: [{ supplement: 'Витамин D', reason: '' }, { supplement: 'Омега-3', reason: '' }] },
        { time: '21:00', label: '', items: [{ supplement: 'Магний', reason: '' }, { supplement: 'Витамин D', reason: '' }] },
      ],
      notes: '',
      disclaimer: '',
    }
    const map = scheduleToReminderTimes(schedule)
    expect(map['Витамин D']).toEqual(['08:00', '21:00'])
    expect(map['Омега-3']).toEqual(['08:00'])
    expect(map['Магний']).toEqual(['21:00'])
  })
})

describe('supplement-schedule i18n', () => {
  const KEYS = [
    'Идеальное время приёма',
    'Подобрать (ИИ)',
    'Год рождения',
    'Пол',
    'Мужской',
    'Женский',
    'Сохранить и подобрать',
    'Применить к напоминаниям',
    'Применено к напоминаниям',
  ]
  it('has uk + en translations for every visible string', () => {
    for (const key of KEYS) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
