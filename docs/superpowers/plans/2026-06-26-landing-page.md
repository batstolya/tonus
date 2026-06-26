# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Публичный анимированный лендинг-витрина перед экраном входа: показывается незалогиненному посетителю, объясняет продукт, ведёт к регистрации/входу.

**Architecture:** Новый `LandingScreen` рендерится в ветке `!user` приложения ([src/App.tsx](../../../src/App.tsx)) вместо прыжка сразу в `AuthScreen`. Кнопка «Попробовать» переключает локальное состояние `showAuth` → показывает существующий `AuthScreen`. Анимации — чистый CSS `@keyframes`, запускаются по скроллу через хук `useInView` (IntersectionObserver). Переиспользуем `TelegramDemo` и общий `Counter`. Роутинг не трогаем (условный рендер, как сейчас).

**Tech Stack:** React 19, TypeScript, Vite, Vitest (env: node), существующий i18n (`useT`/`translations`), CSS-переменные темы из `src/index.css`.

**Тестовая стратегия (важно):** окружение тестов — `node`, рендер React-компонентов недоступен. Поэтому: чистую логику (гейтинг) тестируем юнит-тестами по-настоящему (TDD); компоненты — по «домашнему» паттерну из `TelegramDemo.test.ts` (проверка экспорта + покрытие переводов uk/en); визуальную корректность блоков — ручной проверкой в dev-сервере. Никаких jsdom-рендер-тестов (они тут не запустятся).

**Соглашение по языку:** проза — по-русски, код/команды — на английском. UI-строки — русские ключи через `t(...)`, переводы uk/en добавляются в `translations.ts` и охраняются тестом покрытия.

---

## Структура файлов

- `src/components/ui/Counter.tsx` — **создать**: общий счётчик 0→N (вынос из TelegramDemo). Используется в TelegramDemo и блоках лендинга.
- `src/components/landing/useInView.ts` — **создать**: хук запуска анимации по попаданию во вьюпорт + учёт `prefers-reduced-motion`.
- `src/components/landing/gating.ts` — **создать**: чистые функции `isResetUrl`, `unauthedView`.
- `src/components/landing/gating.test.ts` — **создать**: юнит-тесты гейтинга.
- `src/components/landing/LandingScreen.tsx` — **создать**: оркестратор (топбар + секции блоков + финальный CTA).
- `src/components/landing/Landing.css` — **создать**: стили лендинга и все `@keyframes`.
- `src/components/landing/Landing.test.ts` — **создать**: экспорт + покрытие переводов (растёт по мере добавления блоков).
- `src/components/landing/blocks/HeroBlock.tsx` — **создать**: блок 1.
- `src/components/landing/blocks/MetricsBlock.tsx` — **создать**: блок 2 (дашборд/метрики).
- `src/components/landing/blocks/InsightsBlock.tsx` — **создать**: блок 3 (AI-инсайты).
- `src/components/landing/blocks/ChatBlock.tsx` — **создать**: блок 4 (в приложении ↔ Telegram).
- `src/components/landing/blocks/ExperimentsBlock.tsx` — **создать**: блок 5 (N-of-1).
- `src/components/landing/blocks/FeatureGrid.tsx` — **создать**: блок 6 (сетка фич).
- `src/components/auth/TelegramDemo.tsx` — **изменить**: использовать общий `Counter`.
- `src/components/auth/AuthScreen.tsx` — **изменить**: проп `onBack` + кнопка «← На главную».
- `src/App.tsx` — **изменить**: состояние `showAuth` + гейтинг ветки `!user`.
- `src/lib/translations.ts` — **изменить**: новые строки uk/en.

---

## Task 1: Вынести общий `Counter`

Рефакторинг без смены поведения: счётчик `Counter` сейчас объявлен внутри `TelegramDemo.tsx` (строки ~18–44). Выносим в общий модуль, чтобы переиспользовать в блоках лендинга. Стилевой класс `.tg-counter` сохраняем через проп `className`.

**Files:**
- Create: `src/components/ui/Counter.tsx`
- Modify: `src/components/auth/TelegramDemo.tsx`
- Test (existing, must stay green): `src/components/auth/TelegramDemo.test.ts`

- [ ] **Step 1: Создать `Counter.tsx`**

```tsx
import { useEffect, useState } from 'react'

// Анимирует число 0 → value за duration секунд, старт через delay секунд.
// className пробрасывается наружу (TelegramDemo передаёт "tg-counter" ради своих стилей).
export function Counter({
  value,
  delay = 0,
  duration = 1.2,
  className,
}: {
  value: number
  delay?: number
  duration?: number
  className?: string
}) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined
    const startId = setTimeout(() => {
      let current = 0
      const increment = value / (duration * 60) // ~60fps
      intervalId = setInterval(() => {
        current += increment
        if (current >= value) {
          setDisplay(value)
          if (intervalId) clearInterval(intervalId)
        } else {
          setDisplay(Math.floor(current))
        }
      }, 1000 / 60)
    }, delay * 1000)

    return () => {
      clearTimeout(startId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [value, delay, duration])

  return <span className={className}>{display}</span>
}

export default Counter
```

- [ ] **Step 2: Обновить `TelegramDemo.tsx`**

Удалить локальное определение `function Counter(...)` (строки ~17–44). Добавить импорт вверху рядом с другими:

```tsx
import Counter from '../ui/Counter'
```

Заменить единственное использование (в Scene2) на вариант с классом:

```tsx
<Counter value={550} delay={6.4} className="tg-counter" />
```

- [ ] **Step 3: Прогнать тесты и сборку**

Run: `npm test`
Expected: PASS (в т.ч. `TelegramDemo` — экспорт и переводы не изменились).

