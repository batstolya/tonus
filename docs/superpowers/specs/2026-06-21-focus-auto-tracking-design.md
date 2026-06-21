# Дизайн: авто-трекинг «Фокуса недели» по данным

Дата: 2026-06-21
Статус: утверждён, готов к плану реализации

## Зачем

Сейчас «Фокус недели» (`coach_profile.focus = {text, set_at}`) — это одна привычка,
которую ИИ-коуч ставит на неделю, а отметки выполнения **ручные**: пользователь
тапает «Отметить сегодня», что вставляет `coach_events(type=focus_checkin)`, и
карточка показывает «N из 7 дней».

Проблема: тапать вручную лень и легко забыть, а данные о поведении и так уже есть
в системе (шаги, сон, время отбоя, события кофе/алкоголь/тренировка/еда,
самочувствие). Цель — чтобы система **сама смотрела в данные**, понимала, выполнен
ли фокус в каждый день, и показывала «N/7» автоматически, ретроспективно.

## Решение (одной фразой)

ИИ-коуч вместе с текстом фокуса выдаёт **машинно-проверяемое условие** (`check`),
а клиент детерминированно считает выполнение из уже загруженных данных. Ручная
отметка остаётся **fallback** для редких расплывчатых целей, которые нельзя
выразить через данные.

Архитектурный принцип (как в research/levers): расчёт на клиенте, без токенов на
каждый день, предсказуемо. ИИ участвует только раз в неделю при постановке фокуса.

## Не-цели (вне этой спеки)

- **Ручной override авто-вердикта** (отметить день вручную, если поведение не
  залогано). Вместо этого показываем точки по дням — видно, какие дни зачлись.
- **Разовый парс уже стоящего фокуса** в `check`. Текущий фокус доживёт в ручном
  режиме до следующего прогона `coach-weekly` (в течение недели).
- Миграция БД — не нужна (`coach_profile.focus` уже `jsonb`).

---

## Часть 1. Модель данных

`coach_profile.focus` (jsonb) расширяется новым опциональным полем `check`:

```ts
// src/lib/coach.ts
export interface CoachFocus {
  text: string
  set_at: string
  check?: FocusCheck | null
}

export interface FocusCheck {
  predicate: DayPredicate   // проверяемое условие на ОДИН день
  target?: number           // задан → цель-частота (знаменатель = target); иначе ежедневная (=7)
  label?: string            // человекочитаемо, напр. «≥3 приёма пищи»
}

export type DayPredicate =
  | { kind: 'steps_gte'; value: number }
  | { kind: 'sleep_hours_gte'; value: number }
  | { kind: 'bedtime_before'; time: string }                  // "HH:MM"
  | { kind: 'meals_gte'; value: number }
  | { kind: 'event_count_lte'; event: string; value: number }
  | { kind: 'event_absent_after'; event: string; time: string }
  | { kind: 'event_present'; event: string }
  | { kind: 'event_absent'; event: string }
  | { kind: 'wellbeing_gte'; value: number }
```

`event` — один из типов `intake_events`: `coffee | alcohol | meal | water | meds |
workout | illness | stress | travel | custom`.

Существующие фокусы без `check` → `check` отсутствует → ручной режim.

---

## Часть 2. Движок выполнения — `src/lib/focusAdherence.ts`

Чистая функция, тестируется vitest без БД.

```ts
import type { DailyMetrics } from '../types'
import type { FocusCheck, DayPredicate } from './coach'

export interface FocusProgress {
  daysMet: number
  denom: number                       // 7 для daily, target для weekly
  mode: 'daily' | 'weekly'
  done: boolean                       // daily: всегда false (счётчик); weekly: daysMet >= target
  perDay: { date: string; met: boolean; future: boolean }[]
}

export interface FocusData {
  daily: DailyMetrics[]               // у строки есть date, steps, sleepHours, sleepBedtime, activeEnergy
  intake: { ts: string; type: string }[]
  wellbeingByDate: Record<string, number>
}

export function evaluateFocus(check: FocusCheck, setAt: string, data: FocusData): FocusProgress
```

**Окно:** даты от `set_at` (его дата) до сегодня включительно, максимум 7 дней.
Для каждого дня вычисляется предикат. Будущие дни недели (если фокус стоит < 7
дней) в `perDay` помечаются `future:true` и `met:false`.

**Семантика предикатов (по локальной дате/времени браузера):**

| kind | true когда |
|---|---|
| `steps_gte` | `daily[date].steps >= value` |
| `sleep_hours_gte` | `daily[date].sleepHours >= value` |
| `bedtime_before` | `daily[date].sleepBedtime` ≤ `time` (вечер-якорь, см. ниже) |
| `meals_gte` | число `intake` событий `type='meal'` за дату `>= value` |
| `event_count_lte` | число событий `type=event` за дату `<= value` |
| `event_absent_after` | нет события `type=event` за дату позже `time` |
| `event_present` | ≥1 событие `type=event` за дату |
| `event_absent` | 0 событий `type=event` за дату |
| `wellbeing_gte` | `wellbeingByDate[date] >= value` |

**Вечер-якорь для времени отбоя:** время отбоя около полуночи. Переводим `bedtime`
в минуты от 00:00; если `< 720` (раньше 12:00) — считаем это «следующим днём»,
добавляем 1440. Так же нормализуем `time` цели. Тогда «лечь до 23:00» (1380):
22:30→1350 ✓, 23:30→1410 ✗, 00:30→1470 ✗. Аналогичный сдвиг применяется в
`event_absent_after` только если порог `time < 12:00` (иначе обычное сравнение часов).

