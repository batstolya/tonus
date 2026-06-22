import { describe, it, expect } from 'vitest'
import { readinessVerdict, type ReadinessScore } from './readiness'

function make(partial: Partial<ReadinessScore>): ReadinessScore {
  return {
    score: 0, label: 'Средняя', color: '',
    components: { hrv: null, rhr: null, sleep: null },
    baseline: { hrv: null, rhr: null, sleep: null },
    today: { hrv: null, rhr: null, sleep: null },
    ...partial,
  }
}

describe('readinessVerdict', () => {
  it('maps each band to its sentence key', () => {
    expect(readinessVerdict(make({ label: 'Отличная', components: { hrv: 38, rhr: 20, sleep: 22 } })).bandKey)
      .toBe('Организм отлично восстановился — хороший день для нагрузки и важных дел.')
    expect(readinessVerdict(make({ label: 'Хорошая', components: { hrv: 30, rhr: 20, sleep: 20 } })).bandKey)
      .toBe('Ты в хорошей форме — можно работать в обычном ритме.')
    expect(readinessVerdict(make({ label: 'Средняя', components: { hrv: 20, rhr: 15, sleep: 15 } })).bandKey)
      .toBe('Восстановление неполное — лучше умеренная нагрузка и лечь пораньше.')
    expect(readinessVerdict(make({ label: 'Низкая', components: { hrv: 10, rhr: 8, sleep: 6 } })).bandKey)
      .toBe('Организм не восстановился — сегодня отдых, без перегрузок.')
  })

  it('good band: names the strongest component as a positive driver', () => {
    // hrv 38/40=.95 is the top contributor
    const v = readinessVerdict(make({ label: 'Отличная', components: { hrv: 38, rhr: 20, sleep: 22 } }))
    expect(v.driverKey).toBe('Главный плюс — высокое восстановление')
  })

  it('weak band: names the weakest component as a negative driver', () => {
    // sleep 6/30=.2 is the worst contributor
    const v = readinessVerdict(make({ label: 'Низкая', components: { hrv: 20, rhr: 18, sleep: 6 } }))
    expect(v.driverKey).toBe('Слабое место — нехватка сна')
  })

  it('good band with low resting-pulse score names resting pulse', () => {
    // rhr 28/30=.933 beats sleep 10/30=.333; hrv null is excluded
    const v = readinessVerdict(make({ label: 'Хорошая', components: { hrv: null, rhr: 28, sleep: 10 } }))
    expect(v.driverKey).toBe('Главный плюс — низкий пульс покоя')
  })

  it('omits the driver clause when no component scores exist', () => {
    const v = readinessVerdict(make({ label: 'Средняя', components: { hrv: null, rhr: null, sleep: null } }))
    expect(v.driverKey).toBeNull()
  })
})