Run: `npm run build`
Expected: компилируется без ошибок типов.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Counter.tsx src/components/auth/TelegramDemo.tsx
git commit -m "refactor(counter): extract shared Counter from TelegramDemo"
```

---

## Task 2: Хук `useInView`

Запуск анимаций по скроллу. В node-окружении тестов `IntersectionObserver` нет и хук не рендерится — поэтому юнит-теста нет, проверка через сборку и ручной скролл (Task 12). Хук должен корректно деградировать: если `IntersectionObserver` недоступен или включён `prefers-reduced-motion` — сразу `inView = true` (показываем финальное состояние).

**Files:**
- Create: `src/components/landing/useInView.ts`

- [ ] **Step 1: Создать `useInView.ts`**

```ts
import { useEffect, useRef, useState } from 'react'

// [ref, inView]. inView → true, когда элемент впервые попал во вьюпорт.
// Деградация: нет IntersectionObserver или reduce-motion → сразу true.
export function useInView<T extends HTMLElement = HTMLDivElement>(opts?: {
  threshold?: number
  once?: boolean
}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  const once = opts?.once ?? true
  const threshold = opts?.threshold ?? 0.25

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true)
            if (once) obs.disconnect()
          } else if (!once) {
            setInView(false)
          }
        }
      },
      { threshold },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [once, threshold])

  return [ref, inView] as const
}
```

- [ ] **Step 2: Проверить сборку**

Run: `npm run build`
Expected: компилируется без ошибок типов.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/useInView.ts
git commit -m "feat(landing): add useInView scroll-trigger hook"
```

---

## Task 3: Логика гейтинга (чистые функции) — TDD

Решает, что показать незалогиненному: лендинг или экран входа. `?reset=1` минует лендинг (чтобы он не мигал, пока поднимается recovery-сессия Supabase).

**Files:**
- Create: `src/components/landing/gating.ts`
- Test: `src/components/landing/gating.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, it, expect } from 'vitest'
import { isResetUrl, unauthedView } from './gating'

describe('isResetUrl', () => {
  it('true when ?reset present', () => { expect(isResetUrl('?reset=1')).toBe(true) })
  it('false when empty', () => { expect(isResetUrl('')).toBe(false) })
  it('false for unrelated params', () => { expect(isResetUrl('?foo=1')).toBe(false) })
})

describe('unauthedView', () => {
  it('landing by default', () => {
    expect(unauthedView({ isResetUrl: false, showAuth: false })).toBe('landing')
  })
  it('auth when showAuth', () => {
    expect(unauthedView({ isResetUrl: false, showAuth: true })).toBe('auth')
  })
  it('auth when reset url, even if not showAuth', () => {
    expect(unauthedView({ isResetUrl: true, showAuth: false })).toBe('auth')
  })
})
```

- [ ] **Step 2: Прогнать тест — убедиться, что падает**

Run: `npm test -- gating`
Expected: FAIL — `Cannot find module './gating'`.

- [ ] **Step 3: Реализовать `gating.ts`**

```ts
export function isResetUrl(search: string): boolean {
  return new URLSearchParams(search).has('reset')
}

export type UnauthedView = 'landing' | 'auth'

// reset-ссылка минует лендинг, чтобы он не мигал до старта recovery-сессии.
export function unauthedView(opts: { isResetUrl: boolean; showAuth: boolean }): UnauthedView {
  if (opts.isResetUrl) return 'auth'
  if (opts.showAuth) return 'auth'
  return 'landing'
}
```

- [ ] **Step 4: Прогнать тест — убедиться, что проходит**

Run: `npm test -- gating`
Expected: PASS (6 тестов).

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/gating.ts src/components/landing/gating.test.ts
git commit -m "feat(landing): gating logic for landing vs auth (TDD)"
```

---

## Task 4: Каркас `LandingScreen` + интеграция в App (рабочий сквозной скелет)

Веха: лендинг реально показывается незалогиненному, «Попробовать»/«Войти» открывают `AuthScreen`, «← На главную» возвращает на лендинг. Пока только топбар + hero-плейсхолдер + финальный CTA; блоки добавим в Task 5–10.

**Files:**
- Create: `src/components/landing/LandingScreen.tsx`
- Create: `src/components/landing/Landing.css`
- Create: `src/components/landing/Landing.test.ts`
- Modify: `src/components/auth/AuthScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Написать тест (экспорт + покрытие переводов)**

`src/components/landing/Landing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LandingScreen } from './LandingScreen'
import { translations } from '../../lib/translations'

// Растёт по мере добавления блоков (Task 5–10).
const LANDING_KEYS = [
  'Попробовать',
  'Всё о твоём здоровье — в одном месте. И AI, который находит, что на тебя реально влияет.',
  'Личный хаб здоровья: Apple Watch, привычки и анализы — а AI находит закономерности.',
  'Готов(а) попробовать?',
  'На главную',
]

describe('LandingScreen', () => {
  it('exports a component', () => {
    expect(typeof LandingScreen).toBe('function')
  })
  it('has uk + en translations for every landing string', () => {
    for (const key of LANDING_KEYS) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Прогнать тест — убедиться, что падает**

Run: `npm test -- Landing`
Expected: FAIL — нет модуля `./LandingScreen` (и/или нет переводов).

- [ ] **Step 3: Добавить переводы в `translations.ts`**

Добавить в объект `translations` (если ключа ещё нет — `Войти` уже существует, не дублировать):

```ts
  'Попробовать': { uk: 'Спробувати', en: 'Try it' },
  'Всё о твоём здоровье — в одном месте. И AI, который находит, что на тебя реально влияет.': {
    uk: 'Усе про твоє здоровʼя — в одному місці. І AI, який знаходить, що на тебе справді впливає.',
    en: 'Everything about your health in one place — and an AI that finds what actually affects you.',
  },
  'Личный хаб здоровья: Apple Watch, привычки и анализы — а AI находит закономерности.': {
    uk: 'Особистий хаб здоровʼя: Apple Watch, звички й аналізи — а AI знаходить закономірності.',
    en: 'Your personal health hub: Apple Watch, habits and labs — and AI finds the patterns.',
  },
  'Готов(а) попробовать?': { uk: 'Готовий(а) спробувати?', en: 'Ready to try?' },
  'На главную': { uk: 'На головну', en: 'Home' },
