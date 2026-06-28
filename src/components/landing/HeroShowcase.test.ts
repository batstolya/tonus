import { describe, it, expect } from 'vitest'
import HeroShowcase from './HeroShowcase'
import { nextMode, MODES } from './heroShowcase.logic'
import { translations } from '../../lib/translations'

// Visible strings in the showcase — must stay translated so uk/en visitors
// don't see Russian leaking into the hero.
const SHOWCASE_KEYS = [
  'Анимация: данные с Apple Watch оживают на сайте',
  'Превращение',
  'Поток + Telegram',
  'Готовность',
  'Инсайт',
  'уд/мин',
]

describe('HeroShowcase', () => {
  it('exports a component', () => {
    expect(typeof HeroShowcase).toBe('function')
  })

  it('nextMode toggles between the two scenes and is stable', () => {
    expect(nextMode('morph')).toBe('flow')
    expect(nextMode('flow')).toBe('morph')
    expect(nextMode(nextMode('morph'))).toBe('morph')
    expect(MODES).toEqual(['morph', 'flow'])
  })

  it('has uk + en translations for every showcase string', () => {
    for (const key of SHOWCASE_KEYS) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
