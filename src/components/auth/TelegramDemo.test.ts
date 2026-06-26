import { describe, it, expect } from 'vitest'
import TelegramDemo from './TelegramDemo'
import { translations } from '../../lib/translations'

// Representative strings from each scene + the carousel chrome. They must stay
// translated so uk/en users don't see Russian leaking into the demo.
const DEMO_KEYS = [
  'Демо Telegram-бота Tonus',
  'Сцена',
  'Сообщение…',
  // Scene 1
  'Привет! 👋 Отправь что-нибудь интересное',
  '✅ Записал!',
  '95 мг кофеина',
  // Scene 2
  'Покажи, что ты ешь 🍽️',
  '🔍 Я вижу:',
  '✅ Сохранено в дневник питания',
  // Scene 3
  '🧠 Я нашёл 3 закономерности:',
  '→ HRV падает на 15%',
  '💡 Совет: ложись спать на 20 минут раньше',
  'ДА',
]

describe('TelegramDemo', () => {
  it('exports a component', () => {
    expect(typeof TelegramDemo).toBe('function')
  })

  it('has uk + en translations for every demo string', () => {
    for (const key of DEMO_KEYS) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