**День без нужных данных = не выполнено** (напр. ни одного `meal`-события →
`meals_gte` ложно). Это корректно: нет данных = цель за день не подтверждена.

**Подсчёт:**
- `daily` (нет `target`): `daysMet` = число выполненных дней, `denom = 7`,
  `done = false` (это прогресс-счётчик за неделю).
- `weekly` (есть `target`): `daysMet` = число квалифицирующих дней, `denom = target`,
  `done = daysMet >= target`.

---

## Часть 3. `coach-weekly` — ИИ выдаёт условие

В промпте (после строки `FOCUS:`) добавляется требование второй строки `CHECK:` и
словарь допустимых предикатов с примерами. Фрагмент, добавляемый в конец промпта:

```
После FOCUS добавь ОТДЕЛЬНОЙ строкой машинное условие выполнения фокуса:
CHECK: <JSON или none>
JSON строго одной из форм (predicate — условие на ОДИН день; target — если цель «N раз в неделю»):
{"predicate":{"kind":"steps_gte","value":8000}}
{"predicate":{"kind":"sleep_hours_gte","value":7}}
{"predicate":{"kind":"bedtime_before","time":"23:00"}}
{"predicate":{"kind":"meals_gte","value":3}}
{"predicate":{"kind":"event_count_lte","event":"coffee","value":1}}
{"predicate":{"kind":"event_absent_after","event":"coffee","time":"16:00"}}
{"predicate":{"kind":"event_present","event":"workout"},"target":3}
{"predicate":{"kind":"event_absent","event":"alcohol"}}
{"predicate":{"kind":"wellbeing_gte","value":4}}
event ∈ coffee|alcohol|meal|water|meds|workout|illness|stress|travel.
Если фокус НЕЛЬЗЯ выразить этими формами — пиши CHECK: none. Не выдумывай поля.
```

Парсинг (после извлечения FOCUS):
1. `const checkMatch = text.match(/CHECK:\s*(.+)$/m)`; вырезать строку из `text`
   (как уже делается с FOCUS).
2. Если `none`/нет/не парсится JSON → `check = null`.
3. Иначе `JSON.parse` + **строгая валидация** хелпером `validateFocusCheck(obj)`:
   проверить `predicate.kind` ∈ известный набор, нужные поля присутствуют и нужного
   типа, `event` ∈ допустимых, `target` (если есть) — число 1..7. Невалидно → `null`.
4. Сохранить `focus: { text, set_at, check }`.

`validateFocusCheck` живёт в `src/lib/coach.ts` (чистая функция, переиспользуется
тестами); edge-функция дублирует её инлайн (Deno не импортит из src). Набор `kind`
и допустимых `event` — единый источник в спеке выше.

---

## Часть 4. Карточка `CoachFocusCard` (Dashboard.tsx)

Карточка получает новые пропсы `daily: DailyMetrics[]` и `events: IntakeEvent[]`
(оба уже есть в `Dashboard`), сама подгружает самочувствие за неделю из
`context_notes`.

**Ветвление:**
- **`focus.check` есть** → авто-режим:
  - `const p = evaluateFocus(focus.check, focus.set_at, {daily, intake, wellbeingByDate})`
  - Заголовок-счётчик: `p.mode==='weekly' ? \`${p.daysMet}/${p.denom} за неделю\` : \`${p.daysMet}/7\``
  - Ряд из 7 (или `denom`) точек: 🟢 `met`, ⚪ иначе/`future`.
  - Подпись «🔄 по данным» вместо кнопки. Тапа нет.
- **`focus.check` нет/`null`** → как сейчас: ручная кнопка «Отметить сегодня» +
  `checkInToday`/`loadCheckins` (существующий код не трогаем).

Самочувствие: `loadWellbeingByDate(userId, sinceDate)` — новый хелпер в `coach.ts`
или `contextNotes.ts`, селект `date, wellbeing` из `context_notes` за 7 дней,
вернуть `Record<date, number>`.

---

## Файлы

| Файл | Изменение |
|---|---|
| `src/lib/coach.ts` | `CoachFocus.check`, типы `FocusCheck`/`DayPredicate`, `validateFocusCheck`, `loadWellbeingByDate` |
| `src/lib/focusAdherence.ts` (новый) | `evaluateFocus` + типы |
| `src/lib/focusAdherence.test.ts` (новый) | тесты предикатов, daily/weekly, вечер-якорь, день без данных |
| `supabase/functions/coach-weekly/index.ts` | промпт + парс/валидация `CHECK:` |
| `src/components/dashboard/Dashboard.tsx` | `CoachFocusCard`: авто-режим + точки, проброс `daily`/`events`, загрузка wellbeing |
| `src/lib/translations.ts` | новые строки (RU ключ + uk/en) |

## Тестирование

- **`focusAdherence.test.ts`** — на синтетических данных: каждый `kind` предиката
  (true/false), `bedtime_before` с переходом через полночь, `event_absent_after`,
  daily vs weekly (`target`), день без данных = не выполнено, окно > 7 дней
  обрезается, будущие дни помечены `future`.
- **`validateFocusCheck`** — валидный JSON каждой формы проходит; мусор/неизвестный
  kind/битый event/`target` вне 1..7 → null.
- **coach-weekly** — ручная проверка: прогон ставит фокус с корректным `CHECK`;
  `none` → ручной режим.
- **UI** — ручная проверка (Node 18 не даёт vite-сборку локально): авто-счётчик и
  точки рисуются; `check=null` → ручная кнопка.

## Открытые вопросы

Нет блокирующих. Набор предикатов и пороги утверждены; расширяется добавлением
`kind` в `DayPredicate` + `evaluateFocus` + словарь промпта.
