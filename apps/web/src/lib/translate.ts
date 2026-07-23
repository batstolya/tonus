// Перевод по русскому ключу — без React, поэтому им можно пользоваться из
// обычных модулей (демо-стор отдаёт фикстуры уже на языке интерфейса).
// i18n.tsx строит поверх этого хук useT; файл отдельный, чтобы i18n.tsx
// экспортировал только React-сущности (react-refresh/only-export-components).
import { translations } from './translations'
import { persistentStorage, getDeviceLocale } from './platform'

export type Lang = 'ru' | 'uk' | 'en'

// Русский скрыт из выбора: остаётся внутренним fallback'ом для непереведённых
// строк. Пользователю доступны украинский и английский.
export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
]

// BCP-47 локаль для форматирования дат/чисел, соответствующая языку интерфейса.
export const LOCALES: Record<Lang, string> = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-GB' }

export function detectLang(): Lang {
  const saved = persistentStorage.get('lang') as Lang | null
  // 'ru' is no longer selectable — a legacy saved value is treated as English.
  if (saved === 'uk' || saved === 'en') return saved
  const nav = getDeviceLocale().slice(0, 2)
  if (nav === 'uk') return 'uk'
  return 'en'
}

// Если перевода нет — возвращает русский исходник.
export function translate(ru: string, lang: Lang): string {
  if (lang === 'ru') return ru
  return translations[ru]?.[lang] ?? ru
}

// Translation outside React: the language comes from the same persistent
// storage the provider writes, so the two never diverge.
export function translateStandalone(ru: string): string {
  return translate(ru, detectLang())
}
