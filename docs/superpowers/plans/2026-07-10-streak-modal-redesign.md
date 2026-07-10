# Streak Modal Redesign (mate-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Зібрати панель стріку в топбарі в одну mate-style картку: заголовок з лічильниками, календар з навігацією по місяцях і чекмарками тижнів, дві карточки статистики.

**Architecture:** Стан обраного місяця живе в `StreakMenu`; `ActivityCalendar` стає контрольованим (`year`/`month` пропси + `onNavigate`); `StreakStats` переписується у дві карточки. Нова функція `getWeeklyRecord` живе в `src/lib/streak.ts` (поруч з `computeWeekly` — реюз тижневих хелперів, DRY; спека називала streak-stats.ts, але це дублювало б три приватні хелпери). `getAllStreakRecords`/`getMilestoneProgress` видаляються. `StreakWidget` видаляється (використовувався тільки в StreakMenu).

**Tech Stack:** React 19, TypeScript, vitest (node env — компонентні тести = експорт + переклади), Motion (`motion/react`), чистий CSS в `src/index.css`. Все на Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.

**Спека:** `docs/superpowers/specs/2026-07-10-streak-modal-redesign-design.md`

---

### Task 1: `getWeeklyRecord` у `src/lib/streak.ts` (TDD)

Найдовша серія тижнів поспіль (понеділок-початок) з ≥`WEEKLY_MIN_DAYS` (5) активними днями за всю історію. Поточний частковий тиждень рахується природно: його count < 5, поки поріг не досягнуто (та сама семантика, що в `computeWeekly`).

**Files:**
- Modify: `src/lib/streak.ts`
- Test: `src/lib/streak.test.ts`

- [ ] **Step 1: Написати failing-тести** — додати в кінець `src/lib/streak.test.ts` (у файлі вже є хелпер створення метрик — реюзнути існуючий; якщо його нема, додати локальний `metric`):

