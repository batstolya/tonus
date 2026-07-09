# Connect Guide (анимированный гайд подключения) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пошаговый анимированный wizard, который доводит нового пользователя от пустого аккаунта до первого принятого payload'а из Health Auto Export (спека `docs/specs/SPEC-CONNECT-GUIDE.md`, плюс этап B1 из `docs/specs/SPEC-BANDS-AUTOSYNC.md` — ветка «Mi Band + iPhone»).

**Architecture:** Wizard `ConnectGuide` рендерится в `App.tsx` вместо голого `DeviceSelectScreen`, когда `!hasData` и гайд не отклонён. Чистая логика (шаги/ветки, поллинг первого приёма) вынесена в модули без DOM (`guideState.ts`, `ingestWait.ts`) и тестируется vitest-ом напрямую. Анимации — Motion (`LazyMotion domMax strict`, только `m.*`), reduced-motion через `MotionConfig reducedMotion="user"`. Токен/вебхук — существующие `ensureToken`/`webhookUrl` из `lib/autosync.ts`.

**Tech Stack:** React 19, TypeScript, Motion 12 (`motion/react`), vitest (окружение **node** — рендер компонентов недоступен, тесты компонентов = «экспорт + переводы»), Playwright e2e, переводы через `t()` + `src/lib/translations.ts`.

**Вне скоупа:** SPEC-BANDS этапы B2-B5 (Health Connect детектор в `ingest-health`, `source_platform`) — заблокированы разведкой на реальном Android (B2). Отдельный план после снятия payload'ов.

---

## Обязательная подготовка (перед каждой сессией)

Всё (dev/test/build/lint) требует Node 24:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
node -v   # v24.x
```

Для `npm run dev` нужен временный `.env.local` (gitignored):

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key
VITE_DEMO=1
```

⚠️ В рабочем дереве есть незакоммиченные правки `src/components/settings/SettingsScreen.tsx` (и служебные `claude-monitor/*`). Не откатывать и не коммитить чужие ханки: `git add` только файлы своей задачи.

## Файловая структура

```
src/components/onboarding/
  ConnectGuide.tsx            — wizard-контейнер (шаги, прогресс, навигация, Motion)
  ConnectGuide.test.ts        — экспорт + покрытие переводов (единый тест на весь гайд)
  guideState.ts               — чистая логика: ветки шагов, персист прогресса
  guideState.test.ts
  guide/StepExplain.tsx       — «что произойдёт» (SVG-сцена)
  guide/StepInstallHAE.tsx    — установка HAE (+trial, App Store)
  guide/StepAutomation.tsx    — мини-скринкаст автоматизации
  guide/StepWebhook.tsx       — персональный URL + копирование
  guide/StepSchedule.tsx      — данные и расписание
  guide/StepVerify.tsx        — живая проверка связи
  guide/StepPhone.tsx         — ветвление Xiaomi: iPhone/Android/CSV
  guide/StepMiFitness.tsx     — Mi Fitness → Apple Health (B1 из SPEC-BANDS)
  guide/StepAndroidSoon.tsx   — заглушка Android до B3
src/lib/
  ingestWait.ts               — waitForFirstIngest (без импорта supabase — тестируется в node)
  ingestWait.test.ts
e2e/guide.spec.ts             — гард витрины: гайд из настроек в демо
```

Изменяются: `src/App.tsx` (роутинг `!hasData`), `src/components/settings/SettingsScreen.tsx` (пункт «Как подключить устройство»), `src/lib/translations.ts` (ключи uk/en в каждой задаче), `src/index.css` (стили гайда).

---

### Task 1: guideState — ветки шагов и персист прогресса

**Files:**
- Create: `src/components/onboarding/guideState.ts`
- Test: `src/components/onboarding/guideState.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/onboarding/guideState.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { stepsFor, loadGuideProgress, saveGuideProgress, clearGuideProgress } from './guideState'

// Окружение vitest — node: подменяем localStorage простым in-memory стабом.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage
})

describe('stepsFor', () => {
  it('apple: полный путь HAE', () => {
    expect(stepsFor('apple_watch', null)).toEqual(
      ['device', 'explain', 'install', 'automation', 'webhook', 'schedule', 'verify'])
  })
  it('xiaomi без выбора телефона: останавливается на вопросе', () => {
    expect(stepsFor('xiaomi', null)).toEqual(['device', 'explain', 'phone'])
  })
  it('xiaomi + iphone: Mi Fitness → путь HAE', () => {
    expect(stepsFor('xiaomi', 'iphone')).toEqual(
      ['device', 'explain', 'phone', 'mifitness', 'install', 'automation', 'webhook', 'schedule', 'verify'])
  })
  it('xiaomi + android: заглушка', () => {
    expect(stepsFor('xiaomi', 'android')).toEqual(['device', 'explain', 'phone', 'android_soon'])
  })
  it('устройство не выбрано: только первый шаг', () => {
    expect(stepsFor(null, null)).toEqual(['device'])
  })
})

describe('прогресс в localStorage', () => {
  it('пустое хранилище → шаг 0 без телефона', () => {
    expect(loadGuideProgress()).toEqual({ step: 0, phone: null })
  })
  it('save → load восстанавливает шаг и телефон', () => {
    saveGuideProgress({ step: 4, phone: 'iphone' })
    expect(loadGuideProgress()).toEqual({ step: 4, phone: 'iphone' })
  })
  it('мусор в хранилище не ломает загрузку', () => {
    store.set('tonus.connectGuideStep', 'abc')
    store.set('tonus.connectGuidePhone', 'nokia')
    expect(loadGuideProgress()).toEqual({ step: 0, phone: null })
  })
  it('clear стирает прогресс', () => {
    saveGuideProgress({ step: 3, phone: 'android' })
    clearGuideProgress()
    expect(loadGuideProgress()).toEqual({ step: 0, phone: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/onboarding/guideState.test.ts`
Expected: FAIL — `Cannot find module './guideState'`

- [ ] **Step 3: Write the implementation**

