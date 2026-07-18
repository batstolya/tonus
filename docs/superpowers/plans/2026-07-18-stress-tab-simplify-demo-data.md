# Stress Tab Simplify + Demo Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Stress tab into a view-only surface (Google connect only, everything else in Settings), give `cal_bookings.json` a home in the Upload screen, and populate the demo Stress tab with mocked calendar events.

**Architecture:** Trim the `StressMapScreen` empty state and drop its now-unused `onEvents` prop and file-parsing code. Add a `.json` upload zone to `UploadScreen` (reusing the existing `onEvents` path). Add a deterministic `makeDemoEvents()` fixture aligned to the 7-day `makeDemoHRSamples` window and wire it into the demo branch of `App.tsx`.

**Tech Stack:** React 19 + Vite, TypeScript, Vitest (node project for `*.test.ts`, jsdom for `*.test.tsx` via `renderWithProviders`). Node 24 required for all commands (`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`).

---

## Background facts (verified in codebase)

- Stress empty state today: `.ics` button, `cal_bookings.json` button, Google button — `src/components/stress-map/StressMapScreen.tsx:50-74`.
- `.ics` upload ALSO lives in `src/components/upload/UploadScreen.tsx:125` (reachable Settings → Import → "Загрузить данные"). Not touched.
- Cal.com sync: `CalSyncSection` (Settings). Google: `GoogleCalendarSection` (Settings). Not touched.
- `parseCalBookings` (`src/parsers/calBookingsParser.ts`) is used ONLY by the Stress tab today — this is the orphan being relocated.
- Demo branch: `src/App.tsx:182-191` loads daily + HR samples + intake events, never calls `setEvents`.
- `makeDemoHRSamples(7)` (`src/lib/demoFixture.ts:176`) emits a sample every 10 min, 24h/day, for the last 7 days. Any event placed in that window overlaps HR samples.
- `buildStressMap` (`src/lib/stressMap.ts`) baseline = 10th percentile of HR for the event's hour-of-day; delta = avg(samples in [start,end]) − baseline. With demo HR = `base + rnd()*25`, every event lands at roughly +10 delta regardless of hour — so demo events show realistic, populated data but NOT differentiated "stress levels". The goal is a populated map, not tuned deltas.
- `CalendarEvent` shape (`src/types/index.ts:39`): `{ uid: string; title: string; start: Date; end: Date; description?: string; location?: string; source?: string }`.
- `PHYSICAL_KEYWORDS` (`src/lib/stressMap.ts:3`) matches e.g. `тренировк`, `gym`, `бег` — a matching title gets the 🏃 badge.
- Translations: key = Russian source string, value `{ uk, en }`. Stress strings live in `src/lib/translations/metrics.ts:67-75`. `npm run lint` runs `--max-warnings 0`.
- Demo event **titles are rendered raw** (`entry.event.title`, not through `t()`), so they are product content and stay plain Russian — no i18n keys needed for titles.
- `rnd(seed)` deterministic helper in `demoFixture.ts:13` returns 0..1.

---

## Task 1: Add i18n strings

**Files:**
- Modify: `src/lib/translations/metrics.ts:67-75`

- [ ] **Step 1: Add the two new keys**

In `src/lib/translations/metrics.ts`, inside the `metrics` object under the "Карта стресса" block (after line 75, `'Google Календарь': ...`), add:

```ts
  'Другие способы подключить календарь — в Настройках': {
    uk: 'Інші способи підключити календар — у Налаштуваннях',
    en: 'Other ways to connect a calendar are in Settings',
  },
  'Перетащите cal_bookings.json': {
    uk: 'Перетягніть cal_bookings.json',
    en: 'Drop cal_bookings.json',
  },
  'Экспорт Cal.com': { uk: 'Експорт Cal.com', en: 'Cal.com export' },
```

- [ ] **Step 2: Verify lint passes (no missing/duplicate keys)**

Run: `npm run lint`
Expected: exits 0, no warnings.

- [ ] **Step 3: Commit**

```bash
git add src/lib/translations/metrics.ts
git commit -m "i18n: stress-tab settings hint + cal_bookings upload labels"
```

---

## Task 2: Add `makeDemoEvents` fixture (TDD)

**Files:**
- Modify: `src/lib/demoFixture.ts` (add function after `makeDemoHRSamples`, ends line 190)
- Test: `src/lib/demoFixture.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/demoFixture.test.ts`:

