import { describe, it, expect } from 'vitest'
import { summarizeMetrics, weeklyRows, latestLabs, parseRefRange } from './doctorReport'
import type { DailyMetrics } from '../types'
import type { LabResult } from './labs'

const day = (date: string, over: Partial<DailyMetrics> = {}): DailyMetrics => ({ date, ...over })

// 40 дней ровных данных: rhr 60, hrv 50, сон 7.5, шаги 10000
const flat40: DailyMetrics[] = Array.from({ length: 40 }, (_, i) => {
  const d = new Date(2026, 5, 1 + i)
  const ds = `2026-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return day(ds, { restingHeartRate: 60, hrv: 50, sleepHours: 7.5, steps: 10000 })
})

describe('summarizeMetrics', () => {
  it('avg/min/max за период', () => {
    const daily = [
      day('2026-07-01', { restingHeartRate: 58 }),
      day('2026-07-02', { restingHeartRate: 62 }),
      day('2026-07-03', { restingHeartRate: 60 }),
    ]
    const s = summarizeMetrics(daily, 30).find(m => m.key === 'restingHeartRate')!
    expect(s.avg).toBe(60)
    expect(s.min).toBe(58)
    expect(s.max).toBe(62)
  })

  it('нет данных метрики → null-поля', () => {
    const s = summarizeMetrics([day('2026-07-01', { hrv: 50 })], 30).find(m => m.key === 'steps')!
    expect(s.avg).toBeNull()
    expect(s.min).toBeNull()
  })

  it('период ограничивает выборку', () => {
    const daily = [
      day('2026-01-01', { restingHeartRate: 100 }), // далеко в прошлом
      day('2026-07-01', { restingHeartRate: 60 }),
    ]
    const s = summarizeMetrics(daily, 30).find(m => m.key === 'restingHeartRate')!
    expect(s.avg).toBe(60) // столетний выброс не попал
  })

  it('на ровных данных baselinePct ≈ 0', () => {
    const s = summarizeMetrics(flat40, 30).find(m => m.key === 'hrv')!
    expect(Math.abs(s.baselinePct ?? 99)).toBeLessThanOrEqual(1)
  })
})

describe('weeklyRows', () => {
  it('агрегирует по неделям с понедельника, последние недели периода', () => {
    const rows = weeklyRows(flat40, 30)
    expect(rows.length).toBeGreaterThanOrEqual(4)
    expect(rows.length).toBeLessThanOrEqual(6)
    for (const r of rows) {
      expect(r.rhr).toBe(60)
      expect(r.sleep).toBe(7.5)
      // weekStart — всегда понедельник
      const [y, m, d] = r.weekStart.split('-').map(Number)
      expect(new Date(y, m - 1, d).getDay()).toBe(1)
    }
  })

  it('пусто при отсутствии данных', () => {
    expect(weeklyRows([], 90)).toEqual([])
  })
})

describe('parseRefRange', () => {
  it('парсит форматы диапазонов', () => {
    expect(parseRefRange('3.5-5.5')).toEqual({ lo: 3.5, hi: 5.5 })
    expect(parseRefRange('10 – 20')).toEqual({ lo: 10, hi: 20 })
    expect(parseRefRange('3,9 - 6,2')).toEqual({ lo: 3.9, hi: 6.2 })
    expect(parseRefRange('< 5')).toEqual({ lo: -Infinity, hi: 5 })
    expect(parseRefRange('> 1.2')).toEqual({ lo: 1.2, hi: Infinity })
    expect(parseRefRange('норма')).toBeNull()
    expect(parseRefRange(null)).toBeNull()
  })
})

describe('latestLabs', () => {
  const lab = (marker: string, value: number, date: string, ref?: string, flag?: string): LabResult =>
    ({ id: `${marker}-${date}`, lab_file_id: 'f', marker, value, unit: 'ммоль/л', ref_range: ref ?? null, flag: flag ?? null, date })

  it('последнее значение маркера + дельта с предыдущим', () => {
    const lines = latestLabs([
      lab('Глюкоза', 5.2, '2026-05-01', '3.9-6.2'),
      lab('Глюкоза', 5.8, '2026-07-01', '3.9-6.2'),
      lab('Ферритин', 30, '2026-07-01', '20-250'),
    ])
    const glu = lines.find(l => l.marker === 'Глюкоза')!
    expect(glu.value).toBe(5.8)
    expect(glu.prevValue).toBe(5.2)
    expect(glu.flag).toBeNull()
    const fer = lines.find(l => l.marker === 'Ферритин')!
    expect(fer.prevValue).toBeNull()
  })

  it('вне диапазона → флаг ↑/↓', () => {
    const lines = latestLabs([
      lab('ТТГ', 6.1, '2026-07-01', '0.4-4.0'),
      lab('Витамин D', 12, '2026-07-01', '30-100'),
    ])
    expect(lines.find(l => l.marker === 'ТТГ')!.flag).toBe('↑')
    expect(lines.find(l => l.marker === 'Витамин D')!.flag).toBe('↓')
  })

  it('существующий флаг из БД уважается, если диапазон не парсится', () => {
    const lines = latestLabs([lab('X', 1, '2026-07-01', 'см. бланк', 'H')])
    expect(lines.find(l => l.marker === 'X')!.flag).toBe('↑')
  })
})
