// Перевод по русскому ключу — без React, поэтому им можно пользоваться из
// обычных модулей (демо-стор отдаёт фикстуры уже на языке интерфейса).
// i18n.tsx строит поверх этого хук useT; файл отдельный, чтобы i18n.tsx
// экспортировал только React-сущности (react-refresh/only-export-components).
import { translations } from './translations'

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
  // Вне браузера (тесты в node-проекте vitest) window-API нет — не падаем.
  if (typeof localStorage === 'undefined') return 'en'
  const saved = localStorage.getItem('lang') as Lang | null
  // 'ru' больше не выбирается — старое сохранённое значение трактуем как English.
  if (saved === 'uk' || saved === 'en') return saved
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en'
  if (nav === 'uk') return 'uk'
  return 'en'
}

// Если перевода нет — возвращает русский исходник.
export function translate(ru: string, lang: Lang): string {
  if (lang === 'ru') return ru
  return translations[ru]?.[lang] ?? ru
}

// Перевод вне React: язык берём из того же localStorage, что и провайдер,
// поэтому они не расходятся.
export function translateStandalone(ru: string): string {
  return translate(ru, detectLang())
}
