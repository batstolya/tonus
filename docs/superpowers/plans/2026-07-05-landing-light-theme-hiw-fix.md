# Landing Light Theme (mate-style) + HowItWorks Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Починить залипание активного шага в «Как это работает» и добавить светлую тему лендинга в стиле mate.academy (светлая — дефолт для незалогиненных, тумблер в топбаре).

**Architecture:** Активный шаг HowItWorks определяется пересечением центральной полосы вьюпорта (IntersectionObserver c `rootMargin: '-45% 0px -45% 0px'`). Светлая тема — CSS-переопределения `[data-theme="light"]` в `Landing.css` поверх существующих переменных; дефолт темы резолвится чистой функцией `resolveTheme(saved, fallback)` в `useTheme`, App передаёт fallback по наличию сессии.

**Tech Stack:** React 19, Vite, Motion (LazyMotion domMax, только `m.*`), vitest (env **node** — рендер компонентов недоступен, тесты = экспорты + переводы + чистая логика). Всё под Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.

**Spec:** `docs/superpowers/specs/2026-07-05-landing-light-theme-hiw-fix-design.md`

**Верификация в превью:** dev-сервер уже описан в `.claude/launch.json` (`tonus-dev`, порт 5173). Перед запуском нужен dummy `.env.local` (gitignored):

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key
```

---

### Task 1: Фикс HowItWorks — центральная полоса

**Files:**
- Modify: `src/components/landing/useInView.ts`
- Modify: `src/components/landing/blocks/HowItWorks.tsx:70`
- Modify: `src/components/landing/Landing.css:97`

- [ ] **Step 1: Добавить опцию `rootMargin` в useInView**

В `src/components/landing/useInView.ts` расширить опции и пробросить в observer (меняются 3 места: сигнатура, чтение опции, конструктор IO + deps эффекта):

```ts
export function useInView<T extends HTMLElement = HTMLDivElement>(opts?: {
  threshold?: number
  once?: boolean
  rootMargin?: string
}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(immediatelyVisible)
  const once = opts?.once ?? true
  const threshold = opts?.threshold ?? 0.25
  const rootMargin = opts?.rootMargin

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (immediatelyVisible()) return
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
      { threshold, rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [once, threshold, rootMargin])

  return [ref, inView] as const
}
```

Комментарий к хуку (строки 9–11) дополнить: `// rootMargin позволяет сузить зону срабатывания (например, центральная полоса вьюпорта).`

- [ ] **Step 2: Перевести StepText на центральную полосу**

В `src/components/landing/blocks/HowItWorks.tsx:70` заменить

```ts
const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.6, once: false })
```

на

```ts
// Активен шаг, пересекающий центральную полосу вьюпорта (10% по высоте).
// threshold 0.6 ломался: все шаги видны одновременно и события кончались.
const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0, rootMargin: '-45% 0px -45% 0px', once: false })
```

- [ ] **Step 3: Увеличить прокруточный ход шагов**

В `src/components/landing/Landing.css:97` — чтобы в полосу не попадали два шага сразу и sticky-сцена жила дольше:

```css
.hiw-steps { display: flex; flex-direction: column; gap: 14vh; padding: 6vh 0; }
```

(мобильная ветка `@media (max-width: 860px)` уже переопределяет `gap: 28px` — не трогать).

- [ ] **Step 4: Прогнать существующие тесты**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test`
Expected: PASS (все существующие; новых тестов нет — IO в node-env недоступен).

- [ ] **Step 5: Верификация в превью**

1. Убедиться, что `.env.local` существует (см. шапку плана), `preview_start` → `tonus-dev`.
2. Доскроллить до секции «Как это работает» (`preview_eval`: `document.querySelector('.hiw-grid').scrollIntoView()` затем пошаговый `window.scrollBy(0, 300)`).
3. После каждого шага скролла `preview_eval`: `[...document.querySelectorAll('.hiw-step')].map(s => s.classList.contains('active'))` — активный индекс должен идти 0 → 1 → 2 при скролле вниз и обратно при скролле вверх.
4. `preview_console_logs` — без ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/useInView.ts src/components/landing/blocks/HowItWorks.tsx src/components/landing/Landing.css
git commit -m "fix(landing): активный шаг «Как это работает» переключается по центру вьюпорта"
```

---

### Task 2: resolveTheme + дефолт темы по контексту (TDD)

**Files:**
- Test: `src/hooks/useTheme.test.ts` (create)
- Modify: `src/hooks/useTheme.ts`
- Modify: `src/App.tsx:114`

