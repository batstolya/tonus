# Tonus — ТЗ: ИИ «Идеальное время приёма добавок»

> [!CAUTION]
> Historical execution record. Do not run deployment commands from this file.
> Use `docs/guides/edge-function-deployments.md` and `npm run deploy:functions`.

## 0. Цель

На странице «Препараты и добавки» (`SupplementsScreen`) добавить ИИ-функцию,
которая подбирает **оптимальное расписание приёма всего стека** добавок с учётом
возраста и пола пользователя, фармакологии добавок, взаимодействий между ними и
режима сна. Результат показывается карточкой и одной кнопкой применяется к
существующим напоминаниям.

## 1. Контекст

- Страница: [src/components/supplements/SupplementsScreen.tsx](../../../src/components/supplements/SupplementsScreen.tsx).
  Хранит добавки (`name`/`default_dose`/`unit`), логи приёма и напоминания
  (`reminder_settings`, Telegram).
- Данные: [src/lib/supplements.ts](../../../src/lib/supplements.ts) —
  `loadSupplements`, `saveReminder` и т.д.
- ИИ-паттерн: edge-функция → Gemini 2.5 Flash, с cost-guard и логом `ai_usage`.
  Образец — [supabase/functions/generate-recommendations/index.ts](../../../supabase/functions/generate-recommendations/index.ts).
  Вызов с фронта — `callFunction` ([src/lib/edgeFunctions.ts](../../../src/lib/edgeFunctions.ts)).
- Профиль (`profiles`) хранит `timezone`, `ai_budget_usd`, координаты — но **не
  хранит возраст/пол**. Их нужно добавить.

## 2. Решения (зафиксированы)

- Возраст: добавляем `birth_year` + `sex` в `profiles`; спрашиваем один раз.
- ИИ выдаёт **расписание всего стека** (учёт интервалов/взаимодействий).
- Результат: **показать + применить к напоминаниям** (система напоминаний уже есть).

## 3. Профиль: возраст и пол

- Миграция `supabase/supplements_profile_age.sql`:
  `alter table profiles add column if not exists birth_year int;`
  `alter table profiles add column if not exists sex text;` + `notify pgrst`.
- `lib/supplements.ts`: `loadProfileBasics(userId)` → `{ birth_year, sex }` и
  `saveProfileBasics(userId, patch)`.
- На странице — мини-форма (год рождения + пол М/Ж/—), всплывает при первом
  нажатии кнопки ИИ, если поля пустые. Сохраняется в `profiles`, редактируема.
- Деградация при отсутствии колонки — баннер «запусти SQL» (как у `stock_count`).

## 4. Edge-функция `supplement-schedule`

Зеркалит `generate-recommendations`:

- Auth → `getUser`; cost-guard `checkBudget`; при превышении — 402.
- Собирает на сервере: активный стек (`supplements`), `birth_year`→возраст и
  `sex` из `profiles`, типичные время подъёма/отбоя (среднее по последним
  `sleep_sessions`), как опорные точки дня.
- Промпт: «фармакологически грамотный ассистент; по стеку + возраст/пол + режим
  сна составь оптимальный дневной план приёма; учитывай взаимодействия (кальций/
  железо врозь, магний на ночь, жирорастворимые с едой и т.д.)».
- `responseMimeType: application/json`, `temperature: 0.3`, `thinkingBudget: 0`.
- Строгий JSON ответа:
  ```json
  {
    "slots": [
      { "time": "08:00", "label": "Утро, с завтраком",
        "items": [ { "supplement": "Витамин D", "reason": "жирорастворимый — с едой" } ] }
    ],
    "notes": "общие предостережения и взаимодействия",
    "disclaimer": "Не является медицинским советом."
  }
  ```
- Лог `ai_usage` (`source: 'supplement-schedule'`).

## 5. Чистая логика — `lib/supplementSchedule.ts`

- Типы `Slot`, `ScheduleItem`, `Schedule`.
- `parseSchedule(raw: unknown): Schedule | null` — валидирует/чистит ответ ИИ
  (отбрасывает мусор, проверяет `HH:MM`, непустые слоты).
- `scheduleToReminderTimes(schedule): Record<supplementName, string[]>` — собирает
  для каждой добавки список времён из слотов (для применения к напоминаниям).
- `callSupplementSchedule(body)` — обёртка над `callFunction('supplement-schedule')`.

## 6. UI на `SupplementsScreen`

Новая карточка «🕐 Идеальное время приёма» с кнопкой «Подобрать (ИИ)»:

- Нет добавок → кнопка скрыта/подсказка.
- Нет возраста/пола → мини-форма (см. §3), затем запуск.
- Загрузка → спиннер; ошибка/бюджет → понятное сообщение.
- Результат: список слотов (время → подпись → добавки с одной строкой «почему»),
  блок `notes`, медицинский `disclaimer`.
- Кнопка «Применить к напоминаниям» → для каждой добавки пишет рекомендованные
  времена в `reminder_settings` через `saveReminder` (сопоставление по имени;
  добавки без совпадения пропускаются). Тост/подтверждение применения.
- Результат живёт в state экрана (перегенерация по кнопке) — отдельной таблицы
  истории нет; единственное, что стоит хранить (времена напоминаний), уже имеет БД.

## 7. i18n

Все видимые строки через `t()` (ru по умолчанию, uk/en) — добавить в
`src/lib/translations.ts`.

## 8. Тестирование (node-окружение)

- `parseSchedule` — юнит: валидный ответ, мусор, обрезанный JSON, плохое время.
- `scheduleToReminderTimes` — юнит: корректное сопоставление имя→времена, дедуп.
- Компонент — экспорт + покрытие переводов (паттерн `TelegramDemo.test.ts`).

## 9. Вне рамок (YAGNI)

- Своя база лекарств/БАД — только знания модели.
- Таблица истории расписаний.
- Автоприменение без подтверждения пользователя.
- Полный редизайн настроек профиля — возраст/пол собираем инлайн.
- Медицинские дозировки/диагнозы — функция только про **время**, с дисклеймером.

## 10. Деплой

- Миграция: `supabase/supplements_profile_age.sql` — выполнить в SQL Editor.
- Функция: `npx supabase functions deploy supplement-schedule --project-ref <ref>`.
- Фронт — авто-деплой Vercel при push в `main`.