```ts
import { getWeeklyRecord } from './streak' // додати до існуючого імпорту

describe('getWeeklyRecord', () => {
  const day = (date: string): DailyMetrics => ({ date, steps: 5000 })
  // тиждень Пн-Нд з n активними днями, monday = 'YYYY-MM-DD' понеділка
  const week = (monday: string, n: number): DailyMetrics[] => {
    const out: DailyMetrics[] = []
    const start = new Date(monday + 'T12:00:00')
    for (let i = 0; i < n; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i)
      out.push(day(d.toISOString().slice(0, 10)))
    }
    return out
  }

  it('returns 0 for empty data', () => {
    expect(getWeeklyRecord([], new Date('2026-07-10T12:00:00'))).toBe(0)
  })

  it('returns 0 when no week reaches the threshold', () => {
    expect(getWeeklyRecord(week('2026-06-01', 4), new Date('2026-07-10T12:00:00'))).toBe(0)
  })

  it('finds the longest run even if it is not the last one', () => {
    const data = [
      ...week('2026-05-04', 5), ...week('2026-05-11', 5), ...week('2026-05-18', 5), // 3 тижні
      ...week('2026-05-25', 2),                                                     // розрив
      ...week('2026-06-01', 5), ...week('2026-06-08', 5),                           // 2 тижні
    ]
    expect(getWeeklyRecord(data, new Date('2026-06-14T12:00:00'))).toBe(3)
  })

  it('counts the current partial week only once it reaches the threshold', () => {
    const base = [...week('2026-06-29', 7)] // повний тиждень
    // поточний тиждень (Пн 2026-07-06), сьогодні п'ятниця 2026-07-10: 5 активних днів
    const reached = [...base, ...week('2026-07-06', 5)]
    expect(getWeeklyRecord(reached, new Date('2026-07-10T12:00:00'))).toBe(2)
    // а з 4 днями поточний тиждень ще не рахується
    const notReached = [...base, ...week('2026-07-06', 4)]
    expect(getWeeklyRecord(notReached, new Date('2026-07-10T12:00:00'))).toBe(1)
  })
})
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `npx vitest run src/lib/streak.test.ts`
Expected: FAIL — `getWeeklyRecord` не експортується.

- [ ] **Step 3: Мінімальна імплементація** — в `src/lib/streak.ts` після `computeWeekly`:

```ts
// Найдовша серія тижнів поспіль з >= WEEKLY_MIN_DAYS активними днями за всю
// історію. Поточний частковий тиждень рахується, лише якщо вже досяг порогу
// (його count природно < порогу до того) — та сама семантика, що в computeWeekly.
export function getWeeklyRecord(daily: DailyMetrics[], today: Date = new Date()): number {
  const active = new Set<string>()
  for (const d of daily) if (isActiveDay(d)) active.add(d.date)
  if (active.size === 0) return 0

  const first = [...active].sort()[0]
  let monday = startOfWeek(new Date(first + 'T12:00:00'))
  const lastMonday = startOfWeek(today)

  let best = 0
  let run = 0
  while (monday.getTime() <= lastMonday.getTime()) {
    if (countWeek(active, monday) >= WEEKLY_MIN_DAYS) {
      run++
      if (run > best) best = run
    } else {
      run = 0
    }
    monday = addDays(monday, 7)
  }
  return best
}
```

- [ ] **Step 4: Тести зелені**

Run: `npx vitest run src/lib/streak.test.ts`
Expected: PASS (всі, включно зі старими).

- [ ] **Step 5: Commit**

```bash
git add src/lib/streak.ts src/lib/streak.test.ts
git commit -m "feat(streak): add getWeeklyRecord (longest weekly run)"
```

---

### Task 2: Видалити мертву логіку records/milestones зі `streak-stats.ts`

**Files:**
- Modify: `src/lib/streak-stats.ts` — лишити тільки `MonthlyStats`, `getMonthlyStats` і приватний `daysInMonth`; видалити `StreakRecord`, `MilestoneProgress`, `MILESTONES`, `ymd`, `getAllStreakRecords`, `getMilestoneProgress`.
- Modify: `src/lib/streak-stats.test.ts` — видалити describe-блоки `getAllStreakRecords` і `getMilestoneProgress` та їх імпорти; describe `getMonthlyStats` лишається без змін.

- [ ] **Step 1: Видалити функції і тести** (як описано вище; після цього `streak-stats.ts` ≈ 35 рядків: імпорти, `MonthlyStats`, `daysInMonth`, `getMonthlyStats`).

- [ ] **Step 2: Переконатися, що ніхто не імпортує видалене**

Run: `grep -rn "getAllStreakRecords\|getMilestoneProgress" src/`
Expected: порожньо (СтарийStreakStats.tsx ще імпортує — його переписуємо в Task 4; якщо grep знаходить StreakStats.tsx, виконати Task 4 перед цим кроком перевірки або тимчасово прийняти червоний tsc і перевірити після Task 4).

- [ ] **Step 3: Тести**

Run: `npx vitest run src/lib/streak-stats.test.ts`
Expected: PASS (тільки getMonthlyStats).

- [ ] **Step 4: Commit** (можна разом з Task 4, якщо tsc червоний через StreakStats.tsx)

```bash
git add src/lib/streak-stats.ts src/lib/streak-stats.test.ts
git commit -m "refactor(streak): drop unused day-records and milestones"
```

---

### Task 3: Переклади

**Files:**
- Modify: `src/lib/translations.ts` — в секцію `// ── Серия (геймифицированный home)` додати:

```ts
'Текущий стрик': { uk: 'Поточний стрік', en: 'Current streak' },
'Недельный рекорд': { uk: 'Тижневий рекорд', en: 'Weekly record' },
'Активные дни · {m}': { uk: 'Активні дні · {m}', en: 'Active days · {m}' },
'Предыдущий месяц': { uk: 'Попередній місяць', en: 'Previous month' },
'Следующий месяц': { uk: 'Наступний місяць', en: 'Next month' },
```

і видалити ключі, що більше не використовуються після Task 4: `'Активных дней'`, `'Личный рекорд'`, `'До {n} дней'`.

- [ ] **Step 1: Додати/видалити ключі** (як вище).
- [ ] **Step 2: Commit разом із Task 4** (компонентні тести перевіряють наявність ключів — комітимо одночасно).

---

### Task 4: Компоненти — `ActivityCalendar` (навігація + тижні), `StreakStats` → карточки, `StreakMenu` (шапка), видалити `StreakWidget`

**Files:**
- Modify: `src/components/dashboard/ActivityCalendar.tsx`
- Modify: `src/components/dashboard/StreakStats.tsx` (переписати у карточки)
- Modify: `src/components/dashboard/StreakMenu.tsx`
- Delete: `src/components/dashboard/StreakWidget.tsx`, `src/components/dashboard/StreakWidget.test.ts`
- Modify: `src/components/dashboard/ActivityCalendar.test.ts`, `src/components/dashboard/StreakMenu.test.ts`

- [ ] **Step 1: Оновити компонентні тести (failing)**

`ActivityCalendar.test.ts` — KEYS замінити на:

```ts
const KEYS = ['данные есть', 'пропуск', 'заморожено', 'Предыдущий месяц', 'Следующий месяц']
```