```

- [ ] **Step 4: Создать `LandingScreen.tsx` (каркас)**

```tsx
import { useT } from '../../lib/i18n'
import './Landing.css'

export function LandingScreen({ onTry }: { onTry: () => void }) {
  const { t, lang, setLang } = useT()
  const nextLang = lang === 'ru' ? 'uk' : lang === 'uk' ? 'en' : 'ru'
  const flag = lang === 'ru' ? '🇷🇺' : lang === 'uk' ? '🇺🇦' : '🇬🇧'

  return (
    <div className="landing">
      <header className="landing-topbar">
        <span className="landing-logo">Tonus</span>
        <div className="landing-topbar-right">
          <button className="landing-lang" onClick={() => setLang(nextLang)} aria-label="Язык">
            {flag}
          </button>
          <button className="landing-ghost" onClick={onTry}>{t('Войти')}</button>
          <button className="landing-cta" onClick={onTry}>{t('Попробовать')}</button>
        </div>
      </header>

      <main className="landing-main">
        {/* Hero — плейсхолдер, заменяется на <HeroBlock/> в Task 5 */}
        <section className="landing-hero">
          <h1 className="landing-hero-title">
            {t('Всё о твоём здоровье — в одном месте. И AI, который находит, что на тебя реально влияет.')}
          </h1>
          <p className="landing-hero-sub">
            {t('Личный хаб здоровья: Apple Watch, привычки и анализы — а AI находит закономерности.')}
          </p>
          <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
        </section>

        {/* Сюда в Task 6–10 вставляются блоки: Metrics, Insights, Chat, Experiments, FeatureGrid */}

        <section className="landing-final-cta">
          <h2>{t('Готов(а) попробовать?')}</h2>
          <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
        </section>
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Создать `Landing.css` (база)**

```css
.landing { min-height: 100vh; background: var(--bg); color: var(--text); }
.landing-topbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: 16px;
  padding: 0 24px; height: 56px;
  background: var(--topbar-bg); border-bottom: 1px solid var(--border);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.landing-logo { font-size: 18px; font-weight: 700; color: var(--accent); letter-spacing: -0.5px; }
.landing-topbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.landing-lang { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; width: 34px; height: 34px; cursor: pointer; }
.landing-ghost { background: none; border: none; color: var(--text-muted); padding: 8px 14px; border-radius: 8px; cursor: pointer; }
.landing-ghost:hover { color: var(--text); background: var(--surface2); }
.landing-cta { background: var(--accent); color: #fff; border: none; border-radius: 10px; padding: 9px 18px; font-size: 14px; font-weight: 600; cursor: pointer; transition: transform .12s, filter .12s; }
.landing-cta:hover { filter: brightness(1.08); transform: translateY(-1px); }
.landing-cta-lg { padding: 14px 28px; font-size: 16px; }

.landing-main { max-width: 1080px; margin: 0 auto; padding: 0 24px; }
.landing-hero { text-align: center; padding: 96px 0 72px; }
.landing-hero-title { font-size: clamp(28px, 5vw, 52px); line-height: 1.1; letter-spacing: -1px; max-width: 16ch; margin: 0 auto 20px; }
.landing-hero-sub { font-size: clamp(15px, 2vw, 19px); color: var(--text-muted); max-width: 52ch; margin: 0 auto 32px; }
.landing-final-cta { text-align: center; padding: 96px 0; }
.landing-final-cta h2 { font-size: clamp(24px, 4vw, 40px); margin-bottom: 24px; }

/* Общий контейнер блока + базовая анимация появления по скроллу */
.landing-block { padding: 72px 0; border-top: 1px solid var(--border); }
.landing-reveal { opacity: 0; transform: translateY(24px); }
.landing-reveal.in { opacity: 1; transform: translateY(0); transition: opacity .6s ease, transform .6s ease; }
@media (prefers-reduced-motion: reduce) {
  .landing-reveal, .landing-reveal.in { opacity: 1; transform: none; transition: none; }
}
```

- [ ] **Step 6: Добавить `onBack` в `AuthScreen.tsx`**

Сменить сигнатуру:

```tsx
export function AuthScreen({ onBack }: { onBack?: () => void } = {}) {
```

В основном возврате (login/signup), сразу после `<div className="auth-card">` с `<h1>Tonus</h1>`, добавить кнопку (показываем только если `onBack` передан):

```tsx
{onBack && (
  <button type="button" className="btn-ghost auth-back" onClick={onBack}>
    ← {t('На главную')}
  </button>
)}
```

- [ ] **Step 7: Интегрировать в `App.tsx`**

Добавить импорты рядом с прочими:

```tsx
import { LandingScreen } from './components/landing/LandingScreen'
import { isResetUrl, unauthedView } from './components/landing/gating'
```

Добавить состояние рядом с другими `useState`:

```tsx
const [showAuth, setShowAuth] = useState(false)
```

Заменить строку `if (!user) return <AuthScreen />` на:

```tsx
if (!user) {
  const view = unauthedView({ isResetUrl: isResetUrl(window.location.search), showAuth })
  return view === 'auth'
    ? <AuthScreen onBack={() => setShowAuth(false)} />
    : <LandingScreen onTry={() => setShowAuth(true)} />
}
```

- [ ] **Step 8: Прогнать тесты и сборку**

Run: `npm test -- Landing`
Expected: PASS.

Run: `npm test`
Expected: PASS (весь набор).

Run: `npm run build`
Expected: компилируется.

- [ ] **Step 9: Ручная проверка**

Run: `npm run dev`, открыть в режиме инкогнито (незалогинен).
Expected: виден лендinг (топбар + hero + CTA). «Попробовать» → `AuthScreen` с кнопкой «← На главную»; клик по ней → снова лендинг. Добавить `?reset=1` к URL → сразу `AuthScreen`, не лендинг.

- [ ] **Step 10: Commit**

```bash
git add src/components/landing/LandingScreen.tsx src/components/landing/Landing.css src/components/landing/Landing.test.ts src/components/auth/AuthScreen.tsx src/App.tsx src/lib/translations.ts
git commit -m "feat(landing): landing screen shell + auth gating integration"
```

---

## Task 5: Блок Hero (анимация фона)

Заменяем hero-плейсхолдер на компонент с анимированным фоном: пульсовая линия бежит по экрану (SVG `stroke-dashoffset`) + редкие плавающие точки. Запуск сразу (hero виден на загрузке) — здесь `useInView` не нужен.

**Files:**
- Create: `src/components/landing/blocks/HeroBlock.tsx`
- Modify: `src/components/landing/LandingScreen.tsx` (вставить `<HeroBlock onTry={onTry} />` вместо плейсхолдер-секции)
- Modify: `src/components/landing/Landing.css` (стили + keyframes hero)

- [ ] **Step 1: Создать `HeroBlock.tsx`**

```tsx
import { useT } from '../../../lib/i18n'

export function HeroBlock({ onTry }: { onTry: () => void }) {
  const { t } = useT()
  return (
    <section className="landing-hero">
      <svg className="hero-pulse" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,100 L300,100 L330,100 L350,40 L370,160 L390,100 L420,100 L1200,100" />
      </svg>
      <h1 className="landing-hero-title">
        {t('Всё о твоём здоровье — в одном месте. И AI, который находит, что на тебя реально влияет.')}
      </h1>
      <p className="landing-hero-sub">
        {t('Личный хаб здоровья: Apple Watch, привычки и анализы — а AI находит закономерности.')}
      </p>
      <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
    </section>
  )
}
```

- [ ] **Step 2: Добавить keyframes/стили hero в `Landing.css`**

```css
.landing-hero { position: relative; overflow: hidden; }
.hero-pulse { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .15; pointer-events: none; }
.hero-pulse path {
  fill: none; stroke: var(--accent); stroke-width: 2;
  stroke-dasharray: 1600; stroke-dashoffset: 1600;
  animation: hero-trace 4s ease-out forwards, hero-drift 9s linear 4s infinite;
}
@keyframes hero-trace { to { stroke-dashoffset: 0; } }
@keyframes hero-drift { 0% { transform: translateX(0); } 100% { transform: translateX(-40px); } }
.landing-hero-title, .landing-hero-sub, .landing-hero .landing-cta { position: relative; z-index: 1; }
@media (prefers-reduced-motion: reduce) {
  .hero-pulse path { animation: none; stroke-dashoffset: 0; }
}
```

- [ ] **Step 3: Вставить блок в `LandingScreen.tsx`**

Удалить плейсхолдер-`<section className="landing-hero">…</section>` и импортировать/вставить:

```tsx
import { HeroBlock } from './blocks/HeroBlock'
// ...в разметке, первым в <main>:
<HeroBlock onTry={onTry} />
```

- [ ] **Step 4: Тесты, сборка, ручная проверка**

Run: `npm test` → PASS. `npm run build` → OK.
Ручная: `npm run dev` → пульсовая линия прорисовывается и дрейфует; с `prefers-reduced-motion` — статична.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/blocks/HeroBlock.tsx src/components/landing/LandingScreen.tsx src/components/landing/Landing.css
git commit -m "feat(landing): hero block with animated pulse backdrop"
```

---

## Task 6: Блок «Дашборд + метрики Apple Watch»

Мокап дашборда. Анимации по скроллу через `useInView`: линейный график «рисуется» (`stroke-dashoffset`), бары вырастают (`scaleY`), числа бегут через `Counter`. Метрики: пульс покоя, сон, активность, мини стресс-карта.

**Files:**
- Create: `src/components/landing/blocks/MetricsBlock.tsx`
- Modify: `src/components/landing/LandingScreen.tsx`, `src/components/landing/Landing.css`, `src/lib/translations.ts`, `src/components/landing/Landing.test.ts`

- [ ] **Step 1: Добавить новые строки в `LANDING_KEYS` (Landing.test.ts)**

```ts
  'Все метрики в одном дашборде',
  'Пульс покоя',
  'Сон',
  'Активность',
  'Стресс',
  'Apple Watch синхронизируется автоматически — а ты видишь живую картину.',
```

- [ ] **Step 2: Добавить переводы в `translations.ts`**

```ts
  'Все метрики в одном дашборде': { uk: 'Усі метрики в одному дашборді', en: 'Every metric in one dashboard' },
  'Пульс покоя': { uk: 'Пульс спокою', en: 'Resting HR' },
  'Сон': { uk: 'Сон', en: 'Sleep' },
  'Активность': { uk: 'Активність', en: 'Activity' },
  'Стресс': { uk: 'Стрес', en: 'Stress' },
  'Apple Watch синхронизируется автоматически — а ты видишь живую картину.': {
    uk: 'Apple Watch синхронізується автоматично — а ти бачиш живу картину.',
    en: 'Apple Watch syncs automatically — and you see the live picture.',
  },
```

- [ ] **Step 3: Создать `MetricsBlock.tsx`**

```tsx
import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'
import { Counter } from '../../ui/Counter'

export function MetricsBlock() {
  const { t } = useT()
  const [ref, inView] = useInView<HTMLDivElement>()

  const bars = [40, 65, 50, 80, 60, 90, 70] // высоты в %
  return (
    <section className="landing-block" ref={ref}>
      <div className={`landing-reveal ${inView ? 'in' : ''}`}>
        <h2 className="block-title">📊 {t('Все метрики в одном дашборде')}</h2>
        <p className="block-sub">{t('Apple Watch синхронизируется автоматически — а ты видишь живую картину.')}</p>

        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-label">{t('Пульс покоя')}</span>
            <span className="metric-value">{inView ? <Counter value={58} /> : 0} <small>bpm</small></span>
          </div>
          <div className="metric-card">
            <span className="metric-label">{t('Сон')}</span>
            <span className="metric-value">{inView ? <Counter value={7} /> : 0}<small>ч 20м</small></span>
          </div>
          <div className="metric-card">
            <span className="metric-label">{t('Активность')}</span>
            <span className="metric-value">{inView ? <Counter value={512} /> : 0} <small>kcal</small></span>
          </div>

          <div className="metric-card metric-chart">
            <span className="metric-label">{t('Стресс')}</span>
            <div className={`bars ${inView ? 'grow' : ''}`}>
              {bars.map((h, i) => (
                <span key={i} className="bar" style={{ height: `${h}%`, transitionDelay: `${i * 80}ms` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Стили/keyframes в `Landing.css`**

```css
.block-title { font-size: clamp(22px, 3.5vw, 34px); text-align: center; margin-bottom: 10px; }
.block-sub { text-align: center; color: var(--text-muted); max-width: 50ch; margin: 0 auto 36px; }
.metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
.metric-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; display: flex; flex-direction: column; gap: 8px; }
.metric-label { color: var(--text-muted); font-size: 13px; }
.metric-value { font-size: 30px; font-weight: 700; }
.metric-value small { font-size: 14px; color: var(--text-muted); font-weight: 400; }
.metric-chart { grid-column: span 1; }
.bars { display: flex; align-items: flex-end; gap: 6px; height: 70px; }
.bar { flex: 1; background: var(--accent); border-radius: 3px 3px 0 0; height: 0 !important; transition: height .5s ease; }
.bars.grow .bar { height: var(--h); }
/* высота задаётся inline style; .grow переключает на финальную через transition */
```

Примечание реализации: чтобы бар рос от 0, в `MetricsBlock` высоту задаём через CSS-переменную, а не напрямую. Уточнить при сборке: заменить `style={{ height }}` на `style={{ ['--h' as any]: \`${h}%\`, transitionDelay: ... }}` и убрать `height:0 !important` хак, если визуально не нужно. Финальные значения тюнингуются в браузере.

- [ ] **Step 5: Вставить `<MetricsBlock />` в `LandingScreen.tsx`** (после Hero, до финального CTA), импорт сверху.

- [ ] **Step 6: Тесты, сборка, ручная проверка**

Run: `npm test` → PASS. `npm run build` → OK.
Ручная: при прокрутке до блока графики/бары анимируются, числа бегут; reduce-motion — сразу финальные значения.

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/blocks/MetricsBlock.tsx src/components/landing/LandingScreen.tsx src/components/landing/Landing.css src/lib/translations.ts src/components/landing/Landing.test.ts
git commit -m "feat(landing): metrics/dashboard showcase block"
```

---

## Task 7: Блок «AI-инсайты»

Главный дифференциатор. Анимация по скроллу: точки данных → линии связи → выезжают карточки-инсайты со stagger.

**Files:**
- Create: `src/components/landing/blocks/InsightsBlock.tsx`
- Modify: `LandingScreen.tsx`, `Landing.css`, `translations.ts`, `Landing.test.ts`

- [ ] **Step 1: `LANDING_KEYS` += строки**

```ts
  'AI находит закономерности, которые ты сам не заметишь',
  'Связывает сон, питание, стресс и активность — и показывает, что на что влияет.',
  '☕ Кофе после 15:00',
  '→ сон на 1.5 ч короче',
  '🍽️ Поздняя еда',
  '→ HRV падает на 15%',
  '💼 Стрессовые дни',
  '→ пульс покоя выше на 8 уд/мин',
```

- [ ] **Step 2: Переводы в `translations.ts`**

```ts
  'AI находит закономерности, которые ты сам не заметишь': {
    uk: 'AI знаходить закономірності, яких ти сам не помітиш',
    en: 'AI finds patterns you would never spot yourself',
  },
  'Связывает сон, питание, стресс и активность — и показывает, что на что влияет.': {
    uk: 'Звʼязує сон, харчування, стрес і активність — і показує, що на що впливає.',
    en: 'It links sleep, food, stress and activity — and shows what affects what.',
  },
  '☕ Кофе после 15:00': { uk: '☕ Кава після 15:00', en: '☕ Coffee after 3pm' },
  '→ сон на 1.5 ч короче': { uk: '→ сон на 1.5 год коротший', en: '→ sleep 1.5h shorter' },
  '🍽️ Поздняя еда': { uk: '🍽️ Пізня їжа', en: '🍽️ Late meals' },
  '→ HRV падает на 15%': { uk: '→ HRV падає на 15%', en: '→ HRV drops 15%' },
  '💼 Стрессовые дни': { uk: '💼 Стресові дні', en: '💼 Stressful days' },
  '→ пульс покоя выше на 8 уд/мин': { uk: '→ пульс спокою вищий на 8 уд/хв', en: '→ resting HR up 8 bpm' },
```

- [ ] **Step 3: Создать `InsightsBlock.tsx`**

```tsx
import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'

export function InsightsBlock() {
  const { t } = useT()
  const [ref, inView] = useInView<HTMLDivElement>()

  const insights = [
    { title: t('☕ Кофе после 15:00'), text: t('→ сон на 1.5 ч короче') },
    { title: t('🍽️ Поздняя еда'), text: t('→ HRV падает на 15%') },
    { title: t('💼 Стрессовые дни'), text: t('→ пульс покоя выше на 8 уд/мин') },
  ]

  return (
    <section className="landing-block" ref={ref}>
      <div className={`landing-reveal ${inView ? 'in' : ''}`}>
        <h2 className="block-title">🧠 {t('AI находит закономерности, которые ты сам не заметишь')}</h2>
        <p className="block-sub">{t('Связывает сон, питание, стресс и активность — и показывает, что на что влияет.')}</p>

        <div className={`insights-web ${inView ? 'live' : ''}`} aria-hidden="true">
          <span className="node n1" /><span className="node n2" /><span className="node n3" />
          <span className="node n4" /><span className="node n5" />
          <svg className="web-lines" viewBox="0 0 400 160" preserveAspectRatio="none">
            <path d="M40,40 L200,80" /><path d="M200,80 L360,30" /><path d="M200,80 L120,140" /><path d="M200,80 L320,130" />
          </svg>
        </div>

        <div className="insight-cards">
          {insights.map((it, i) => (
            <div key={i} className={`insight-card ${inView ? 'in' : ''}`} style={{ transitionDelay: `${0.4 + i * 0.2}s` }}>
              <span className="insight-card-title">{it.title}</span>
              <span className="insight-card-text">{it.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Стили/keyframes в `Landing.css`**

```css
.insights-web { position: relative; height: 160px; max-width: 400px; margin: 0 auto 28px; }
.insights-web .node { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); opacity: 0; transform: scale(0); }
.insights-web.live .node { animation: node-pop .4s ease forwards; }
.node.n1 { left: 8%; top: 22%; } .node.n2 { left: 48%; top: 48%; animation-delay: .1s; }
.node.n3 { left: 88%; top: 16%; animation-delay: .2s; } .node.n4 { left: 28%; top: 84%; animation-delay: .3s; }
.node.n5 { left: 78%; top: 78%; animation-delay: .4s; }
@keyframes node-pop { to { opacity: 1; transform: scale(1); } }
.web-lines { position: absolute; inset: 0; width: 100%; height: 100%; }
.web-lines path { fill: none; stroke: var(--accent); stroke-width: 1.5; opacity: .4; stroke-dasharray: 300; stroke-dashoffset: 300; }
.insights-web.live .web-lines path { animation: web-trace .8s ease .4s forwards; }
@keyframes web-trace { to { stroke-dashoffset: 0; } }
.insight-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.insight-card { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 6px; opacity: 0; transform: translateX(-16px); }
.insight-card.in { opacity: 1; transform: translateX(0); transition: opacity .5s ease, transform .5s ease; }
.insight-card-title { font-weight: 600; }
.insight-card-text { color: var(--text-muted); font-size: 14px; }
@media (prefers-reduced-motion: reduce) {
  .insights-web .node, .web-lines path { animation: none; opacity: 1; transform: none; stroke-dashoffset: 0; }
  .insight-card { opacity: 1; transform: none; }
}
```

- [ ] **Step 5: Вставить `<InsightsBlock />` в `LandingScreen.tsx`** (после Metrics), импорт сверху.

- [ ] **Step 6: Тесты, сборка, ручная проверка** (`npm test` PASS, `npm run build` OK, скролл → узлы/линии/карточки анимируются).

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/blocks/InsightsBlock.tsx src/components/landing/LandingScreen.tsx src/components/landing/Landing.css src/lib/translations.ts src/components/landing/Landing.test.ts
git commit -m "feat(landing): AI insights showcase block"
```

---

## Task 8: Блок «AI-общение: в приложении ↔ в Telegram»

Объединённый блок с переключением табов. Таб «В Telegram» переиспользует существующий `TelegramDemo`. Таб «В приложении» — простой анимированный чат (вопрос → «печатает…» → ответ).

**Files:**
- Create: `src/components/landing/blocks/ChatBlock.tsx`
- Modify: `LandingScreen.tsx`, `Landing.css`, `translations.ts`, `Landing.test.ts`

- [ ] **Step 1: `LANDING_KEYS` += строки**

```ts
  'Спрашивай о своём здоровье — отвечает по твоим данным',
  'В приложении',
  'В Telegram',
  'Почему я так устаю днём?',
  'По твоим данным: за последнюю неделю сон в среднем 6.2 ч и поздний кофе 4 дня из 7. Попробуй сдвинуть кофе на утро.',
  'печатает…',
```

- [ ] **Step 2: Переводы в `translations.ts`**

```ts
  'Спрашивай о своём здоровье — отвечает по твоим данным': {
    uk: 'Питай про своє здоровʼя — відповідає за твоїми даними',
    en: 'Ask about your health — it answers from your data',
  },
  'В приложении': { uk: 'У застосунку', en: 'In the app' },
  'В Telegram': { uk: 'У Telegram', en: 'In Telegram' },
  'Почему я так устаю днём?': { uk: 'Чому я так втомлююсь удень?', en: 'Why am I so tired during the day?' },
  'По твоим данным: за последнюю неделю сон в среднем 6.2 ч и поздний кофе 4 дня из 7. Попробуй сдвинуть кофе на утро.': {
    uk: 'За твоїми даними: за останній тиждень сон у середньому 6.2 год і пізня кава 4 дні з 7. Спробуй перенести каву на ранок.',
    en: 'From your data: last week sleep averaged 6.2h and late coffee on 4 of 7 days. Try moving coffee to the morning.',
  },
  'печатает…': { uk: 'друкує…', en: 'typing…' },
```

- [ ] **Step 3: Создать `ChatBlock.tsx`**

```tsx
import { useState } from 'react'
import { useT } from '../../../lib/i18n'
import TelegramDemo from '../../auth/TelegramDemo'

export function ChatBlock() {
  const { t } = useT()
  const [tab, setTab] = useState<'app' | 'tg'>('app')

  return (
    <section className="landing-block">
      <h2 className="block-title">💬 {t('Спрашивай о своём здоровье — отвечает по твоим данным')}</h2>

      <div className="chat-tabs">
        <button className={`chat-tab ${tab === 'app' ? 'active' : ''}`} onClick={() => setTab('app')}>{t('В приложении')}</button>
        <button className={`chat-tab ${tab === 'tg' ? 'active' : ''}`} onClick={() => setTab('tg')}>{t('В Telegram')}</button>
      </div>

      <div className="chat-stage">
        {tab === 'app' ? <AppChatDemo /> : <TelegramDemo />}
      </div>
    </section>
  )
}

// Лёгкая CSS-демка чата в приложении; remount по key не нужен (статичная сцена с задержками).
function AppChatDemo() {
  const { t } = useT()
  return (
    <div className="appchat">
      <div className="appchat-msg user">{t('Почему я так устаю днём?')}</div>
      <div className="appchat-typing">{t('печатает…')}</div>
      <div className="appchat-msg bot">
        {t('По твоим данным: за последнюю неделю сон в среднем 6.2 ч и поздний кофе 4 дня из 7. Попробуй сдвинуть кофе на утро.')}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Стили/keyframes в `Landing.css`**

```css
.chat-tabs { display: flex; gap: 6px; justify-content: center; margin: 24px 0 20px; }
.chat-tab { background: var(--surface2); border: 1px solid var(--border); color: var(--text-muted); padding: 8px 18px; border-radius: 20px; cursor: pointer; }
.chat-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.chat-stage { display: flex; justify-content: center; }
.appchat { width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 10px; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.appchat-msg { padding: 10px 14px; border-radius: 14px; max-width: 85%; opacity: 0; animation: appchat-in .4s ease forwards; }
.appchat-msg.user { align-self: flex-end; background: var(--accent); color: #fff; }
.appchat-msg.bot { align-self: flex-start; background: var(--surface2); animation-delay: 1.6s; }
.appchat-typing { align-self: flex-start; color: var(--text-muted); font-size: 13px; opacity: 0; animation: appchat-in .3s ease .8s forwards, appchat-out .3s ease 1.6s forwards; }
@keyframes appchat-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes appchat-out { to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .appchat-msg { opacity: 1; animation: none; } .appchat-typing { display: none; }
}
```

- [ ] **Step 5: Вставить `<ChatBlock />` в `LandingScreen.tsx`** (после Insights), импорт сверху.

- [ ] **Step 6: Тесты, сборка, ручная проверка** (`npm test` PASS — в т.ч. `TelegramDemo` остаётся рабочим; `npm run build` OK; переключение табов работает, обе сцены анимируются).

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/blocks/ChatBlock.tsx src/components/landing/LandingScreen.tsx src/components/landing/Landing.css src/lib/translations.ts src/components/landing/Landing.test.ts
git commit -m "feat(landing): AI chat block (in-app <-> Telegram tabs)"
```

---

## Task 9: Блок «Эксперименты (N-of-1)»

Таймлайн: гипотеза → периоды A/B → результат с дельтой (через `Counter`). Анимация по скроллу.

**Files:**
- Create: `src/components/landing/blocks/ExperimentsBlock.tsx`
- Modify: `LandingScreen.tsx`, `Landing.css`, `translations.ts`, `Landing.test.ts`

- [ ] **Step 1: `LANDING_KEYS` += строки**

```ts
  'Проверяй, что работает именно на тебе',
  'Гипотеза: меньше кофе → лучше сон',
  'Период A',
  'Период B',
  'Результат',
  'глубокий сон',
```

- [ ] **Step 2: Переводы в `translations.ts`**

```ts
  'Проверяй, что работает именно на тебе': { uk: 'Перевіряй, що працює саме на тобі', en: 'Test what actually works for you' },
  'Гипотеза: меньше кофе → лучше сон': { uk: 'Гіпотеза: менше кави → кращий сон', en: 'Hypothesis: less coffee → better sleep' },
  'Период A': { uk: 'Період A', en: 'Period A' },
  'Период B': { uk: 'Період B', en: 'Period B' },
  'Результат': { uk: 'Результат', en: 'Result' },
  'глубокий сон': { uk: 'глибокий сон', en: 'deep sleep' },
```

- [ ] **Step 3: Создать `ExperimentsBlock.tsx`**

```tsx
import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'
import { Counter } from '../../ui/Counter'

export function ExperimentsBlock() {
  const { t } = useT()
  const [ref, inView] = useInView<HTMLDivElement>()

  return (
    <section className="landing-block" ref={ref}>
      <div className={`landing-reveal ${inView ? 'in' : ''}`}>
        <h2 className="block-title">🔬 {t('Проверяй, что работает именно на тебе')}</h2>
        <p className="block-sub">{t('Гипотеза: меньше кофе → лучше сон')}</p>

        <div className="exp-timeline">
          <div className={`exp-period a ${inView ? 'in' : ''}`}><span>{t('Период A')}</span></div>
          <div className={`exp-period b ${inView ? 'in' : ''}`}><span>{t('Период B')}</span></div>
        </div>

        <div className={`exp-result ${inView ? 'in' : ''}`}>
          <span className="exp-result-label">{t('Результат')}</span>
          <span className="exp-result-delta">+{inView ? <Counter value={12} /> : 0}%</span>
          <span className="exp-result-metric">{t('глубокий сон')}</span>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Стили/keyframes в `Landing.css`**

```css
.exp-timeline { display: flex; gap: 10px; max-width: 560px; margin: 0 auto 24px; }
.exp-period { flex: 1; height: 56px; border-radius: var(--radius); display: flex; align-items: center; justify-content: center; font-size: 14px; color: #fff; transform: scaleX(0); transform-origin: left; }
.exp-period.in { transition: transform .6s ease; transform: scaleX(1); }
.exp-period.a { background: var(--text-muted); }
.exp-period.b { background: var(--accent); transition-delay: .3s; }
.exp-result { max-width: 560px; margin: 0 auto; text-align: center; background: var(--surface); border: 1px solid var(--green); border-radius: var(--radius); padding: 20px; opacity: 0; transform: translateY(16px); }
.exp-result.in { opacity: 1; transform: translateY(0); transition: opacity .5s ease .8s, transform .5s ease .8s; }
.exp-result-label { display: block; color: var(--text-muted); font-size: 13px; }
.exp-result-delta { font-size: 40px; font-weight: 800; color: var(--green); }
.exp-result-metric { display: block; color: var(--text-muted); }
@media (prefers-reduced-motion: reduce) {
  .exp-period { transform: none; } .exp-result { opacity: 1; transform: none; }
}
```

- [ ] **Step 5: Вставить `<ExperimentsBlock />` в `LandingScreen.tsx`** (после Chat), импорт сверху.

- [ ] **Step 6: Тесты, сборка, ручная проверка.**

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/blocks/ExperimentsBlock.tsx src/components/landing/LandingScreen.tsx src/components/landing/Landing.css src/lib/translations.ts src/components/landing/Landing.test.ts
git commit -m "feat(landing): N-of-1 experiments showcase block"
```

---

## Task 10: Блок «И это ещё не всё» (сетка фич)

6 мини-карточек со stagger-появлением по скроллу.

**Files:**
- Create: `src/components/landing/blocks/FeatureGrid.tsx`
- Modify: `LandingScreen.tsx`, `Landing.css`, `translations.ts`, `Landing.test.ts`

- [ ] **Step 1: `LANDING_KEYS` += строки**

```ts
  'И это ещё не всё',
  'Препараты и лечение',
  'Анализы из лаборатории',
  'Питание',
  'Цели',
  'Экспорт данных',
  'Три языка: ru / uk / en',
```

- [ ] **Step 2: Переводы в `translations.ts`**

```ts
  'И это ещё не всё': { uk: 'І це ще не все', en: 'And there is more' },
  'Препараты и лечение': { uk: 'Препарати й лікування', en: 'Meds & treatment' },
  'Анализы из лаборатории': { uk: 'Аналізи з лабораторії', en: 'Lab results' },
  'Питание': { uk: 'Харчування', en: 'Nutrition' },
  'Цели': { uk: 'Цілі', en: 'Goals' },
  'Экспорт данных': { uk: 'Експорт даних', en: 'Data export' },
  'Три языка: ru / uk / en': { uk: 'Три мови: ru / uk / en', en: 'Three languages: ru / uk / en' },
```

- [ ] **Step 3: Создать `FeatureGrid.tsx`**

```tsx
import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'

export function FeatureGrid() {
  const { t } = useT()
  const [ref, inView] = useInView<HTMLDivElement>()

  const items = [
    { icon: '💊', label: t('Препараты и лечение') },
    { icon: '🧪', label: t('Анализы из лаборатории') },
    { icon: '🍔', label: t('Питание') },
    { icon: '🎯', label: t('Цели') },
    { icon: '📤', label: t('Экспорт данных') },
    { icon: '🌍', label: t('Три языка: ru / uk / en') },
  ]

  return (
    <section className="landing-block" ref={ref}>
      <h2 className="block-title">{t('И это ещё не всё')}</h2>
      <div className="feature-grid">
        {items.map((it, i) => (
          <div key={i} className={`feature-cell ${inView ? 'in' : ''}`} style={{ transitionDelay: `${i * 80}ms` }}>
            <span className="feature-icon">{it.icon}</span>
            <span>{it.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Стили в `Landing.css`**

```css
.feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.feature-cell { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; display: flex; flex-direction: column; gap: 8px; align-items: center; text-align: center; font-size: 14px; opacity: 0; transform: translateY(14px); }
.feature-cell.in { opacity: 1; transform: translateY(0); transition: opacity .45s ease, transform .45s ease; }
.feature-icon { font-size: 26px; }
@media (prefers-reduced-motion: reduce) { .feature-cell { opacity: 1; transform: none; } }
```

- [ ] **Step 5: Вставить `<FeatureGrid />` в `LandingScreen.tsx`** (после Experiments, перед финальным CTA), импорт сверху.

- [ ] **Step 6: Тесты, сборка, ручная проверка.**

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/blocks/FeatureGrid.tsx src/components/landing/LandingScreen.tsx src/components/landing/Landing.css src/lib/translations.ts src/components/landing/Landing.test.ts
git commit -m "feat(landing): feature grid block"
```

---

## Task 11: Финальная проверка и завершение ветки

- [ ] **Step 1: Полный прогон качества**

Run: `npm run lint`
Expected: без ошибок (предупреждения react-refresh допустимы, если уже есть в проекте).

Run: `npm test`
Expected: PASS — все тесты, включая `gating` и покрытие переводов `Landing`/`TelegramDemo`.

Run: `npm run build`
Expected: успешная сборка.

- [ ] **Step 2: Ручной сквозной прогон** (`npm run dev`, режим инкогнито)

Проверить:
- Незалогинен → виден лендinг; все 6 блоков на месте.
- Скролл: каждый блок анимируется при появлении; hero-линия рисуется; числа бегут; insights-узлы/линии/карточки; бары; периоды A/B; сетка фич stagger.
- «Попробовать» и «Войти» → `AuthScreen`; «← На главную» → лендинг.
- `?reset=1` в URL → сразу `AuthScreen`, не лендинг.
- Переключение языка ru/uk/en — тексты лендинга меняются, русский нигде не «протекает».
- Тёмная/светлая тема — лендинг читаем в обеих (на токенах темы).
- ChatBlock: переключение «В приложении» / «В Telegram».
- DevTools → emulate `prefers-reduced-motion: reduce` → блоки показывают финальное состояние без анимаций.

- [ ] **Step 3: Завершение ветки**

Использовать сабскилл **superpowers:finishing-a-development-branch** — предложить пользователю слияние/PR ветки `feat/landing-page`.

---

## Self-Review (выполнено при написании плана)

- **Покрытие спеки:** §2 структура → Task 4–10; §3 блоки → Task 5–10; §4 интеграция/роутинг → Task 3–4; §5 анимации → Task 2 + CSS в каждом блоке + reduce-motion ветки; §6 i18n → строки+переводы в каждом блоке, охрана тестом; §7 дизайн-визуал → вне кода (последующий шаг, не таска); §8 тесты → Task 3 (юнит) + паттерн покрытия в Task 4–10 + ручная проверка Task 11; §9 YAGNI → не реализуем. Пробелов нет.
- **Плейсхолдеры:** код приведён для всех логических/тестируемых частей; визуальные значения CSS помечены как тюнингуемые в браузере (осознанно, не «TODO»).
- **Согласованность типов:** `Counter` (props value/delay/duration/className) единообразен в TelegramDemo и блоках; `useInView<T>()` → `[ref, inView]` единообразно; `unauthedView`/`isResetUrl` сигнатуры совпадают между `gating.ts`, тестом и `App.tsx`; `AuthScreen({ onBack })` совпадает с вызовом в `App.tsx`.
