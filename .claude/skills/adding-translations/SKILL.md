---
name: adding-translations
description: Use when adding user-facing text, new UI strings, or fixing missing uk/en translations in the Tonus app
---

# Переводы (i18n) в Tonus

## Устройство

- Ключ перевода — **русский исходный текст**. Компонент: `const { t } = useT()`
  (из `src/lib/i18n.tsx`) → `t('Русский текст')`.
- Словарь разбит по доменам в `src/lib/translations/` (common, dashboard,
  settings, health, metrics, ai-insights, onboarding, landing); `index.ts`
  сливает части в один `translations`. Запись — в подходящий доменный файл:
  ```ts
  'Русский текст': { uk: 'Український', en: 'English' },
  ```
- Нет ключа в словаре → UI показывает русский исходник (fallback).
- Языки в UI: **uk / en**. Русский скрыт из переключателя (только fallback),
  не добавляй его обратно.
- Плейсхолдеры — `{n}` внутри строки: `'Добавлено {n} новых дней'`.

## Порядок добавления строки

1. В компоненте оберни строку: `t('Русский текст')`.
2. Добавь запись в подходящий доменный файл `src/lib/translations/<домен>.ts`
   (common/dashboard/settings/health/metrics/ai-insights/onboarding/landing).
3. Если строка на видном экране — добавь ключ в coverage-тест экрана (см. ниже).
4. `npm test` (Node 24).

## Coverage-тест (обязателен для видных экранов)

Окружение тестов — **node**, рендера компонентов нет. Поэтому паттерн —
массив ключей + проверка словаря (пример: `src/components/auth/TelegramDemo.test.ts`):

```ts
const KEYS = ['Строка 1', 'Строка 2']
it('has uk + en translations for every string', () => {
  for (const key of KEYS) {
    const entry = translations[key]
    expect(entry, `missing translation for "${key}"`).toBeDefined()
    expect(entry.uk).toBeTruthy()
    expect(entry.en).toBeTruthy()
  }
})
```

Существующие тесты этого паттерна: `Landing.test.ts`, `liveDemo.test.ts`,
`TelegramDemo.test.ts`, `supplementSchedule.test.ts`.

## Частые ошибки

- Добавить строку в компонент без записи в словарь → uk/en-пользователи видят русский.
- Ключ в тесте не 1-в-1 со строкой в компоненте (лишний пробел, эмодзи) → тест
  проверяет не то.
- Переводить украинский калькой с русского — проверяй естественность.
