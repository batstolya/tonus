import { describe, expect, it } from 'vitest'
import {
  SUM_QUANTITIES,
  AVERAGE_QUANTITIES,
  SLEEP_CATEGORY,
  HEALTH_READ_TYPES,
} from './healthMetrics'
import { METRIC_MAP, SUM_METRICS } from '../../../supabase/functions/_shared/hae.ts'

// Сторож против тихой потери данных: если имя метрики разойдётся с серверной
// таблицей, ingest-health молча выбросит её — без ошибки, без записи в лог, без
// единого красного теста. Поэтому сверяем с настоящим METRIC_MAP, а не с копией.
describe('health metric mapping', () => {
  it('uses only metric names the server understands', () => {
    const unknown = [...SUM_QUANTITIES, ...AVERAGE_QUANTITIES]
      .map(q => q.hae)
      .filter(name => !(name in METRIC_MAP))
    expect(unknown, 'сервер молча игнорирует незнакомые имена метрик').toEqual([])
  })

  it('sends as sums exactly what the server dedups as sums', () => {
    // Метрика-сумма, отправленная как среднее (и наоборот), доедет до базы с
    // неверным полем: сервер решает по своему SUM_METRICS, а не по нашему.
    for (const q of SUM_QUANTITIES) {
      expect(SUM_METRICS.has(METRIC_MAP[q.hae]), `${q.hae} должен быть суммой`).toBe(true)
    }
    for (const q of AVERAGE_QUANTITIES) {
      expect(SUM_METRICS.has(METRIC_MAP[q.hae]), `${q.hae} должен быть средним`).toBe(false)
    }
  })

  it('asks permission for every type it intends to read, and nothing else', () => {
    expect(HEALTH_READ_TYPES).toHaveLength(SUM_QUANTITIES.length + AVERAGE_QUANTITIES.length + 1)
    expect(HEALTH_READ_TYPES).toContain(SLEEP_CATEGORY)
    // Просить лишнее — значит показывать пользователю разрешения, которыми мы
    // не пользуемся; это первый экран, который он видит, и он про доверие.
    expect(new Set(HEALTH_READ_TYPES).size).toBe(HEALTH_READ_TYPES.length)
  })

  it('names HealthKit identifiers, not guesses', () => {
    for (const type of HEALTH_READ_TYPES) {
      expect(type).toMatch(/^HK(Quantity|Category)TypeIdentifier[A-Z]/)
    }
  })

  it('declares the units the server heuristics expect', () => {
    const all = [...SUM_QUANTITIES, ...AVERAGE_QUANTITIES]
    const hae = Object.fromEntries(all.map(q => [q.hae, q.haeUnit]))
    // Метры делятся на 1000 выше 100, кДж конвертируются по units, сатурация
    // выше 1.5 делится на 100 — километры, ккал и доля оставляют всё холостым.
    expect(hae.distance_walking_running).toBe('km')
    expect(hae.active_energy).toBe('kcal')
    expect(hae.blood_oxygen_saturation).toBe('fraction')
  })

  it('never asks HealthKit for a unit it does not know', () => {
    // 'fraction' — наша серверная единица, а не HKUnit. Отправленная в запрос,
    // она валит чтение в рантайме: «Supplied invalid 'fraction' as HKUnit».
    // Поймано только запуском на симуляторе, поэтому теперь есть тест.
    const SERVER_ONLY = new Set(['fraction'])
    for (const q of [...SUM_QUANTITIES, ...AVERAGE_QUANTITIES]) {
      expect(SERVER_ONLY.has(q.hkUnit), `${q.hae}: ${q.hkUnit} — не HKUnit`).toBe(false)
    }
  })

  it('carries a conversion wherever the two units disagree', () => {
    for (const q of [...SUM_QUANTITIES, ...AVERAGE_QUANTITIES]) {
      if (q.hkUnit === q.haeUnit) expect(q.toHae ?? 1).toBe(1)
      else expect(q.toHae, `${q.hae}: единицы разные, множитель обязателен`).toBeDefined()
    }
  })
})
