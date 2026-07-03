import { describe, it, expect } from 'vitest'
import { buildContextSnapshot, type IntakeEvent } from './chat'
import type { DailyMetrics } from '../types'

// Фиксируем, что все виды данных реально попадают в контекст ИИ-чата —
// «молчаливое» выпадение секции регрессией не пройдёт.

function makeDaily(days: number): DailyMetrics[] {
  const out: DailyMetrics[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    const bed = new Date(d); bed.setDate(bed.getDate() - 1); bed.setHours(23, 15, 0, 0)
    const wake = new Date(d); wake.setHours(7, 30, 0, 0)
    out.push({
      date,
      restingHeartRate: 55 + (i % 5),
      hrv: 45 + (i % 10),
      sleepHours: 7.5,
      sleepDeep: 1.2,
      sleepREM: 1.6,
      sleepCore: 4.2,
      sleepBedtime: bed.toISOString(),
      sleepWakeTime: wake.toISOString(),
      steps: 9000,
      activeEnergy: 500,
      oxygenSaturation: 0.97,
    })
  }
  return out
}

function iso(daysAgo: number, hour: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

describe('buildContextSnapshot', () => {
  const daily = makeDaily(30)
  const intake: IntakeEvent[] = [
    { id: '1', ts: iso(1, 9), type: 'coffee', amount: 200, unit: 'мл', note: null },
    { id: '2', ts: iso(1, 13), type: 'meal', amount: null, unit: null, note: 'борщ', calories: 550, protein_g: 25, carbs_g: 60, fat_g: 20 },
    { id: '3', ts: iso(2, 19), type: 'meal', amount: null, unit: null, note: 'ужин', calories: 700 },
  ]

  const snapshot = buildContextSnapshot(
    daily, 30, 'Ферритин: 40 нг/мл', intake, 'Магний 400мг: принято 25/30 дней (83%)',
    [], '2026-07-01: тяжёлый день [самочувствие 2/5]', 'Бессонница [active]', 'выпадение 2/5',
    'Цель: сон 7.5ч', 'Всего встреч за 30 дн: 12',
  )

  it('содержит оценки готовности и персональную норму', () => {
    expect(snapshot).toContain('Готовность')
    expect(snapshot).toContain('Персональная норма (30 дней)')
    expect(snapshot).toMatch(/HRV ~\d+мс/)
  })

  it('содержит метрики: пульс, HRV, сон с фазами и временем, шаги, SpO₂', () => {
    expect(snapshot).toContain('Пульс покоя')
    expect(snapshot).toContain('HRV: среднее')
    expect(snapshot).toContain('Глубокий сон')
    expect(snapshot).toContain('Среднее время засыпания')
    expect(snapshot).toContain('Сон по ночам (последние 7)')
    expect(snapshot).toContain('Шаги: среднее')
    expect(snapshot).toContain('SpO₂: среднее 97.0%')
  })

  it('содержит быстрый лог с калориями еды и суточными итогами', () => {
    expect(snapshot).toContain('=== БЫСТРЫЙ ЛОГ')
    expect(snapshot).toContain('Кофе: 1 раз')
    expect(snapshot).toContain('≈550 ккал')
    expect(snapshot).toContain('Калории по дням (оценка):')
    expect(snapshot).toMatch(/~700 ккал/)
  })

  it('содержит все текстовые секции (профиль, препараты, анализы, заметки, проблемы, волосы, календарь)', () => {
    expect(snapshot).toContain('=== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ')
    expect(snapshot).toContain('Цель: сон 7.5ч')
    expect(snapshot).toContain('=== ПРЕПАРАТЫ И ДОБАВКИ ===')
    expect(snapshot).toContain('Магний 400мг')
    expect(snapshot).toContain('=== РЕЗУЛЬТАТЫ АНАЛИЗОВ ===')
    expect(snapshot).toContain('Ферритин')
    expect(snapshot).toContain('=== ЗАМЕТКИ ДНЯ')
    expect(snapshot).toContain('самочувствие 2/5')
    expect(snapshot).toContain('=== ПРОБЛЕМЫ И СИМПТОМЫ ===')
    expect(snapshot).toContain('Бессонница')
    expect(snapshot).toContain('=== ВОЛОСЫ ===')
    expect(snapshot).toContain('=== КАЛЕНДАРЬ')
  })

  it('содержит понедельную разбивку при ≥14 днях', () => {
    expect(snapshot).toContain('=== ПОНЕДЕЛЬНАЯ РАЗБИВКА ===')
    expect(snapshot).toContain('Последняя неделя')
  })

  it('без данных возвращает заглушку', () => {
    expect(buildContextSnapshot([], 30)).toBe('Данных нет.')
  })
})