`StreakMenu.test.ts` — KEYS замінити на:

```ts
const KEYS = [
  'Серия', 'Текущий стрик', 'Дней подряд', 'Недель подряд',
  'Недельный рекорд', 'Активные дни · {m}', 'Синхронизация ожидается', 'Закрыть',
]
```

Видалити `StreakWidget.test.ts`.

Run: `npx vitest run src/components/dashboard/`
Expected: FAIL до додавання перекладів (Task 3) — після Task 3 ключова частина зелена.

- [ ] **Step 2: Переписати `ActivityCalendar.tsx`** — контрольований місяць, навігація, колонка тижнів, дні сусідніх місяців:

```tsx
import { motion } from 'motion/react'
import type { DailyMetrics } from '../../types'
import { computeStreak, isActiveDay, WEEKLY_MIN_DAYS } from '../../lib/streak'
import { useT } from '../../lib/i18n'

interface Props {
  daily: DailyMetrics[]
  year: number
  month: number // 1-12
  minYm: string // 'YYYY-MM' — найраніший доступний місяць
  onNavigate: (year: number, month: number) => void
}

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

type Status = 'active' | 'frozen' | 'missed' | 'future'

// Календар обраного місяця (mate-style): дні-кружки + колонка тижневих
// чекмарок зліва (тиждень з >= WEEKLY_MIN_DAYS активними днями). Навігація
// ‹ › в межах [minYm, поточний місяць].
export function ActivityCalendar({ daily, year, month, minYm, onNavigate }: Props) {
  const { t, locale } = useT()
  const today = new Date()
  const todayStr = ymd(today)

  const active = new Set<string>()
  for (const d of daily) if (isActiveDay(d)) active.add(d.date)
  const frozen = new Set(computeStreak(daily, today).frozenDates)

  const m0 = month - 1 // JS-месяц
  const first = new Date(year, m0, 1)
  const daysInMonth = new Date(year, m0 + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // Пн-первый
  const weeksCount = Math.ceil((lead + daysInMonth) / 7)

  const statusOf = (date: string): Status => {
    if (date > todayStr) return 'future'
    if (active.has(date)) return 'active'
    if (frozen.has(date)) return 'frozen'
    return 'missed'
  }

  // Тиждень w: активні дні рахуються по повному Пн-Нд, включно з днями
  // сусідніх місяців; чекмарк — коли >= WEEKLY_MIN_DAYS і тиждень не в майбутньому.
  const weekMonday = (w: number) => new Date(year, m0, 1 - lead + w * 7)
  const weekActive = (monday: Date) => {
    let n = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(d.getDate() + i)
      if (active.has(ymd(d))) n++
    }
    return n
  }

  const ym = `${year}-${String(month).padStart(2, '0')}`
  const nowYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const canPrev = ym > minYm
  const canNext = ym < nowYm
  const shift = (delta: number) => {
    const d = new Date(year, m0 + delta, 1)
    onNavigate(d.getFullYear(), d.getMonth() + 1)
  }
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(first)

  const label = (status: Status) =>
    status === 'active' ? t('данные есть') : status === 'frozen' ? t('заморожено') : status === 'missed' ? t('пропуск') : ''

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  return (
    <div className="activity-cal">
      <div className="activity-cal-nav">
        <button type="button" className="activity-cal-arrow" onClick={() => shift(-1)}
          disabled={!canPrev} aria-label={t('Предыдущий месяц')}>‹</button>
        <span className="activity-cal-month">{monthLabel}</span>
        <button type="button" className="activity-cal-arrow" onClick={() => shift(1)}
          disabled={!canNext} aria-label={t('Следующий месяц')}>›</button>
      </div>
      <div className="activity-cal-grid">
        <div className="activity-cal-dow" />
        {weekdays.map(w => <div key={w} className="activity-cal-dow">{t(w)}</div>)}
        {Array.from({ length: weeksCount }, (_, w) => {
          const monday = weekMonday(w)
          const mondayStr = ymd(monday)
          const done = weekActive(monday) >= WEEKLY_MIN_DAYS
          return [
            <div key={`w${mondayStr}`} className={`activity-cal-week${done ? ' done' : ''}`} aria-hidden>
              {done ? '✓' : ''}
            </div>,
            ...Array.from({ length: 7 }, (_, i) => {
              const d = new Date(monday); d.setDate(d.getDate() + i)
              const date = ymd(d)
              if (d.getMonth() !== m0) {
                return <div key={date} className="activity-cal-cell adjacent">{d.getDate()}</div>
              }
              const status = statusOf(date)
              return (
                <motion.div
                  key={date}
                  className={`activity-cal-cell status-${status}${date === todayStr ? ' is-today' : ''}`}
                  title={label(status)}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(0.4, (w * 7 + i) * 0.008), duration: 0.2 }}
                >
                  {status === 'frozen' ? '❄️' : d.getDate()}
                </motion.div>
              )
            }),
          ]
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Переписати `StreakStats.tsx` у дві карточки** (тижневий рекорд + активні дні обраного місяця):

```tsx
import type { DailyMetrics } from '../../types'
import { getMonthlyStats } from '../../lib/streak-stats'
import { getWeeklyRecord } from '../../lib/streak'
import { useT } from '../../lib/i18n'
import { CountUp } from '../common/CountUp'