- [ ] **Step 1: Написать падающий тест**

Create `src/hooks/useTheme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveTheme } from './useTheme'

// Чистая логика выбора темы: сохранённый выбор побеждает, мусор игнорируется.
describe('resolveTheme', () => {
  it('uses saved theme when valid', () => {
    expect(resolveTheme('dark', 'light')).toBe('dark')
    expect(resolveTheme('light', 'dark')).toBe('light')
  })
  it('falls back when nothing saved', () => {
    expect(resolveTheme(null, 'light')).toBe('light')
    expect(resolveTheme(null, 'dark')).toBe('dark')
  })
  it('falls back on garbage values', () => {
    expect(resolveTheme('banana', 'light')).toBe('light')
    expect(resolveTheme('', 'dark')).toBe('dark')
  })
})
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- useTheme`
Expected: FAIL — `resolveTheme` не экспортируется.

- [ ] **Step 3: Переписать useTheme**

Заменить содержимое `src/hooks/useTheme.ts` целиком:

```ts
import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

// Сохранённый выбор пользователя побеждает; иначе — дефолт контекста
// (лендинг/незалогинен → light, приложение → dark).
export function resolveTheme(saved: string | null, fallback: Theme): Theme {
  return saved === 'dark' || saved === 'light' ? saved : fallback
}

export function useTheme(defaultTheme: Theme = 'dark') {
  // Пишем в localStorage только при явном toggle: простое посещение
  // не должно фиксировать тему навсегда.
  const [saved, setSaved] = useState<string | null>(() => localStorage.getItem('theme'))
  const theme = resolveTheme(saved, defaultTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    setSaved(next)
  }
  return { theme, toggle }
}
```

Поведенческое отличие от старой версии: раньше `localStorage.theme` записывался при каждом визите (эффектом), теперь — только при явном переключении. У существующих пользователей ключ уже записан, для них ничего не меняется.

- [ ] **Step 4: Тест зелёный**

Run: `npm test -- useTheme`
Expected: PASS (3 теста).

- [ ] **Step 5: App передаёт контекстный дефолт**

В `src/App.tsx:114` (строка после `useAuth`, порядок хуков сохраняется):

```ts
const { theme, toggle: toggleTheme } = useTheme(user ? 'dark' : 'light')
```

- [ ] **Step 6: Полный прогон тестов + tsc**