```ts
import { makeDemoEvents } from './demoFixture'
import { buildStressMap } from './stressMap'

describe('makeDemoEvents', () => {
  const events = makeDemoEvents()
  const samples = makeDemoHRSamples()

  it('generates a non-trivial set of events', () => {
    expect(events.length).toBeGreaterThanOrEqual(10)
  })

  it('gives every event a unique uid and end after start', () => {
    const uids = new Set(events.map(e => e.uid))
    expect(uids.size).toBe(events.length)
    for (const e of events) {
      expect(e.end.getTime()).toBeGreaterThan(e.start.getTime())
    }
  })

  it('places all events inside the 7-day HR sample window', () => {
    const now = Date.now()
    const weekAgo = now - 7 * 24 * 3600 * 1000
    for (const e of events) {
      expect(e.start.getTime(), e.title).toBeGreaterThanOrEqual(weekAgo)
      expect(e.start.getTime(), e.title).toBeLessThanOrEqual(now)
    }
  })

  it('includes at least one physical-activity event', () => {
    const map = buildStressMap(events, samples)
    expect(map.some(m => m.isPhysicalActivity)).toBe(true)
  })

  it('yields non-null heart-rate deltas against demo HR samples', () => {
    const map = buildStressMap(events, samples)
    expect(map.every(m => m.heartRateDelta !== null)).toBe(true)
  })

  it('is deterministic', () => {
    const a = makeDemoEvents()
    const b = makeDemoEvents()
    expect(a.map(e => e.uid + e.start.toISOString())).toEqual(
      b.map(e => e.uid + e.start.toISOString()),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- demoFixture`
Expected: FAIL — `makeDemoEvents is not a function` / import error.

- [ ] **Step 3: Implement `makeDemoEvents`**

Add to `src/lib/demoFixture.ts` (after `makeDemoHRSamples`, which ends at line 190). Add `CalendarEvent` to the type import on line 2:

```ts
import type { DailyMetrics, HeartRateSample, CalendarEvent } from '../types'
```

Then the function:

```ts
// Демо-события календаря для «Карты стресса». Ставятся в окно makeDemoHRSamples
// (последние 7 дней), чтобы у каждого была реальная дельта пульса. Одна тренировка
// помечается как физактивность через PHYSICAL_KEYWORDS.
export function makeDemoEvents(days = 7): CalendarEvent[] {
  // Шаблон рабочей недели: [смещение дней назад, час, длит. мин, заголовок].
  const template: [number, number, number, string][] = [
    [6, 10, 30, 'Дейли-стендап'],
    [6, 15, 60, 'Созвон с клиентом'],
    [5, 11, 90, 'Дедлайн по проекту'],
    [5, 13, 45, 'Обед с командой'],
    [4, 9, 30, '1:1 с руководителем'],
    [4, 18, 60, 'Тренировка в зале'],
    [3, 14, 120, 'Планирование спринта'],
    [3, 16, 30, 'Ретро'],
    [2, 10, 60, 'Собеседование'],
    [2, 19, 90, 'Ужин с друзьями'],
    [1, 12, 45, 'Демо для стейкхолдеров'],
    [1, 17, 30, 'Разбор инцидента'],
  ]
  const now = new Date()
  return template.map(([daysAgo, hour, durMin, title], idx) => {
    const start = new Date(now)
    start.setDate(start.getDate() - daysAgo)
    start.setHours(hour, Math.floor(rnd(idx * 13) * 30), 0, 0)
    const end = new Date(start.getTime() + durMin * 60 * 1000)
    return { uid: `demo-evt-${idx}`, title, start, end, source: 'demo' }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- demoFixture`