```ts
// src/components/onboarding/guideState.ts
// Чистая логика wizard-а подключения: какие шаги показывать для какой ветки
// и как переживать перезагрузку страницы. Без DOM и без Supabase.
import type { DeviceType } from '../../store/appStore'

export type GuidePhone = 'iphone' | 'android'
export type GuideStepId =
  | 'device' | 'explain' | 'phone' | 'mifitness'
  | 'install' | 'automation' | 'webhook' | 'schedule' | 'verify'
  | 'android_soon'

const HAE_STEPS: GuideStepId[] = ['install', 'automation', 'webhook', 'schedule', 'verify']

export function stepsFor(device: DeviceType | null, phone: GuidePhone | null): GuideStepId[] {
  if (device === 'apple_watch') return ['device', 'explain', ...HAE_STEPS]
  if (device === 'xiaomi') {
    if (phone === 'iphone') return ['device', 'explain', 'phone', 'mifitness', ...HAE_STEPS]
    if (phone === 'android') return ['device', 'explain', 'phone', 'android_soon']
    return ['device', 'explain', 'phone']
  }
  return ['device']
}

const STEP_KEY = 'tonus.connectGuideStep'
const PHONE_KEY = 'tonus.connectGuidePhone'
export const DISMISSED_KEY = 'tonus.connectGuideDismissed'

export interface GuideProgress { step: number; phone: GuidePhone | null }

export function loadGuideProgress(): GuideProgress {
  const raw = Number(localStorage.getItem(STEP_KEY) ?? '0')
  const phone = localStorage.getItem(PHONE_KEY)
  return {
    step: Number.isInteger(raw) && raw >= 0 ? raw : 0,
    phone: phone === 'iphone' || phone === 'android' ? phone : null,
  }
}

export function saveGuideProgress(p: GuideProgress): void {
  localStorage.setItem(STEP_KEY, String(p.step))
  if (p.phone) localStorage.setItem(PHONE_KEY, p.phone)
  else localStorage.removeItem(PHONE_KEY)
}

export function clearGuideProgress(): void {
  localStorage.removeItem(STEP_KEY)
  localStorage.removeItem(PHONE_KEY)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/onboarding/guideState.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/guideState.ts src/components/onboarding/guideState.test.ts
git commit -m "feat(guide): логика шагов wizard-а подключения и персист прогресса"
```

---

### Task 2: waitForFirstIngest — ожидание первого приёма

**Files:**
- Create: `src/lib/ingestWait.ts`
- Test: `src/lib/ingestWait.test.ts`