Run: `npm test && npx tsc -b`
Expected: PASS, tsc без ошибок.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useTheme.ts src/hooks/useTheme.test.ts src/App.tsx
git commit -m "feat(theme): светлая тема по умолчанию для незалогиненных, выбор сохраняется только при toggle"
```

---

### Task 3: Тумблер темы в топбаре лендинга

**Files:**
- Modify: `src/components/landing/LandingScreen.tsx`
- Modify: `src/App.tsx:268`
- Modify: `src/components/landing/Landing.test.ts:8`

- [ ] **Step 1: Добавить ключ в тест переводов**

В `src/components/landing/Landing.test.ts:8` в массив `LANDING_KEYS` (секция «оболочка») добавить `'Сменить тему'`:

```ts
'Войти', 'Попробовать', 'Посмотреть демо', 'Готов(а) попробовать?', 'Сменить тему',
```

Run: `npm test -- Landing`
Expected: PASS (перевод уже существует в `translations.ts:24` — тест фиксирует контракт).

- [ ] **Step 2: Пропсы и кнопка в LandingScreen**

В `src/components/landing/LandingScreen.tsx` изменить сигнатуру:

```tsx
export function LandingScreen({ onTry, onDemo, theme, onToggleTheme }: {
  onTry: () => void
  onDemo?: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}) {
```

В `landing-topbar-right` перед кнопкой языка добавить:

```tsx
<button className="landing-lang" onClick={onToggleTheme} aria-label={t('Сменить тему')} title={t('Сменить тему')}>
  {theme === 'dark' ? '☀️' : '🌙'}
</button>
```

(класс `landing-lang` переиспользуется — та же квадратная кнопка 34px, новых стилей не нужно).

- [ ] **Step 3: Проброс из App**

В `src/App.tsx:268`:

```tsx
: <LandingScreen onTry={() => setShowAuth(true)} onDemo={() => { enableDemo(); window.location.reload() }} theme={theme} onToggleTheme={toggleTheme} />
```

- [ ] **Step 4: Тесты + tsc**

Run: `npm test && npx tsc -b`
Expected: PASS, без ошибок типов.

- [ ] **Step 5: Верификация в превью**

1. `preview_eval`: `localStorage.removeItem('theme'); location.reload()` → `document.documentElement.dataset.theme` должен стать `light` (незалогинен, дефолт light).
2. `preview_click` по кнопке тумблера (селектор: `.landing-topbar-right .landing-lang:first-child`) → `dataset.theme === 'dark'`, `localStorage.getItem('theme') === 'dark'`.
3. Reload → тема остаётся `dark` (выбор сохранён).

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/LandingScreen.tsx src/App.tsx src/components/landing/Landing.test.ts
git commit -m "feat(landing): тумблер темы в топбаре лендинга"
```

---

### Task 4: CSS — типографика (обе темы) + светлая база

**Files:**
- Modify: `src/components/landing/Landing.css`

- [ ] **Step 1: Базовые правки (влияют на обе темы, утверждено спекой)**

В `Landing.css` изменить существующие правила:

Строка 71 (hero-заголовок — крупнее и жирнее, mate-стиль):
```css
.landing-hero-title { font-size: clamp(30px, 4.8vw, 56px); font-weight: 800; line-height: 1.1; letter-spacing: -1.5px; margin: 0 0 20px; }
```

Строка 90 (заголовки блоков):
```css
.block-title { font-size: clamp(22px, 3.5vw, 34px); font-weight: 800; letter-spacing: -0.8px; text-align: center; margin-bottom: 10px; }
```

Строка 58 (CTA — радиус 12px):
```css
.landing-cta { background: var(--accent); color: #fff; border: none; border-radius: 12px; padding: 9px 18px; font-size: 14px; font-weight: 600; cursor: pointer; transition: transform .12s, filter .12s; }
```

Строка 16 (`@keyframes lp-breathe` — убрать анимацию opacity, чтобы светлая тема могла задать свою статичную прозрачность; пульс масштаба остаётся):
```css
@keyframes lp-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
```

- [ ] **Step 2: Светлая база (добавить в конец Landing.css)**

```css
/* ── Светлая тема лендинга (mate-стиль) ───────────────────── */
/* Лендинг в light — чисто белый (в приложении --bg остаётся #f2f2f7) */
[data-theme="light"] .landing { --bg: #ffffff; }

[data-theme="light"] .lp-bg::before { opacity: 0.05; }
[data-theme="light"] .lp-glow { opacity: 0.12; filter: blur(110px); }
[data-theme="light"] .lp-glow-a { background: #b9c8ff; }
[data-theme="light"] .lp-glow-b { background: #e6dcff; }

/* Вместо стекла — белые карты с мягкой тенью */
[data-theme="light"] .lp-glass {
  background: #fff;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: 1px solid var(--border);
  box-shadow: 0 8px 30px rgba(17, 17, 24, 0.07);
}
[data-theme="light"] .lp-glass:hover {
  border-color: var(--border);
  box-shadow: 0 14px 38px rgba(17, 17, 24, 0.12);
  transform: translateY(-2px);
}

[data-theme="light"] .landing-ghost { color: var(--text); }
[data-theme="light"] .landing-cta { box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 28%, transparent); }
```

- [ ] **Step 3: Верификация в превью (light)**

1. `preview_eval`: `localStorage.removeItem('theme'); location.reload()` — лендинг светлый.
2. `preview_screenshot` — hero: белый фон, пастельные glow-пятна, карточка демо белая с тенью (не «стекло»), CTA с мягкой тенью.
3. `preview_inspect` по `.lp-glass` (`background-color`, `box-shadow`) — `rgb(255, 255, 255)` и тень из Step 2.
4. Переключить тумблером в dark → прежний тёмный вид (glow, стекло), скриншот для сравнения.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/Landing.css
git commit -m "feat(landing): светлая тема — белая база, карты вместо стекла, mate-типографика"
```

---

### Task 5: CSS — светлые фиксы по блокам

**Files:**
- Modify: `src/components/landing/Landing.css` (продолжение light-секции)

- [ ] **Step 1: Пастельный фича-грид + Telegram + финальный CTA**

Добавить в light-секцию `Landing.css`:

```css
/* Фича-грид: пастельные карточки (фирменный приём mate) */
[data-theme="light"] .feature-cell { border: none; box-shadow: none; }
[data-theme="light"] .feature-cell:hover { box-shadow: 0 10px 26px rgba(17, 17, 24, 0.10); }
[data-theme="light"] .feature-cell:nth-child(4n + 1) { background: #eef1ff; } /* лаванда */
[data-theme="light"] .feature-cell:nth-child(4n + 2) { background: #e9f7ee; } /* мята */
[data-theme="light"] .feature-cell:nth-child(4n + 3) { background: #fdf0e6; } /* персик */
[data-theme="light"] .feature-cell:nth-child(4n)     { background: #fbf6e2; } /* лимон */

/* Телефон Telegram: экран телефона отличим от белой карты, бот-сообщения не сливаются */
[data-theme="light"] .tg-phone-screen { background: #f2f2f7; }
[data-theme="light"] .tg-msg.bot { background: #fff; border: 1px solid var(--border); }

/* Финальный CTA: свечение мягче, чем в тёмной */
[data-theme="light"] .landing-final-cta::before {
  background: radial-gradient(circle at 50% 120%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%);
}
```

- [ ] **Step 2: Аудит всех блоков в light**

В превью (light) пройти сверху вниз все блоки и проверить контраст; чинить точечными переопределениями в той же секции, если найдено:

1. **Hero + LiveDemoPanel**: табы, кольцо готовности, бары — `--surface2` (#f2f2f7) на белой карте различим.
2. **TrustStrip**: серый текст читаем, разделитель виден.
3. **HowItWorks**: обе сцены (граф — точки/линии акцента на белом; A/B периоды — серая подложка `color-mix(--text-muted 18%)` видна), инсайт-карточка с бордером.
4. **ChatBlock**: `appchat` (белый на белой карте — есть бордер `--border`, должен быть виден), сообщения user (акцент) и bot (#f2f2f7).
5. **TelegramBlock**: экран #f2f2f7, бот-сообщения белые с бордером, буллеты `→` акцентные.
6. **FeatureGrid**: пастель, тёмный текст.
7. **FinalCta + футер**: мягкое свечение, читаемый серый футер.

Каждую находку фиксить сразу (правило вида `[data-theme="light"] .селектор { ... }`) — это ожидаемая часть задачи, а не отклонение от плана.

- [ ] **Step 3: Мобильная проверка**

`preview_resize` → mobile (375px): light и dark, все блоки; inline-сцены HowItWorks на месте, топбар не разваливается (5 кнопок: тема, язык, войти, CTA — влезают; если тесно — скрыть «Войти» на <480px уже нельзя, его нет в media — проверить фактически и при переполнении добавить `@media (max-width: 480px) { .landing-topbar .landing-ghost { display: none; } }`).

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/Landing.css
git commit -m "feat(landing): light-фиксы блоков — пастельный фича-грид, telegram, final CTA"
```

---

### Task 6: Финальная верификация

**Files:** нет новых (только фиксы, если что-то найдено).

- [ ] **Step 1: Полный прогон**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test && npm run build && npm run lint`
Expected: тесты PASS, build OK. Lint: в проекте есть pre-existing ошибки — сравнить с `git stash`-базой не нужно, достаточно убедиться, что новых ошибок в изменённых файлах нет (`npx eslint src/components/landing src/hooks/useTheme.ts src/App.tsx`).

- [ ] **Step 2: Сквозной сценарий в превью**

1. Инкогнито-эквивалент: `localStorage.clear(); location.reload()` → лендинг светлый.
2. Скролл всей страницы: HowItWorks переключает шаги 0→1→2, сцена анимируется, консоль чистая.
3. Тумблер → dark: прежний тёмный вид, HowItWorks работает и там.
4. Reload → тема dark сохранилась.
5. Финальные скриншоты: light desktop, dark desktop, light mobile — показать пользователю.

- [ ] **Step 3: Итоговый отчёт пользователю**

Свести: что сделано, скриншоты обеих тем, отметить, что деплой = push в main (Vercel), но пуш — только по команде пользователя.

---

## Self-Review (выполнено при написании)

- **Spec coverage:** часть 1 (баг) → Task 1; дефолт темы → Task 2; тумблер → Task 3; визуальный язык light (фон/стекло/glow/кнопки/типографика) → Task 4; пастельный грид/telegram/final-cta/аудит блоков → Task 5; приёмка/тесты/build → Task 6. Мобильная приёмка → Task 5 Step 3. Пробелов нет.
- **Placeholders:** нет TBD/TODO; аудит в Task 5 Step 2 — намеренно чек-лист с правилом реакции, конкретные фиксы зависят от фактического рендера.
- **Type consistency:** `resolveTheme(saved: string | null, fallback: Theme)` совпадает в тесте и реализации; пропсы `theme`/`onToggleTheme` совпадают в LandingScreen и App; опция `rootMargin?: string` совпадает в хуке и вызове.
