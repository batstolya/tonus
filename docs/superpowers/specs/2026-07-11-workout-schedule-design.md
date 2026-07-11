# Tonus — дизайн: расписание тренировок (план, умное уведомление, план-vs-факт)

Дата: 2026-07-11. Статус: одобрен (brainstorming с владельцем).

## 0. Цель

Пользователь фиксирует недельное расписание тренировок (например Пн/Ср/Пт 19:00).
Система: (1) шлёт умное Telegram-уведомление за N часов (default 4) с учётом
готовности; (2) автоматически считает план-vs-факт по Apple Health;
(3) отдаёт это знание AI-чату/коучу, отчётам и виджету на главной.

Решения из brainstorming: расписание **фиксированное, одно время на все дни**;
уведомление **умное** (readiness из daily_scores); факт **авто** (без кнопок
и ручных отметок); поверхности — **AI-контекст, отчёты, виджет** (корреляции
— вне scope).

## 1. Схема данных

Append-only миграция `workout_schedule`:

```sql
create table if not exists workout_schedule (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekdays int[] not null default '{}',        -- 1=Пн … 7=Вс (как reminder_settings)
  time text not null default '19:00',          -- локальное HH:MM
  notify_hours_before int not null default 4,
  timezone text not null default 'Europe/Kyiv',
  enabled boolean not null default true,
  last_notified_date date,                     -- дедуп уведомления (паттерн daily_note_settings)
  created_at timestamptz default now()
);
alter table workout_schedule enable row level security;
-- policy "own" (auth.uid() = user_id), идемпотентно через DO-блок
```

Одна строка на пользователя (фиксированное расписание). Никаких event-таблиц:
уведомление информационное, дедуп полем `last_notified_date` достаточен
(не нужна claim-механика лекарств).

## 2. Уведомление (send-reminders, новый блок)

На каждом 5-мин тике, по образцу блока «утренняя сводка» (per-user timezone):

1. `select * from workout_schedule where enabled = true`;
2. `localNow(tz)`: если weekday ∉ weekdays → skip; если `last_notified_date = dateStr` → skip;
3. окно: `timeDue(shiftTime(time, -notify_hours_before), hhmm)` — хелпер
   `shiftTime` (чистый, `_shared/workoutPlan.ts`) вычитает часы по модулю суток.
   Если `time − N ч` уходит на вчера (тренировка в 02:00) — уведомление в тот же
   календарный день в 00:00 (не шлём накануне; edge-case задокументирован);
4. текст по сегодняшнему `daily_scores` (readiness + hrv/hrv_baseline):
   - readiness ≥ 75 → «🏋️ Сегодня тренировка в 19:00. Готовность 82 — можно выкладываться 💪»
   - readiness < 60 **или** hrv < 0.9×hrv_baseline → «🏋️ Сегодня тренировка в 19:00. Готовность 54, восстановление ниже твоей нормы — сегодня лучше полегче»
   - иначе / нет данных → «🏋️ Сегодня тренировка в 19:00»
   Выбор текста — чистая функция `workoutNotificationText(schedule, scores)`;
5. `tgSend` → `update workout_schedule set last_notified_date = dateStr`.
   Порядок как в morning summary: send → mark (редкий дубль при падении между
   ними приемлем для информационного сообщения);
6. счётчик `workoutNoticesSent` в structured result.

## 3. План-vs-факт

`supabase/functions/_shared/workoutPlan.ts` (чистый, vitest) + реэкспорт/копия
для фронта в `src/lib/workoutPlan.ts` (по паттерну scores: два зеркала, править
синхронно):

- `plannedDaysInRange(weekdays, fromDate, toDate, tz): string[]` — список
  YYYY-MM-DD плановых дней (только прошедшие и сегодня);
- `isWorkoutDone(date, exerciseMinutesByDay, workoutEventDays): boolean` —
  факт = `exerciseMinutes ≥ 30` (порог стрика) ИЛИ workout в `intake_events`;
- `attendance(planned, doneDays): { done: number; total: number }`.

Будущие плановые дни в attendance не входят (не «пропущены заранее»).

## 4. Поверхности

- **AI-контекст** (`_shared/healthContext.ts`, server-side only): секция
  «Тренировки: план Пн/Ср/Пт 19:00; эта неделя 2 из 3; сегодня плановая в 19:00»
  (или «сегодня отдых»). Чат, коуч-weekly и nudges получают автоматически.
- **Двухнедельный отчёт** (`biweekly-report`): строка «Тренировки: 5 из 6 по плану».
- **Виджет на главной** (`src/components/dashboard/`): карточка «Следующая:
  Ср 19:00 (через 2 дня)» + «Месяц: 10 из 12 по плану». Скрыта, если расписание
  не задано/выключено. Демо-фикстура для VITE_DEMO.
- **Настройки** (`src/components/settings/`): карточка рядом с напоминаниями —
  чекбоксы дней, время, «за N часов», вкл/выкл. Переводы uk/en по паттерну i18n.

## 5. Тесты

- `workoutPlan.test.ts`: plannedDaysInRange через границы недели/месяца и tz;
  attendance с will-be днями; isWorkoutDone (порог 30, intake fallback);
  shiftTime (19:00−4=15:00, 02:00−4=00:00 clamp);
- `workoutNotificationText`: три ветки текста, отсутствие daily_scores;
- переводы: покрытие ключей (паттерн TelegramDemo.test.ts).

## 6. Вне scope

- Плавающее расписание и разное время по дням (schema позволяет добавить позже);
- кнопки «пойду/перенесу», ручные отметки;
- корреляции «тренировка → сон/HRV»;
- пуш-каналы кроме Telegram.

## 7. Rollout

Миграция → деплой `send-reminders` (+`biweekly-report`, `chat-health`* если
задет healthContext — см. skill working-on-ai-chat) → фронт через CI. Cron уже
защищён и работает; новый блок подхватится существующим тиком.
*точный список функций, шарящих healthContext, уточняется в плане.
