import { describe, it, expect } from 'vitest'
import { DEMO_TABS, TAB_LABELS, prepareLiveDemoData } from './liveDemo.logic'
import { makeDemoDaily } from '../../lib/demoFixture'
import { translations } from '../../lib/translations'

describe('liveDemo.logic', () => {
  it('объявляет 4 таба с переводами uk/en', () => {
    expect(DEMO_TABS).toEqual(['readiness', 'sleep', 'heart', 'insights'])
    for (const tab of DEMO_TABS) {
      const label = TAB_LABELS[tab]
      expect(label).toBeTruthy()
      const entry = translations[label]
      expect(entry, `missing translation for "${label}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })

  it('готовит данные: скор 0..100 и 14 дней рядов', () => {
    const data = prepareLiveDemoData(makeDemoDaily(90))
    expect(data.score.readiness).toBeGreaterThan(0)
    expect(data.score.readiness).toBeLessThanOrEqual(100)
    expect(data.sleep14).toHaveLength(14)
    expect(data.heart14).toHaveLength(14)
    // ряды подписаны короткой датой MM-DD и содержат числа
    expect(data.sleep14[0].date).toMatch(/^\d{2}-\d{2}$/)
    expect(typeof data.heart14[0].resting).toBe('number')
  })
})