Отдельный модуль, а не `autosync.ts`: `autosync.ts` импортирует supabase-клиент, который падает при импорте в vitest (нет `VITE_SUPABASE_URL`). Здесь — чистая функция с инъекцией поллера.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ingestWait.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitForFirstIngest } from './ingestWait'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('waitForFirstIngest', () => {
  it('успех, когда поллер вернул значение новее baseline', async () => {
    const values = [null, null, '2026-07-06T10:00:00Z']
    const poll = vi.fn(async () => values.shift() ?? '2026-07-06T10:00:00Z')
    const p = waitForFirstIngest(poll, { baseline: null, intervalMs: 5000, timeoutMs: 60000 })
    await vi.advanceTimersByTimeAsync(15000)
    await expect(p).resolves.toBe('ok')
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('значение, равное baseline — не успех (старый приём до гайда)', async () => {
    const poll = vi.fn(async () => '2026-07-01T00:00:00Z')
    const p = waitForFirstIngest(poll, { baseline: '2026-07-01T00:00:00Z', intervalMs: 5000, timeoutMs: 12000 })
    await vi.advanceTimersByTimeAsync(20000)
    await expect(p).resolves.toBe('timeout')
  })

  it('таймаут, если данные так и не пришли', async () => {
    const poll = vi.fn(async () => null)
    const p = waitForFirstIngest(poll, { baseline: null, intervalMs: 5000, timeoutMs: 12000 })
    await vi.advanceTimersByTimeAsync(20000)
    await expect(p).resolves.toBe('timeout')
    // 0мс, 5с, 10с — дальше дедлайн 12с
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('успех на первой же проверке — без ожидания интервала', async () => {
    const poll = vi.fn(async () => '2026-07-06T11:00:00Z')
    const p = waitForFirstIngest(poll, { baseline: null, intervalMs: 5000, timeoutMs: 60000 })
    await vi.advanceTimersByTimeAsync(0)
    await expect(p).resolves.toBe('ok')
    expect(poll).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ingestWait.test.ts`
Expected: FAIL — `Cannot find module './ingestWait'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/ingestWait.ts
// Ожидание первого приёма данных авто-синка: поллим last_ingest_at,
// успех — когда появилось значение, отличное от baseline (снятого до начала теста).
// Поллер инъектируется, чтобы модуль не тянул supabase и тестировался в node.

export interface WaitOpts {
  baseline: string | null
  timeoutMs?: number
  intervalMs?: number
}

export async function waitForFirstIngest(
  poll: () => Promise<string | null>,
  { baseline, timeoutMs = 120_000, intervalMs = 5_000 }: WaitOpts,
): Promise<'ok' | 'timeout'> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const last = await poll()
    if (last != null && last !== baseline) return 'ok'
    if (Date.now() + intervalMs > deadline) return 'timeout'
    await new Promise(r => setTimeout(r, intervalMs))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ingestWait.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestWait.ts src/lib/ingestWait.test.ts
git commit -m "feat(guide): waitForFirstIngest — поллинг первого приёма с baseline"
```

---

### Task 3: каркас ConnectGuide + шаг «Что произойдёт» + роутинг в App.tsx

**Files:**
- Create: `src/components/onboarding/ConnectGuide.tsx`
- Create: `src/components/onboarding/guide/StepExplain.tsx`
- Test: `src/components/onboarding/ConnectGuide.test.ts`
- Modify: `src/App.tsx` (импорты вверху; блок рендера `!hasData || state.view === 'upload'`, сейчас строки ~412-425)
- Modify: `src/lib/translations.ts` (новые ключи)
- Modify: `src/index.css` (стили гайда, в конец файла)

- [ ] **Step 1: Write the failing test**

```ts
// src/components/onboarding/ConnectGuide.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/onboarding/ConnectGuide.test.ts`
Expected: FAIL — `Cannot find module './ConnectGuide'`

- [ ] **Step 3: StepExplain — SVG-сцена «часы → телефон → Tonus»**

```tsx
// src/components/onboarding/guide/StepExplain.tsx
import { useId } from 'react'
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

// Появление элементов сцены по очереди: часы → стрелка → телефон → стрелка → график.
const appear = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, type: 'spring' as const, stiffness: 260, damping: 22 },
})

export function StepExplain() {
  const { t } = useT()
  // useId обязателен: дубликаты id градиентов уже ломали SVG на лендинге.
  const grad = useId()
  return (
    <div className="guide-content">
      <svg width="280" height="120" viewBox="0 0 280 120" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--green, #34d399)" />
            <stop offset="100%" stopColor="var(--yellow, #fbbf24)" />
          </linearGradient>
        </defs>
        {/* часы */}
        <m.g {...appear(0)} stroke="currentColor" strokeWidth="2">
          <rect x="14" y="34" width="36" height="52" rx="9" fill="none" />
          <path d="M22 50h20M22 70h20" />
        </m.g>
        <m.path {...appear(0.35)} d="M60 60h34m0 0-8-8m8 8-8 8" stroke="currentColor" strokeWidth="2" />
        {/* телефон */}
        <m.g {...appear(0.7)} stroke="currentColor" strokeWidth="2">
          <rect x="104" y="22" width="44" height="76" rx="8" fill="none" />
          <path d="M120 90h12" />
        </m.g>
        <m.path {...appear(1.05)} d="M158 60h34m0 0-8-8m8 8-8 8" stroke="currentColor" strokeWidth="2" />
        {/* график Tonus */}
        <m.g {...appear(1.4)}>
          <rect x="202" y="30" width="64" height="60" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M210 76l14-16 12 8 18-22" stroke={`url(#${grad})`} strokeWidth="3" strokeLinecap="round" fill="none" />
        </m.g>
      </svg>
      <h2>{t('Данные будут приходить сами')}</h2>
      <p>{t('Часы → телефон → Tonus. Один раз настроим — дальше всё автоматически, каждый день.')}</p>
    </div>
  )
}
```

- [ ] **Step 4: ConnectGuide — контейнер wizard-а**

```tsx
// src/components/onboarding/ConnectGuide.tsx
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { LazyMotion, domMax, MotionConfig, AnimatePresence, m } from 'motion/react'
import { useT } from '../../lib/i18n'
import type { DeviceType } from '../../store/appStore'
import { DeviceSelectScreen } from './DeviceSelectScreen'
import { StepExplain } from './guide/StepExplain'
import {
  stepsFor, loadGuideProgress, saveGuideProgress, clearGuideProgress,
} from './guideState'

export interface ConnectGuideProps {
  user: User | null
  demo: boolean
  deviceType: DeviceType | null
  onSelectDevice: (d: DeviceType) => void
  onDismiss: () => void // «Пропустить» / выход в ручной импорт CSV
  onDone: () => void    // успех проверки связи → в приложение
}

export function ConnectGuide({ user, demo, deviceType, onSelectDevice, onDismiss, onDone }: ConnectGuideProps) {
  const { t } = useT()
  const [{ step, phone }, setProgress] = useState(loadGuideProgress)

  useEffect(() => { saveGuideProgress({ step, phone }) }, [step, phone])

  const steps = stepsFor(deviceType, phone)
  const idx = Math.min(step, steps.length - 1)
  const stepId = steps[idx]
  const next = () => setProgress(p => ({ ...p, step: idx + 1 }))
  const back = () => setProgress(p => ({ ...p, step: Math.max(0, idx - 1) }))
  const exitToUpload = () => { clearGuideProgress(); onDismiss() }

  // user/demo/onDone/exitToUpload используются шагами задач 4-6.
  void user; void demo; void onDone; void exitToUpload

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <div className="connect-guide">
          <header className="guide-header">
            <div className="guide-dots" aria-hidden="true">
              {steps.map((s, i) => <span key={s} className={`guide-dot${i <= idx ? ' active' : ''}`} />)}
            </div>
            <button className="guide-skip" onClick={onDismiss}>{t('Пропустить')}</button>
          </header>

          <AnimatePresence mode="wait">
            <m.div
              key={stepId}
              className="guide-step"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {stepId === 'device' ? (
                <DeviceSelectScreen onSelect={d => { onSelectDevice(d); next() }} />
              ) : stepId === 'explain' ? (
                <StepExplain />
              ) : null}
            </m.div>
          </AnimatePresence>

          {stepId !== 'device' && (
            <footer className="guide-nav">
              <button className="btn-secondary" onClick={back}>{t('Назад')}</button>
              {idx < steps.length - 1 && (
                <button className="btn-secondary guide-next" onClick={next}>{t('Далее')}</button>
              )}
            </footer>
          )}
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
```

- [ ] **Step 5: Переводы**

В `src/lib/translations.ts`, в секцию `── Онбординг ──` (ключ `'Далее'` и `'Пропустить'` добавлять только если их ещё нет — проверить поиском):

```ts
  // ── Гайд подключения ──────────────────────────────────────
  'Пропустить': { uk: 'Пропустити', en: 'Skip' },
  'Далее': { uk: 'Далі', en: 'Next' },
  'Данные будут приходить сами': { uk: 'Дані надходитимуть самі', en: 'Your data will arrive on its own' },
  'Часы → телефон → Tonus. Один раз настроим — дальше всё автоматически, каждый день.': {
    uk: 'Годинник → телефон → Tonus. Налаштуємо один раз — далі все автоматично, щодня.',
    en: 'Watch → phone → Tonus. Set it up once — everything syncs automatically, every day.',
  },
```

- [ ] **Step 6: Стили — в конец `src/index.css`**

```css
/* ── Гайд подключения устройства ─────────────────────────── */
.connect-guide { display: flex; flex-direction: column; min-height: 72vh; max-width: 560px; margin: 0 auto; padding: 16px; }
.guide-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.guide-dots { display: flex; gap: 6px; }
.guide-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: 0.18; transition: opacity 0.3s; }
.guide-dot.active { opacity: 0.9; }
.guide-skip { background: none; border: none; color: inherit; opacity: 0.55; cursor: pointer; font-size: 13px; padding: 6px; }
.guide-step { flex: 1; display: flex; flex-direction: column; }
.guide-content { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; padding-top: 20px; }
.guide-content h2 { font-size: 22px; margin: 0; }
.guide-content p { margin: 0; opacity: 0.75; max-width: 420px; line-height: 1.5; }
.guide-cta { display: inline-block; padding: 12px 22px; border-radius: 12px; background: var(--green, #34d399); color: #08221a; text-decoration: none; font-weight: 600; }
.guide-nav { display: flex; justify-content: space-between; gap: 10px; padding: 16px 0; }
.guide-next { margin-left: auto; }
.guide-url { display: flex; gap: 8px; align-items: center; width: 100%; max-width: 460px; }
.guide-url code { flex: 1; overflow-wrap: anywhere; font-size: 12px; padding: 10px; border: 1px solid currentColor; border-radius: 10px; opacity: 0.8; }
.guide-phone-frame { width: 230px; min-height: 290px; border: 2px solid currentColor; border-radius: 24px; padding: 16px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; overflow: hidden; text-align: left; }
.guide-phone-row { padding: 8px 10px; border: 1px solid currentColor; border-radius: 10px; opacity: 0.75; font-size: 13px; width: 100%; }
.guide-phone-row.hl { opacity: 1; border-color: var(--green, #34d399); color: var(--green, #34d399); }
.guide-checklist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; text-align: left; max-width: 420px; }
.guide-pulse { width: 72px; height: 72px; border-radius: 50%; background: var(--green, #34d399); }
.guide-success { color: var(--green, #34d399); }
.guide-overlay { position: fixed; inset: 0; z-index: 1000; background: var(--bg, #0e0f13); overflow-y: auto; }
```

Примечание: если в `src/index.css` фон приложения задаётся другой переменной (не `--bg`) — использовать её в `.guide-overlay` (посмотреть, чем красится `body`).

- [ ] **Step 7: Роутинг в App.tsx**

Добавить импорт рядом с `DeviceSelectScreen` (строка ~3):

```tsx
import { ConnectGuide } from './components/onboarding/ConnectGuide'
import { DISMISSED_KEY } from './components/onboarding/guideState'
```

Внутри компонента `App`, рядом с остальными `useState`:

```tsx
const [guideDismissed, setGuideDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
function dismissGuide() {
  localStorage.setItem(DISMISSED_KEY, '1')
  setGuideDismissed(true)
}
```

Блок рендера (сейчас строки ~412-425) заменить на:

```tsx
{!hasData || state.view === 'upload' ? (
  !hasData && !guideDismissed ? (
    <ConnectGuide
      user={user}
      demo={demo}
      deviceType={state.deviceType}
      onSelectDevice={setDeviceType}
      onDismiss={dismissGuide}
      onDone={dismissGuide}
    />
  ) : state.deviceType == null ? (
    <DeviceSelectScreen onSelect={setDeviceType} />
  ) : (
    <UploadScreen
      onProgress={setProgress}
      onDone={(daily, samples, filename) => handleDone(daily, samples, filename)}
      onEvents={e => handleEvents(e, 'ics')}
      onError={setError}
      progress={state.parseProgress}
      error={state.error}
      deviceType={state.deviceType}
    />
  )
) : state.view === 'dashboard' ? (
```

Поведение: новый пользователь без данных видит гайд; «Пропустить» или выход в CSV — старый флоу (DeviceSelect/Upload); демо и пользователи с данными не затронуты (у них `hasData === true`).

- [ ] **Step 8: Run tests and build**

Run: `npx vitest run src/components/onboarding && npm run build`
Expected: тесты PASS, сборка без ошибок

- [ ] **Step 9: Commit**

```bash
git add src/components/onboarding/ConnectGuide.tsx src/components/onboarding/ConnectGuide.test.ts \
  src/components/onboarding/guide/StepExplain.tsx src/App.tsx src/lib/translations.ts src/index.css
git commit -m "feat(guide): каркас wizard-а подключения — прогресс, скип, шаг-схема"
```

---

### Task 4: шаги ветки Apple — установка HAE, автоматизация, вебхук, расписание

**Files:**
- Create: `src/components/onboarding/guide/StepInstallHAE.tsx`
- Create: `src/components/onboarding/guide/StepAutomation.tsx`
- Create: `src/components/onboarding/guide/StepWebhook.tsx`
- Create: `src/components/onboarding/guide/StepSchedule.tsx`
- Modify: `src/components/onboarding/ConnectGuide.tsx` (рендер шагов)
- Modify: `src/components/onboarding/ConnectGuide.test.ts` (ключи)
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Дополнить GUIDE_KEYS в тесте (падающий тест)**

В `ConnectGuide.test.ts` добавить в массив `GUIDE_KEYS`:

```ts
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
```

Run: `npx vitest run src/components/onboarding/ConnectGuide.test.ts`
Expected: FAIL — missing translation for "Установи Health Auto Export"

- [ ] **Step 2: Переводы**

В `translations.ts`, в секцию «Гайд подключения»:

```ts
  'Установи Health Auto Export': { uk: 'Установи Health Auto Export', en: 'Install Health Auto Export' },
  'Это приложение само отправляет данные Apple Health в Tonus. Есть бесплатный пробный период — хватит, чтобы всё проверить.': {
    uk: 'Цей застосунок сам надсилає дані Apple Health у Tonus. Є безкоштовний пробний період — вистачить, щоб усе перевірити.',
    en: 'This app sends your Apple Health data to Tonus automatically. It has a free trial — enough to check everything works.',
  },
  'Открыть в App Store': { uk: 'Відкрити в App Store', en: 'Open in App Store' },
  'Создай автоматизацию': { uk: 'Створи автоматизацію', en: 'Create an automation' },
  'В Health Auto Export открой вкладку Automations и нажми «+».': {
    uk: 'У Health Auto Export відкрий вкладку Automations і натисни «+».',
    en: 'In Health Auto Export, open the Automations tab and tap “+”.',
  },
  'Automations → «+»': { uk: 'Automations → «+»', en: 'Automations → “+”' },
  'Тип: REST API': { uk: 'Тип: REST API', en: 'Type: REST API' },
  'Метод POST · Формат JSON': { uk: 'Метод POST · Формат JSON', en: 'Method POST · Format JSON' },
  'Вставь адрес Tonus': { uk: 'Встав адресу Tonus', en: 'Paste your Tonus address' },
  'Скопируй персональную ссылку и вставь её в поле URL автоматизации.': {
    uk: 'Скопіюй персональне посилання та встав його в поле URL автоматизації.',
    en: 'Copy your personal link and paste it into the automation URL field.',
  },
  'Выбери данные и расписание': { uk: 'Вибери дані та розклад', en: 'Choose data and schedule' },
  'Включи все метрики здоровья и сон': { uk: 'Увімкни всі метрики здоровʼя і сон', en: 'Enable all health metrics and sleep' },
  'Интервал — каждые 1-3 часа': { uk: 'Інтервал — кожні 1-3 години', en: 'Interval — every 1-3 hours' },
  'Не забудь включить автоматизацию (Enable)': { uk: 'Не забудь увімкнути автоматизацію (Enable)', en: 'Don’t forget to switch the automation on (Enable)' },
```

- [ ] **Step 3: StepInstallHAE**

```tsx
// src/components/onboarding/guide/StepInstallHAE.tsx
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

// Официальная страница HAE в App Store (Lybron/HealthyApps).
export const HAE_APPSTORE_URL = 'https://apps.apple.com/app/id1115567069'

export function StepInstallHAE() {
  const { t } = useT()
  return (
    <div className="guide-content">
      <m.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="80" height="80" rx="20" stroke="currentColor" strokeWidth="2" />
          <path d="M44 24v28m0 0-11-11m11 11 11-11M28 62h32" stroke="var(--green, #34d399)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </m.div>
      <h2>{t('Установи Health Auto Export')}</h2>
      <p>{t('Это приложение само отправляет данные Apple Health в Tonus. Есть бесплатный пробный период — хватит, чтобы всё проверить.')}</p>
      <a className="guide-cta" href={HAE_APPSTORE_URL} target="_blank" rel="noreferrer">{t('Открыть в App Store')}</a>
    </div>
  )
}
```

- [ ] **Step 4: StepAutomation — мини-скринкаст**

```tsx
// src/components/onboarding/guide/StepAutomation.tsx
import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useT } from '../../../lib/i18n'

// Стилизованные «экраны» HAE вместо скриншотов: не устареют при обновлениях
// интерфейса HAE и переводятся вместе с остальным UI.
const FRAMES = ['plus', 'type', 'format'] as const

export function StepAutomation() {
  const { t } = useT()
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), 2500)
    return () => clearInterval(id)
  }, [])
  const f = FRAMES[frame]
  return (
    <div className="guide-content">
      <AnimatePresence mode="wait">
        <m.div
          key={f}
          className="guide-phone-frame"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25 }}
        >
          {f === 'plus' ? (
            <>
              <div className="guide-phone-row">Automations</div>
              <div className="guide-phone-row hl">{t('Automations → «+»')}</div>
            </>
          ) : f === 'type' ? (
            <>
              <div className="guide-phone-row">Automations</div>
              <div className="guide-phone-row hl">{t('Тип: REST API')}</div>
              <div className="guide-phone-row">MQTT</div>
              <div className="guide-phone-row">Home Assistant</div>
            </>
          ) : (
            <>
              <div className="guide-phone-row">REST API</div>
              <div className="guide-phone-row hl">{t('Метод POST · Формат JSON')}</div>
            </>
          )}
        </m.div>
      </AnimatePresence>
      <h2>{t('Создай автоматизацию')}</h2>
      <p>{t('В Health Auto Export открой вкладку Automations и нажми «+».')}</p>
    </div>
  )
}
```

- [ ] **Step 5: StepWebhook**

```tsx
// src/components/onboarding/guide/StepWebhook.tsx
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { ensureToken, webhookUrl } from '../../../lib/autosync'

export function StepWebhook({ user, demo }: { user: User | null; demo: boolean }) {
  const { t } = useT()
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (demo || !user) {
      setUrl('https://demo.tonus.app/functions/v1/ingest-health?token=demo')
      return
    }
    ensureToken(user.id).then(tok => setUrl(webhookUrl(tok.token)))
  }, [user, demo])

  function copy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="guide-content">
      <h2>{t('Вставь адрес Tonus')}</h2>
      <p>{t('Скопируй персональную ссылку и вставь её в поле URL автоматизации.')}</p>
      <div className="guide-url">
        <code>{url || '…'}</code>
      </div>
      <m.button
        className="guide-cta"
        style={{ border: 'none', cursor: 'pointer' }}
        onClick={copy}
        whileTap={{ scale: 0.95 }}
        animate={copied ? { scale: [1, 1.08, 1] } : {}}
      >
        {copied ? t('Скопировано') : t('Копировать')}
      </m.button>
    </div>
  )
}
```

(`'Копировать'`/`'Скопировано'` уже есть в словаре — используются в AutoSyncSettings; в GUIDE_KEYS их не дублируем.)

- [ ] **Step 6: StepSchedule**

```tsx
// src/components/onboarding/guide/StepSchedule.tsx
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

const ITEMS = [
  'Включи все метрики здоровья и сон',
  'Интервал — каждые 1-3 часа',
  'Не забудь включить автоматизацию (Enable)',
]

export function StepSchedule() {
  const { t } = useT()
  return (
    <div className="guide-content">
      <h2>{t('Выбери данные и расписание')}</h2>
      <ul className="guide-checklist">
        {ITEMS.map((item, i) => (
          <m.li
            key={item}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.25 }}
          >
            ✅ {t(item)}
          </m.li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 7: Подключить шаги в ConnectGuide**

В `ConnectGuide.tsx` добавить импорты:

```tsx
import { StepInstallHAE } from './guide/StepInstallHAE'
import { StepAutomation } from './guide/StepAutomation'
import { StepWebhook } from './guide/StepWebhook'
import { StepSchedule } from './guide/StepSchedule'
```

и расширить рендер шага (внутри `m.div className="guide-step"`):

```tsx
              {stepId === 'device' ? (
                <DeviceSelectScreen onSelect={d => { onSelectDevice(d); next() }} />
              ) : stepId === 'explain' ? (
                <StepExplain />
              ) : stepId === 'install' ? (
                <StepInstallHAE />
              ) : stepId === 'automation' ? (
                <StepAutomation />
              ) : stepId === 'webhook' ? (
                <StepWebhook user={user} demo={demo} />
              ) : stepId === 'schedule' ? (
                <StepSchedule />
              ) : null}
```

Убрать `void user; void demo;` из заглушки Task 3 (оставить `void onDone; void exitToUpload` — они понадобятся в задачах 5-6).

- [ ] **Step 8: Run tests and build**

Run: `npx vitest run src/components/onboarding && npm run build`
Expected: PASS, сборка чистая

- [ ] **Step 9: Commit**

```bash
git add src/components/onboarding src/lib/translations.ts
git commit -m "feat(guide): шаги ветки Apple — HAE, автоматизация, вебхук, расписание"
```

---

### Task 5: StepVerify — живая проверка связи

**Files:**
- Create: `src/components/onboarding/guide/StepVerify.tsx`
- Modify: `src/components/onboarding/ConnectGuide.tsx`
- Modify: `src/components/onboarding/ConnectGuide.test.ts`
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Дополнить GUIDE_KEYS (падающий тест)**

```ts
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
```

Run: `npx vitest run src/components/onboarding/ConnectGuide.test.ts` → FAIL (missing translations)

- [ ] **Step 2: Переводы**

```ts
  'Проверим связь': { uk: 'Перевіримо звʼязок', en: 'Let’s test the connection' },
  'Открой Health Auto Export и нажми Manual Export — мы ждём данные.': {
    uk: 'Відкрий Health Auto Export і натисни Manual Export — ми чекаємо на дані.',
    en: 'Open Health Auto Export and tap Manual Export — we’re waiting for your data.',
  },
  'Слушаем эфир…': { uk: 'Слухаємо ефір…', en: 'Listening…' },
  'Данные пришли!': { uk: 'Дані надійшли!', en: 'Data received!' },
  'Первые графики появятся после следующей синхронизации.': {
    uk: 'Перші графіки зʼявляться після наступної синхронізації.',
    en: 'Your first charts will appear after the next sync.',
  },
  'В приложение': { uk: 'До застосунку', en: 'Open the app' },
  'Пока ничего не пришло. Проверь:': { uk: 'Поки нічого не надійшло. Перевір:', en: 'Nothing arrived yet. Check:' },
  'URL вставлен целиком, вместе с token=': { uk: 'URL вставлено повністю, разом із token=', en: 'The URL is pasted in full, including token=' },
  'Метод — POST, формат — JSON': { uk: 'Метод — POST, формат — JSON', en: 'Method — POST, format — JSON' },
  'Автоматизация включена (Enable)': { uk: 'Автоматизацію увімкнено (Enable)', en: 'The automation is switched on (Enable)' },
  'Проверить ещё раз': { uk: 'Перевірити ще раз', en: 'Try again' },
```

- [ ] **Step 3: StepVerify**

```tsx
// src/components/onboarding/guide/StepVerify.tsx
import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { loadToken } from '../../../lib/autosync'
import { waitForFirstIngest } from '../../../lib/ingestWait'

const CHECKLIST = [
  'URL вставлен целиком, вместе с token=',
  'Метод — POST, формат — JSON',
  'Автоматизация включена (Enable)',
]

export function StepVerify({ user, demo, onDone }: { user: User | null; demo: boolean; onDone: () => void }) {
  const { t } = useT()
  // В демо (и без юзера) поллить нечего — сразу показываем успех.
  const [status, setStatus] = useState<'waiting' | 'ok' | 'timeout'>(demo || !user ? 'ok' : 'waiting')
  const [attempt, setAttempt] = useState(0)
  // baseline снимаем один раз: старый last_ingest_at (до гайда) — не успех.
  const baseline = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (demo || !user || status !== 'waiting') return
    let cancelled = false
    ;(async () => {
      if (baseline.current === undefined) {
        baseline.current = (await loadToken(user.id))?.last_ingest_at ?? null
      }
      const res = await waitForFirstIngest(
        async () => (await loadToken(user.id))?.last_ingest_at ?? null,
        { baseline: baseline.current },
      )
      if (!cancelled) setStatus(res)
    })()
    return () => { cancelled = true }
  }, [user, demo, attempt, status])

  return (
    <div className="guide-content">
      {status === 'waiting' ? (
        <>
          <m.div
            className="guide-pulse"
            animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.9, 0.45] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          />
          <h2>{t('Проверим связь')}</h2>
          <p>{t('Открой Health Auto Export и нажми Manual Export — мы ждём данные.')}</p>
          <p style={{ opacity: 0.5, fontSize: 13 }}>{t('Слушаем эфир…')}</p>
        </>
      ) : status === 'ok' ? (
        <>
          <m.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
            <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden="true">
              <circle cx="44" cy="44" r="40" stroke="var(--green, #34d399)" strokeWidth="3" />
              <m.path
                d="M28 46l11 11 21-25"
                stroke="var(--green, #34d399)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.4 }}
              />
            </svg>
          </m.div>
          <h2 className="guide-success">{t('Данные пришли!')}</h2>
          <p>{t('Первые графики появятся после следующей синхронизации.')}</p>
          <button className="guide-cta" style={{ border: 'none', cursor: 'pointer' }} onClick={onDone}>
            {t('В приложение')}
          </button>
        </>
      ) : (
        <>
          <h2>{t('Пока ничего не пришло. Проверь:')}</h2>
          <ul className="guide-checklist">
            {CHECKLIST.map(item => <li key={item}>• {t(item)}</li>)}
          </ul>
          <button
            className="guide-cta" style={{ border: 'none', cursor: 'pointer' }}
            onClick={() => { setStatus('waiting'); setAttempt(a => a + 1) }}
          >
            {t('Проверить ещё раз')}
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Подключить в ConnectGuide**

Импорт: `import { StepVerify } from './guide/StepVerify'`. В рендер шагов добавить ветку:

```tsx
              ) : stepId === 'verify' ? (
                <StepVerify user={user} demo={demo} onDone={() => { clearGuideProgress(); onDone() }} />
```

Убрать `void onDone` из заглушки Task 3. На шаге `verify` «Далее» не рендерится сам (он последний в массиве), кнопку `guide-nav` «Назад» оставить — можно вернуться к расписанию.

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run src/components/onboarding src/lib/ingestWait.test.ts && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding src/lib/translations.ts
git commit -m "feat(guide): живая проверка связи — пульс, успех, чеклист таймаута"
```

---

### Task 6: ветка Xiaomi — телефон, Mi Fitness (B1), заглушка Android, выход в CSV

**Files:**
- Create: `src/components/onboarding/guide/StepPhone.tsx`
- Create: `src/components/onboarding/guide/StepMiFitness.tsx`
- Create: `src/components/onboarding/guide/StepAndroidSoon.tsx`
- Modify: `src/components/onboarding/ConnectGuide.tsx`
- Modify: `src/components/onboarding/ConnectGuide.test.ts`
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Дополнить GUIDE_KEYS (падающий тест)**

```ts
  // Task 6 — ветка Xiaomi
  'Какой у тебя телефон?',
  'Разовый импорт CSV',
  'Включи синк с Apple Health',
  'В Mi Fitness: Профиль → Настройки → Apple Health → разреши запись данных. Дальше настроим как для Apple Watch.',
  'Авто-синхронизация для Android скоро',
  'Пока используй разовый импорт CSV с account.xiaomi.com — мы сообщим, когда авто-синк будет готов.',
```

Run: `npx vitest run src/components/onboarding/ConnectGuide.test.ts` → FAIL

- [ ] **Step 2: Переводы**

```ts
  'Какой у тебя телефон?': { uk: 'Який у тебе телефон?', en: 'What phone do you have?' },
  'Разовый импорт CSV': { uk: 'Разовий імпорт CSV', en: 'One-time CSV import' },
  'Включи синк с Apple Health': { uk: 'Увімкни синхронізацію з Apple Health', en: 'Enable Apple Health sync' },
  'В Mi Fitness: Профиль → Настройки → Apple Health → разреши запись данных. Дальше настроим как для Apple Watch.': {
    uk: 'У Mi Fitness: Профіль → Налаштування → Apple Health → дозволь запис даних. Далі налаштуємо як для Apple Watch.',
    en: 'In Mi Fitness: Profile → Settings → Apple Health → allow writing data. Then we set up the rest just like for Apple Watch.',
  },
  'Авто-синхронизация для Android скоро': { uk: 'Авто-синхронізація для Android незабаром', en: 'Auto-sync for Android is coming soon' },
  'Пока используй разовый импорт CSV с account.xiaomi.com — мы сообщим, когда авто-синк будет готов.': {
    uk: 'Поки що використовуй разовий імпорт CSV з account.xiaomi.com — ми повідомимо, коли авто-синк буде готовий.',
    en: 'For now, use the one-time CSV import from account.xiaomi.com — we’ll let you know when auto-sync is ready.',
  },
```

- [ ] **Step 3: StepPhone**

```tsx
// src/components/onboarding/guide/StepPhone.tsx
import { useT } from '../../../lib/i18n'
import type { GuidePhone } from '../guideState'

export function StepPhone({ onPick, onCsv }: { onPick: (p: GuidePhone) => void; onCsv: () => void }) {
  const { t } = useT()
  return (
    <div className="guide-content">
      <h2>{t('Какой у тебя телефон?')}</h2>
      <div className="device-select-grid">
        <button className="device-card" onClick={() => onPick('iphone')}>
          <div className="device-card-title">iPhone</div>
        </button>
        <button className="device-card" onClick={() => onPick('android')}>
          <div className="device-card-title">Android</div>
        </button>
      </div>
      <button className="guide-skip" onClick={onCsv}>{t('Разовый импорт CSV')}</button>
    </div>
  )
}
```

- [ ] **Step 4: StepMiFitness (это и есть B1 из SPEC-BANDS-AUTOSYNC)**

```tsx
// src/components/onboarding/guide/StepMiFitness.tsx
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

export function StepMiFitness() {
  const { t } = useT()
  return (
    <div className="guide-content">
      <m.div
        className="guide-phone-frame"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <div className="guide-phone-row">Mi Fitness</div>
        <div className="guide-phone-row">{t('Профиль')} → {t('Настройки')}</div>
        <div className="guide-phone-row hl">Apple Health ✓</div>
      </m.div>
      <h2>{t('Включи синк с Apple Health')}</h2>
      <p>{t('В Mi Fitness: Профиль → Настройки → Apple Health → разреши запись данных. Дальше настроим как для Apple Watch.')}</p>
    </div>
  )
}
```

(`'Профиль'` — если ключа нет в словаре, добавить: `{ uk: 'Профіль', en: 'Profile' }`; `'Настройки'` уже есть.)

- [ ] **Step 5: StepAndroidSoon**

```tsx
// src/components/onboarding/guide/StepAndroidSoon.tsx
import { useT } from '../../../lib/i18n'

export function StepAndroidSoon({ onCsv }: { onCsv: () => void }) {
  const { t } = useT()
  return (
    <div className="guide-content">
      <h2>{t('Авто-синхронизация для Android скоро')}</h2>
      <p>{t('Пока используй разовый импорт CSV с account.xiaomi.com — мы сообщим, когда авто-синк будет готов.')}</p>
      <button className="guide-cta" style={{ border: 'none', cursor: 'pointer' }} onClick={onCsv}>
        {t('Разовый импорт CSV')}
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Подключить в ConnectGuide**

Импорты:

```tsx
import { StepPhone } from './guide/StepPhone'
import { StepMiFitness } from './guide/StepMiFitness'
import { StepAndroidSoon } from './guide/StepAndroidSoon'
```

Ветки рендера:

```tsx
              ) : stepId === 'phone' ? (
                <StepPhone
                  onPick={ph => setProgress({ step: idx + 1, phone: ph })}
                  onCsv={exitToUpload}
                />
              ) : stepId === 'mifitness' ? (
                <StepMiFitness />
              ) : stepId === 'android_soon' ? (
                <StepAndroidSoon onCsv={exitToUpload} />
```

Убрать оставшийся `void exitToUpload`. Теперь заглушек `void` в ConnectGuide нет.

`exitToUpload` вызывает `onDismiss` → в App это `dismissGuide` → пользователь попадает в старый флоу: `deviceType='xiaomi'` уже выбран, откроется `UploadScreen` с текущей инструкцией CSV.

- [ ] **Step 7: Run tests and build**

Run: `npx vitest run src/components/onboarding && npm run build`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/onboarding src/lib/translations.ts
git commit -m "feat(guide): ветка Xiaomi — Mi Fitness через Apple Health (B1) и заглушка Android"
```

---

### Task 7: вход из настроек — «Как подключить устройство»

**Files:**
- Modify: `src/components/settings/SettingsScreen.tsx` ⚠️ в дереве есть незакоммиченные правки этого файла — работать поверх них, коммитить только свои ханки (`git add -p`)
- Modify: `src/components/onboarding/ConnectGuide.test.ts`
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Дополнить GUIDE_KEYS (падающий тест)**

```ts
  // Task 7 — вход из настроек
  'Подключение устройства',
  'Как подключить устройство',
```

Run: `npx vitest run src/components/onboarding/ConnectGuide.test.ts` → FAIL

- [ ] **Step 2: Переводы**

```ts
  'Подключение устройства': { uk: 'Підключення пристрою', en: 'Device connection' },
  'Как подключить устройство': { uk: 'Як підключити пристрій', en: 'How to connect a device' },
```

- [ ] **Step 3: Секция в SettingsScreen**

Импорты (вверху файла):

```tsx
import { ConnectGuide } from '../onboarding/ConnectGuide'
import { clearGuideProgress } from '../onboarding/guideState'
import { isDemoActive } from '../../lib/demo'
```

Состояние (рядом с остальными `useState` компонента):

```tsx
const [showGuide, setShowGuide] = useState(false)
```

Новая секция — вставить **перед** секцией с `<AutoSyncSettings`:

```tsx
<section className="settings-section">
  <h3 className="settings-section-title">{t('Подключение устройства')}</h3>
  <button
    className="btn-secondary"
    onClick={() => { clearGuideProgress(); setShowGuide(true) }}
  >
    {t('Как подключить устройство')}
  </button>
</section>
```

Оверлей — в самом конце JSX компонента (внутри корневого элемента):

```tsx
{showGuide && (
  <div className="guide-overlay">
    <ConnectGuide
      user={user}
      demo={isDemoActive()}
      deviceType={deviceType}
      onSelectDevice={onDeviceTypeChange}
      onDismiss={() => setShowGuide(false)}
      onDone={() => setShowGuide(false)}
    />
  </div>
)}
```

`user`, `deviceType`, `onDeviceTypeChange` — уже пропсы SettingsScreen (см. вызов в `App.tsx:477-492`). Если сигнатуры пропсов слегка отличаются от ожидаемых — подстроиться под фактические имена в файле.

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run src/components/onboarding && npm run build`
Expected: PASS

- [ ] **Step 5: Ручная проверка в демо**

```bash
npm run dev
```

Открыть http://localhost:5173 → «Посмотреть демо» → Настройки → «Как подключить устройство»: гайд открывается оверлеем, листается, «Пропустить» закрывает. Проверить шаг verify — в демо сразу успех.

- [ ] **Step 6: Commit (только свои ханки!)**

```bash
git add -p src/components/settings/SettingsScreen.tsx
git add src/components/onboarding/ConnectGuide.test.ts src/lib/translations.ts
git commit -m "feat(guide): вход в гайд подключения из настроек (оверлей)"
```

---

### Task 8: e2e-гард и финальная верификация

**Files:**
- Create: `e2e/guide.spec.ts`

- [ ] **Step 1: Write the e2e test**

```ts
// e2e/guide.spec.ts
import { test, expect } from '@playwright/test'

// Гард витрины: гайд подключения открывается из настроек в демо
// и доводит до успешной «проверки связи». Если он сломан —
// новый пользователь не сможет подключить часы.

test('connect guide walks from settings to verify success in demo', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('tonus_demo', '1'))
  await page.goto('/#settings')
  await page.reload()

  await page
    .getByRole('button', { name: /Как подключить устройство|Як підключити пристрій|How to connect a device/i })
    .click()

  // шаг 1 — выбор устройства (переиспользованный DeviceSelectScreen)
  await page.getByText('Apple Watch', { exact: true }).click()

  // шаг 2 — «что произойдёт»
  await expect(
    page.getByText(/Данные будут приходить сами|Дані надходитимуть самі|Your data will arrive on its own/),
  ).toBeVisible()

  const next = page.getByRole('button', { name: /^(Далее|Далі|Next)$/ })
  await next.click() // install
  await expect(page.getByText(/Health Auto Export/).first()).toBeVisible()
  await next.click() // automation
  await next.click() // webhook
  await next.click() // schedule
  await next.click() // verify

  // в демо проверка связи сразу успешна
  await expect(
    page.getByText(/Данные пришли!|Дані надійшли!|Data received!/),
  ).toBeVisible()
})
```

- [ ] **Step 2: Run the e2e test**

Run: `npx playwright test e2e/guide.spec.ts`
Expected: PASS. Если селектор кнопки/текста не совпал — смотреть фактический DOM через `npx playwright test --debug`, чинить тест или компонент (не ослаблять проверку успеха).

- [ ] **Step 3: Полный прогон всего**

```bash
npm test && npm run build && npx playwright test
npm run lint
```

Expected: vitest и playwright зелёные, build чистый. Lint: в проекте есть pre-existing ошибки — новых быть не должно (сравнить количество с `git stash`-ом при сомнении).

- [ ] **Step 4: Commit**

```bash
git add e2e/guide.spec.ts
git commit -m "test(e2e): гард гайда подключения — из настроек до успешной проверки связи"
```

- [ ] **Step 5: Финальная ручная приёмка (по спеке §6)**

На реальном телефоне: новый аккаунт → пройти гайд → Manual Export в HAE → увидеть чекмарк. Цель ≤ 5 минут. Это ручной шаг владельца проекта — отметить в отчёте, что он остаётся за пользователем.

---

## Что остаётся после этого плана

- **SPEC-BANDS B2:** разведка на реальном Android (экспортёры Health Connect, снятие payload'ов) — ручная работа владельца, блокирует B3-B5.
- **SPEC-BANDS B3-B5:** детектор формата в `ingest-health`, `source_platform`, правки настроек — отдельный план после B2. Деплой edge-функции: `npx supabase functions deploy ingest-health --project-ref <ref> --no-verify-jwt` (флаг критичен, иначе 401).
- Открытый вопрос спеки: включать ли live-режим сразу новым пользователям — решить при B-этапах, пока дефолт shadow.
