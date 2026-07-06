import { describe, it, expect } from 'vitest'
import { ConnectGuide } from './ConnectGuide'
import { translations } from '../../lib/translations'

// Ключи всех шагов гайда: пополняется в задачах 4-6.
// Должны иметь uk/en, чтобы в гайд не протекал русский.
export const GUIDE_KEYS = [
  'Пропустить',
  'Далее',
  'Данные будут приходить сами',
  'Часы → телефон → Tonus. Один раз настроим — дальше всё автоматически, каждый день.',
  // Task 4 — ветка Apple
  'Установи Health Auto Export',
  'Это приложение само отправляет данные Apple Health в Tonus. Есть бесплатный пробный период — хватит, чтобы всё проверить.',
  'Открыть в App Store',
  'Создай автоматизацию',
  'В Health Auto Export открой вкладку Automations и нажми «+».',
  'Automations → «+»',
  'Тип: REST API',
  'Метод POST · Формат JSON',
  'Вставь адрес Tonus',
  'Скопируй персональную ссылку и вставь её в поле URL автоматизации.',
  'Выбери данные и расписание',
  'Включи все метрики здоровья и сон',
  'Интервал — каждые 1-3 часа',
  'Не забудь включить автоматизацию (Enable)',
  'Не удалось получить ссылку',
  'Повторить',
  // Task 5 — проверка связи
  'Проверим связь',
  'Открой Health Auto Export и нажми Manual Export — мы ждём данные.',
  'Слушаем эфир…',
  'Данные пришли!',
  'Первые графики появятся после следующей синхронизации.',
  'В приложение',
  'Пока ничего не пришло. Проверь:',
  'URL вставлен целиком, вместе с token=',
  'Метод — POST, формат — JSON',
  'Автоматизация включена (Enable)',
  'Проверить ещё раз',
  // Task 6 — ветка Xiaomi
  'Какой у тебя телефон?',
  'Разовый импорт CSV',
  'Включи синк с Apple Health',
  'В Mi Fitness: Профиль → Настройки → Apple Health → разреши запись данных. Дальше настроим как для Apple Watch.',
  'Авто-синхронизация для Android скоро',
  'Пока используй разовый импорт CSV с account.xiaomi.com — мы сообщим, когда авто-синк будет готов.',
  'Профиль',
]

describe('ConnectGuide', () => {
  it('exports a component', () => {
    expect(typeof ConnectGuide).toBe('function')
  })

  it('has uk + en translations for every guide string', () => {
    for (const key of GUIDE_KEYS) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