Expected: PASS (all `makeDemoEvents` cases + existing `makeDemoDaily` cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/demoFixture.ts src/lib/demoFixture.test.ts
git commit -m "feat(demo): mock calendar events for the stress map"
```

---

## Task 3: Wire demo events into `App.tsx`

**Files:**
- Modify: `src/App.tsx:182-191` (demo branch)

- [ ] **Step 1: Add `makeDemoEvents` to the demo dynamic import and call `setEvents`**

Replace the demo branch body (`src/App.tsx:182-191`):

```tsx
      if (isDemoActive()) {
        const [{ makeDemoDaily, makeDemoHRSamples, makeDemoEvents }, { demoList }] = await Promise.all([
          import('./lib/demoFixture'),
          import('./lib/demoDb'),
        ])
        if (cancelled) return
        setDaily(makeDemoDaily(), makeDemoHRSamples(), true)
        setEvents(makeDemoEvents())
        setIntakeEvents(demoList('intake_events') as typeof intakeEvents)
        setDbLoading(false)
        return
      }
```

(`setEvents` is already destructured from `useAppStore()` at `src/App.tsx:120`.)

- [ ] **Step 2: Verify build + typecheck**

Run: `npm run build`
Expected: `tsc -b` + `vite build` succeed, no errors.

- [ ] **Step 3: Manual demo check**

Create `.env.local` with `VITE_DEMO=1` (plus the dummy Supabase keys from CLAUDE.md), run `npm run dev`, open the app, go to Стресс.
Expected: populated stress map with HR deltas, sort tabs (По стрессу / По дате / Графики), and a 🏃-tagged "Тренировка в зале". Charts tab renders.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(demo): show populated stress map in demo mode"
```

---

## Task 4: Add cal_bookings.json zone to Upload screen

**Files:**
- Modify: `src/components/upload/UploadScreen.tsx` (import at line 3, handler after `handleICSFile` ~line 88, zone markup after the `.ics` zone ~line 131)

- [ ] **Step 1: Import the parser**

Add to `src/components/upload/UploadScreen.tsx` after line 3 (`import { parseICS } ...`):

```ts
import { parseCalBookings } from '../../parsers/calBookingsParser'
```

- [ ] **Step 2: Add the handler**

After `handleICSFile` (ends `src/components/upload/UploadScreen.tsx:88`), add:

```tsx
  function handleCalBookingsFile(file: File) {
    file.text().then(text => {
      try {
        onEvents(parseCalBookings(text))
      } catch {
        onError(t('Не удалось прочитать .ics файл'))
      }
    })
  }
```

- [ ] **Step 3: Add the upload zone**

After the existing `.ics` `<UploadZone>` (closes at `src/components/upload/UploadScreen.tsx:131`), inside the same `<div className="upload-zones">`, add:

```tsx
        <UploadZone
          accept=".json"
          label={t('Перетащите cal_bookings.json')}
          sublabel={t('Экспорт Cal.com')}
          optional
          onFile={handleCalBookingsFile}
        />
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds, no unused-import warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/upload/UploadScreen.tsx
git commit -m "feat(upload): cal_bookings.json import zone (moved from stress tab)"
```

---

## Task 5: Trim the Stress tab empty state (TDD)

**Files:**
- Modify: `src/components/stress-map/StressMapScreen.tsx`
- Test: `src/components/stress-map/StressMapScreen.test.tsx` (create)
- Modify: `src/App.tsx:491-499` (drop `onEvents` prop from `<StressMapScreen>`)

- [ ] **Step 1: Write the failing test**

Create `src/components/stress-map/StressMapScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders, screen } from '../../test/utils'
import { StressMapScreen } from './StressMapScreen'

describe('StressMapScreen empty state', () => {
  it('shows only the Google connect option and a Settings hint', () => {
    renderWithProviders(
      <StressMapScreen
        heartRateSamples={[]}
        events={[]}
        onGoogleCalendar={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Google Calendar/i })).toBeTruthy()
    expect(screen.getByText(/в Настройках|у Налаштуваннях|in Settings/)).toBeTruthy()
    expect(screen.queryByText(/\.ics/i)).toBeNull()
    expect(screen.queryByText(/cal_bookings\.json/i)).toBeNull()
  })

  it('omits the Google button when the integration is unavailable', () => {
    renderWithProviders(
      <StressMapScreen heartRateSamples={[]} events={[]} />,
    )
    expect(screen.queryByRole('button', { name: /Google Calendar/i })).toBeNull()
    expect(screen.getByText(/в Настройках|у Налаштуваннях|in Settings/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- StressMapScreen`
Expected: FAIL — `.ics`/`cal_bookings.json` still present (and `onEvents` currently required by the type).

- [ ] **Step 3: Trim the component**

In `src/components/stress-map/StressMapScreen.tsx`:

Remove the now-unused imports (lines 5-6):

```ts
import { parseICS } from '../../parsers/icsParser'
import { parseCalBookings } from '../../parsers/calBookingsParser'
```

Remove `onEvents` from `Props` (line 12) so it becomes:

```ts
interface Props {
  heartRateSamples: HeartRateSample[]
  events: CalendarEvent[]
  onGoogleCalendar?: () => void
  googleConnected?: boolean
  showGoogle?: boolean
  onToggleGoogle?: (v: boolean) => void
}
```

Update the destructure (line 25) to drop `onEvents`:

```ts
export function StressMapScreen({ heartRateSamples, events, onGoogleCalendar, googleConnected = false, showGoogle = true, onToggleGoogle }: Props) {
```

Delete `icsRef`/`calRef` (lines 33-34) and the `handleICS`/`handleCal` functions (lines 36-48).

Replace the empty-state block (lines 50-74) with:

```tsx
  if (!events.length) {
    return (
      <div className="screen">
        <h2>{t('Карта стресса')}</h2>
        <p className="empty-hint" style={{ marginBottom: 16 }}>
          {t('Нужны данные календаря. Загрузите один из форматов:')}
        </p>
        {onGoogleCalendar && (
          <button className="btn-primary" style={{ maxWidth: 240, marginBottom: 12 }} onClick={onGoogleCalendar}>
            🗓 Google Calendar
          </button>
        )}
        <p className="screen-hint">{t('Другие способы подключить календарь — в Настройках')}</p>
      </div>
    )
  }
```

- [ ] **Step 4: Drop the `onEvents` prop at the call site**

In `src/App.tsx`, the `<StressMapScreen>` render (lines 491-499) currently passes `onEvents={e => handleEvents(e, 'ics')}`. Remove that one line so it reads:

```tsx
          <StressMapScreen
            heartRateSamples={state.heartRateSamples}
            events={visibleEvents}
            onGoogleCalendar={isGoogleCalendarAvailable() ? handleGoogleCalendar : undefined}
            googleConnected={googleConnected}
            showGoogle={showGoogleEvents}
            onToggleGoogle={setShowGoogleEvents}
          />
```

- [ ] **Step 5: Run test + build to verify green**

Run: `npm test -- StressMapScreen`
Expected: PASS both cases.

Run: `npm run build`
Expected: succeeds — `handleEvents` may now be unused if the Stress tab was its only caller; if `tsc`/eslint flags it, confirm no other caller (`grep -n handleEvents src/App.tsx`) and remove the now-dead `handleEvents` definition, else leave it. Re-run `npm run build` until clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/stress-map/StressMapScreen.tsx src/components/stress-map/StressMapScreen.test.tsx src/App.tsx
git commit -m "feat(stress): view-only tab, connectors move to Settings"
```

---

## Task 6: Full verification

- [ ] **Step 1: Lint (zero tolerance)**

Run: `npm run lint`
Expected: exits 0, no warnings (CI uses `--max-warnings 0`).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all node + jsdom projects pass.

- [ ] **Step 3: deno function check (only if edge functions changed)**

Not applicable — this plan touches only `src/`. Skip.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual smoke**

`VITE_DEMO=1` dev run: Стресс tab populated (Task 3 step 3). Then temporarily set `events=[]` path (or a fresh non-demo run with no calendar): empty state shows only Google + Settings hint, no `.ics`/`cal_bookings` buttons. Settings → Import → Загрузить данные shows both `.ics` and `cal_bookings.json` zones.

---

## Self-review notes

- **Spec coverage:** §1 empty state → Task 5; §2 cal_bookings home → Task 4; §3 demo events → Tasks 2+3; §4 translations → Task 1; testing → Tasks 2 & 5 + Task 6. All covered.
- **Realism caveat:** demo deltas are uniform (~+10) by construction of `makeDemoHRSamples`; the spec's "high-stress" wording is aspirational — the delivered behaviour is a populated, sorted map with one 🏃 event, which is the actual goal. Tests assert non-null deltas and a physical event, not tuned magnitudes.
- **Type consistency:** `makeDemoEvents(days = 7): CalendarEvent[]` used identically in Task 2 (def), Task 3 (call). `CalendarEvent` import added in Task 2. `onEvents` removed from `StressMapScreen` Props (Task 5) and call site (Task 5 step 4) together.
- **Dead code:** Task 5 step 5 explicitly checks whether `handleEvents` becomes unused after dropping the prop and removes it if so.