interface Props {
  daily: DailyMetrics[]
  year: number
  month: number // 1-12 — обраний у календарі місяць
}

// Дві карточки під календарем: тижневий рекорд за весь час і активні дні
// обраного місяця (живе число — слідує за навігацією календаря).
export function StreakStats({ daily, year, month }: Props) {
  const { t, locale } = useT()
  const weeklyRecord = getWeeklyRecord(daily)
  const monthly = getMonthlyStats(daily, year, month)
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' })
    .format(new Date(year, month - 1, 1))

  return (
    <div className="streak-cards">
      <div className="streak-card">
        <span className="streak-card-value">
          <span className="streak-card-emoji" aria-hidden>⚡</span>
          <CountUp value={weeklyRecord} />
        </span>
        <span className="streak-card-label">{t('Недельный рекорд')}</span>
      </div>
      <div className="streak-card">
        <span className="streak-card-value">
          <span className="streak-card-emoji" aria-hidden>📅</span>
          <CountUp value={monthly.activeDays} /> / {monthly.totalDays}
        </span>
        <span className="streak-card-label">{t('Активные дни · {m}', { m: monthName })}</span>
      </div>
    </div>
  )
}
```

(Перевірити сигнатуру `t` для параметрів: у `translations.ts` є ключ `'До {n} дней'`, використовуваний як `t('До {n} дней', { n: ... })` — той самий механізм для `{m}`.)

- [ ] **Step 4: Переписати `StreakMenu.tsx`** — шапка з лічильниками, стан місяця:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { DailyMetrics } from '../../types'
import { computeStreak, isActiveDay } from '../../lib/streak'
import { useT } from '../../lib/i18n'
import { ActivityCalendar } from './ActivityCalendar'
import { StreakStats } from './StreakStats'

interface Props {
  daily: DailyMetrics[]
}

// Compact topbar entry point. The full streak and calendar only take space
// after the user asks for them, keeping the dashboard focused on health data.
export function StreakMenu({ daily }: Props) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const now = new Date()
  const [ym, setYm] = useState<{ year: number; month: number }>({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const rootRef = useRef<HTMLDivElement>(null)
  const streak = computeStreak(daily)

  // Межа навігації назад — найраніший місяць з даними.
  const firstActive = daily.filter(isActiveDay).map(d => d.date).sort()[0]
  const minYm = firstActive ? firstActive.slice(0, 7) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const openPanel = () => {
    // Кожне відкриття починаємо з поточного місяця.
    setYm({ year: now.getFullYear(), month: now.getMonth() + 1 })
    setOpen(value => !value)
  }

  return (
    <div className="streak-menu" ref={rootRef}>
      <button
        type="button"
        className={`streak-menu-trigger${open ? ' active' : ''}`}
        aria-label={t('Серия')}
        aria-expanded={open}
        aria-controls="streak-menu-panel"
        onClick={openPanel}
      >
        <span className="streak-menu-flame" aria-hidden>🔥</span>
        <span className="streak-menu-count">{streak.current}</span>
        <span className="streak-menu-label">{t('Дней подряд')}</span>
      </button>

      {open && (
        <section id="streak-menu-panel" className="streak-menu-panel" role="dialog" aria-label={t('Текущий стрик')}>
          <div className="streak-menu-head">
            <span className="streak-menu-title">{t('Текущий стрик')}</span>
            <div className="streak-menu-counters">
              <span className="streak-menu-counter" title={t('Дней подряд')}>
                <span aria-hidden>🔥</span>{streak.current}
              </span>
              <span className="streak-menu-counter" title={t('Недель подряд')}>
                <span aria-hidden>⚡</span>{streak.weekly}
              </span>
              <button type="button" className="streak-menu-close" onClick={() => setOpen(false)} aria-label={t('Закрыть')}>×</button>
            </div>
          </div>
          {streak.todayPending && (
            <div className="streak-menu-pending">{t('Синхронизация ожидается')}</div>
          )}
          <ActivityCalendar
            daily={daily}
            year={ym.year}
            month={ym.month}
            minYm={minYm}
            onNavigate={(year, month) => setYm({ year, month })}
          />
          <StreakStats daily={daily} year={ym.year} month={ym.month} />
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Видалити `StreakWidget.tsx` і `StreakWidget.test.ts`**

```bash
git rm src/components/dashboard/StreakWidget.tsx src/components/dashboard/StreakWidget.test.ts
```

Перевірити, що ключі `'Заморозки'` більше ніде не використовуються: `grep -rn "'Заморозки'" src/` — якщо тільки в `translations.ts`, видалити ключ там теж.

- [ ] **Step 6: Тести + tsc**

Run: `npx vitest run && npx tsc -b`
Expected: PASS / без помилок.

- [ ] **Step 7: Commit (разом з Task 3)**

```bash
git add -A src/lib/translations.ts src/components/dashboard/
git commit -m "feat(streak): mate-style unified streak panel with month navigation"
```

---

### Task 5: CSS

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Оновити стилі.**

Видалити: блоки `.streak-widget*`, `.streak-metric*` (≈ рядки 1947–1968), `.streak-stats*` (≈ 1970–1993), `.streak-menu-panel .streak-widget*` overrides (≈ 2024–2030), `.activity-cal-title`.

Додати/замінити (біля існуючих `.streak-menu-*` і `.activity-cal*`):

```css
.streak-menu-title { font-size: 15px; font-weight: 700; }
.streak-menu-counters { display: flex; align-items: center; gap: 12px; }
.streak-menu-counter {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.streak-menu-pending {
  font-size: 12px; color: var(--text-muted); padding: 4px 16px 0;
}

.activity-cal-nav {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  margin-bottom: 10px;
}
.activity-cal-month { font-weight: 600; font-size: 14px; text-transform: capitalize; }
.activity-cal-arrow {
  width: 28px; height: 28px; display: grid; place-items: center;
  color: var(--text); background: transparent; border: none; border-radius: 6px;
  font-size: 18px; line-height: 1; cursor: pointer;
}
.activity-cal-arrow:hover:not(:disabled) { background: var(--surface2); }
.activity-cal-arrow:disabled { color: var(--text-muted); opacity: 0.4; cursor: default; }

.activity-cal-grid {
  display: grid; grid-template-columns: 22px repeat(7, 1fr); gap: 6px;
  align-items: center;
}
.activity-cal-week {
  width: 18px; height: 18px; border-radius: 999px;
  border: 1.5px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; justify-self: center;
}
.activity-cal-week.done { background: var(--green); border-color: var(--green); color: #fff; }
.activity-cal-cell.adjacent { color: var(--text-muted); opacity: 0.35; font-size: 12px; }

.streak-cards {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 14px 16px;
}
.streak-card {
  display: flex; flex-direction: column; gap: 2px;
  background: var(--surface2); border-radius: 10px; padding: 10px 12px;
}
.streak-card-value { font-size: 18px; font-weight: 700; display: inline-flex; align-items: baseline; gap: 6px; }
.streak-card-emoji { font-size: 15px; }
.streak-card-label { font-size: 12px; color: var(--text-muted); }
```

У `.activity-cal-grid` прибрати старий `max-width: 420px` (колонка тижнів вже обмежує), а override `.streak-menu-panel .activity-cal-grid { max-width: none; }` і `.streak-menu-panel .activity-cal-title` — видалити.

- [ ] **Step 2: Build**

Run: `npx tsc -b && npx vite build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style(streak): unified panel styles — nav, week checks, stat cards"
```

---

### Task 6: Верифікація і фінал

- [ ] **Step 1: Повний прогін**

Run: `npx vitest run && npm run build && npm run lint`
Expected: тести зелені, білд ок, lint без НОВИХ помилок (pre-existing є).

- [ ] **Step 2: Візуальна перевірка в демо-режимі** — `.env.local` з `VITE_DEMO=1` + dummy Supabase ключами (див. skill running-tonus), відкрити прев'ю, клікнути 🔥 в топбарі: перевірити шапку, навігацію місяців (‹ активна, › неактивна на поточному), чекмарки тижнів, карточки, оновлення «Активні дні · …» при гортанні. Скріншот користувачу.

- [ ] **Step 3: Оновити пам'ять** (gamified-home-pr.md — редизайн модалки) і закомітити залишки. Push у main за наявності зелених тестів — деплой через CI.
