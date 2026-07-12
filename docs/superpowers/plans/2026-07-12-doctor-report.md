# Doctor Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Печатная страница «Отчёт для врача»: факты из данных + опциональный ИИ-блок вопросов (SPEC-DOCTOR-REPORT.md).

**Architecture:** Чистая логика агрегации в `src/lib/doctorReport.ts` (тестируется в node). UI — один компонент `DoctorReport.tsx` (экран подготовки + печатное представление) в overlay-паттерне Settings (`guide-overlay`). ИИ-вопросы — новый `mode: 'doctor-questions'` в `analyze-health` (digest строится клиентом из тех же данных, что печатаются, — уточнение спеки: «серверный healthContext» не нужен, функция исторически принимает клиентский digest). Язык отчёта ru/en — локальный словарь поверх существующего `translations` (en-значения).

**Tech Stack:** TypeScript, React 19, vitest (node), @media print CSS, Gemini via analyze-health.

**Уточнения спеки по факту кода:** веса в данных нет (метрика не собирается) — из таблицы метрик исключён; в демо-режиме лабы/добавки/проблемы пустые (фикстур нет) — секции честно показывают «нет данных», метрики работают на фикстурах.

---

### Task 1: Чистая логика — `src/lib/doctorReport.ts`

**Files:**
- Create: `src/lib/doctorReport.ts`
- Test: `src/lib/doctorReport.test.ts`

- [ ] **Step 1: Падающие тесты** — `summarizeMetrics` (avg/min/max/baseline-дельта по rhr/hrv/sleep/steps за период), `weeklyRows` (понедельная динамика, ISO-недели, последние ≤ 13 строк), `latestLabs` (последнее значение маркера + дельта с предыдущим + outOfRange из flag или парсинга ref_range «3.5-5.5», значения вне → флаг ↑/↓).

```ts
// ключевые сигнатуры
export interface MetricSummary { key: 'restingHeartRate'|'hrv'|'sleepHours'|'steps'; avg: number|null; min: number|null; max: number|null; baselinePct: number|null }
export function summarizeMetrics(daily: DailyMetrics[], periodDays: number): MetricSummary[]
export interface WeeklyRow { weekStart: string; rhr: number|null; hrv: number|null; sleep: number|null; steps: number|null }
export function weeklyRows(daily: DailyMetrics[], periodDays: number): WeeklyRow[]
export interface LabLine { marker: string; value: number; unit: string|null; refRange: string|null; flag: '↑'|'↓'|null; date: string; prevValue: number|null }
export function latestLabs(results: LabResult[]): LabLine[]
export function parseRefRange(s: string|null|undefined): { lo: number; hi: number } | null
```

Тесты: baseline из `computeDailyScores` (последний `*_baseline`), парсер диапазонов («3.9-6.2», «< 5», «10 – 20», мусор → null), сортировка лаб по маркеру, дельта только при ≥2 замерах.

- [ ] **Step 2: Реализация**, **Step 3: тесты зелёные**, **Step 4: Commit** — `feat(doctor-report): агрегация данных отчёта`

### Task 2: `analyze-health` — режим doctor-questions

**Files:**
- Modify: `supabase/functions/analyze-health/index.ts`

- [ ] **Step 1:** Читать `mode` из body; при `mode === 'doctor-questions'` использовать отдельный системный промпт:

```
Ты помогаешь пациенту подготовиться к визиту к врачу. По сводке данных сформулируй 3–5 нейтральных вопросов врачу.
Правила: ТОЛЬКО вопросы; никаких диагнозов, интерпретаций и названий препаратов; опирайся только на данные из сводки; русский или английский — язык укажет поле lang.
Верни строго JSON: { "questions": ["...", "..."] }
```

`ai_usage.source = 'doctor-report'`. Остальное (auth, checkBudget, digest) — без изменений.

- [ ] **Step 2:** Lint = baseline. Commit — `feat(doctor-report): режим doctor-questions в analyze-health`

### Task 3: Экран `DoctorReport.tsx` (подготовка + печать)

**Files:**
- Create: `src/components/settings/DoctorReport.tsx`
- Modify: `src/index.css` (`@media print` блок + классы `.dr-*`)
- Test: `src/components/settings/DoctorReport.test.ts` (экспорт + переводы)

- [ ] **Step 1:** Компонент: props `{ user?: User; daily: DailyMetrics[]; onClose: () => void }`. Состояние: `period` (30/90/365, дефолт 90), чекбоксы `sections` (metrics✓, labs✓, supplements✓, concerns✓, ai✗), `lang` ('ru'|'en'), `stage` ('setup'|'preview'), загруженные labs/supplements+logs/concerns (useEffect, каждый лоад в try/catch → пусто в демо). Приватные concerns: показываются в списке выбора только при `isUnlocked()`, по умолчанию сняты.
- [ ] **Step 2:** «Сформировать»: если выбран ИИ-блок — `edgeFunction('analyze-health', { digest, periodStart, periodEnd, mode: 'doctor-questions', lang })`; затем `stage='preview'`. Печатное представление: шапка с дисклеймером, таблица метрик (`summarizeMetrics`), понедельная таблица (`weeklyRows`), лабы (`latestLabs`, флаги выделены), добавки (+% соблюдения из `computeAdherence`), проблемы, ИИ-блок в рамке с подписью. Кнопки «Печать» (`window.print()`) и «Назад» — скрыты в print.
- [ ] **Step 3:** Локализация: словарь-хелпер `rt(key)` = `lang==='ru' ? key : (translations[key]?.en ?? key)`; все строки отчёта — русские ключи, en-переводы добавить в `translations.ts` (сгруппировать «Отчёт для врача»), uk тоже (для UI-экрана подготовки).
- [ ] **Step 4:** CSS: `.dr-print` A4-вёрстка, `@media print { body * … }` — показать только отчёт, `break-inside: avoid` таблицам, скрыть хедер приложения.
- [ ] **Step 5:** Тест переводов (паттерн ForecastCard.test.ts). Commit — `feat(doctor-report): экран подготовки и печатное представление`

### Task 4: Вход из Настроек

**Files:**
- Modify: `src/components/settings/SettingsScreen.tsx` (рядом с экспортом, ~строка 180; overlay по паттерну `showGuide`)

- [ ] **Step 1:** Кнопка «🖨 Отчёт для врача» в секции экспорта → `setShowDoctorReport(true)`; overlay `<div className="guide-overlay"><DoctorReport …/></div>`. `daily` в SettingsScreen не приходит — передать из App через новый prop ИЛИ грузить в DoctorReport самостоятельно через `daily_metrics` (в демо — `makeDemoDaily(90)`); выбрать при реализации то, что не тянет новые пропсы через все уровни: самозагрузка предпочтительна.
- [ ] **Step 2:** Переводы кнопки, тест. Commit — `feat(doctor-report): вход из настроек`

### Task 5: Финал

- [ ] Ветка `feature/doctor-report` (от свежего main).
- [ ] Полный `npm test`, `npm run build`, `npm run lint` (= baseline), e2e `VITE_DEMO= npx playwright test`.
- [ ] Визуальная проверка в демо: экран подготовки → отчёт → print-preview скриншот.
- [ ] PR → merge при зелёном CI (авторизовано пользователем на серию).
- [ ] Деплой `analyze-health` — с явного подтверждения, вместе с остальными.
