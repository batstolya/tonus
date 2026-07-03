# Лендинг Tonus 2.0 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пересобрать лендинг по спеке `docs/superpowers/specs/2026-07-04-landing-redesign-design.md`: Linear/Vercel-стиль, Motion-анимации, живой мини-дашборд в hero, новые секции (trust strip, how-it-works, typing-чат, Telegram, фича-грид, финальный CTA).

**Architecture:** Лендинг остаётся набором секций в `src/components/landing/`; вся страница оборачивается в `LazyMotion (domAnimation, strict)` + `MotionConfig reducedMotion="user"`, анимации — только `m.*`-компоненты (transform/opacity, reveal `once`). Живая демо-панель — ленивый чанк (recharts не попадает в критический путь), данные — `demoFixture` + реальный `computeDailyScores`. Чистая логика выносится в `liveDemo.logic.ts` и тестируется в node-окружении.

**Tech Stack:** React 19, motion/react 12 (LazyMotion/m/AnimatePresence), recharts 3 (в ленивом чанке), vitest (env node — без рендера компонентов), чистый CSS в `Landing.css`.

**Важные грабли проекта:**
- Всё запускать с Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- recharts v3 + React 19: у `<Bar>`/`<Line>` ставить `isAnimationActive={false}`, иначе бары не отрисовываются.
- Внутри `<LazyMotion strict>` использовать ТОЛЬКО `m.*` (не `motion.*`) — иначе runtime error.
- Тесты не рендерят компоненты (env node): паттерн — проверка экспорта + покрытие переводов.
- eslint: в проекте 295 pre-existing ошибок — новых не добавлять (`npm run lint` до/после).

---

## Структура файлов

| Действие | Файл | Ответственность |
|---|---|---|
| create | `src/components/landing/liveDemo.logic.ts` | чистая подготовка данных демо-панели (табы, ряды для графиков, скор) |
| create | `src/components/landing/liveDemo.test.ts` | тесты логики + переводов табов |
| create | `src/components/landing/LiveDemoPanel.tsx` | ленивая интерактивная панель (4 таба, recharts, кольцо) |
| create | `src/components/landing/blocks/TrustStrip.tsx` | лента доверия |
| create | `src/components/landing/blocks/HowItWorks.tsx` | 3 шага + sticky-сцены |
| create | `src/components/landing/blocks/TelegramBlock.tsx` | мокап телефона с ботом |
| create | `src/components/landing/blocks/FinalCta.tsx` | финальный CTA + футер |
| rewrite | `src/components/landing/blocks/HeroBlock.tsx` | stagger-заголовок + слот демо-панели |
| rewrite | `src/components/landing/blocks/ChatBlock.tsx` | печатающаяся переписка |
| rewrite | `src/components/landing/blocks/FeatureGrid.tsx` | 8 стеклянных карточек |
| rewrite | `src/components/landing/LandingScreen.tsx` | порядок секций, LazyMotion, фон, sticky-topbar |
| rewrite | `src/components/landing/Landing.css` | весь стиль лендинга (сетка, стекло, свечения, секции) |
| modify | `src/lib/translations.ts` | новые ключи ru→uk/en |
| modify | `src/components/landing/Landing.test.ts` | новый список ключей |
| delete | `HeroShowcase.tsx/.css/.test.ts`, `heroShowcase.logic.ts`, `blocks/MetricsBlock.tsx`, `blocks/InsightsBlock.tsx`, `blocks/ExperimentsBlock.tsx` | заменены новыми секциями |

Не трогаем: `gating.ts`, `useInView.ts` (используется в новых блоках), `Counter.tsx`, `heroShowcase`-независимые тесты.

---

### Task 1: Логика живой демо-панели (`liveDemo.logic.ts`)

**Files:**
- Create: `src/components/landing/liveDemo.logic.ts`
- Test: `src/components/landing/liveDemo.test.ts`

- [ ] **Step 1: Написать падающий тест**

`src/components/landing/liveDemo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEMO_TABS, TAB_LABELS, prepareLiveDemoData } from './liveDemo.logic'
import { makeDemoDaily } from '../../lib/demoFixture'
import { translations } from '../../lib/translations'

describe('liveDemo.logic', () => {
  it('объявляет 4 таба с переводами uk/en', () => {
    expect(DEMO_TABS).toEqual(['readiness', 'sleep', 'heart', 'insights'])
    for (const tab of DEMO_TABS) {
      const label = TAB_LABELS[tab]
      expect(label).toBeTruthy()
      const entry = translations[label]
      expect(entry, `missing translation for "${label}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })

  it('готовит данные: скор 0..100 и 14 дней рядов', () => {
    const data = prepareLiveDemoData(makeDemoDaily(90))
    expect(data.score.readiness).toBeGreaterThan(0)
    expect(data.score.readiness).toBeLessThanOrEqual(100)
    expect(data.sleep14).toHaveLength(14)
    expect(data.heart14).toHaveLength(14)
    // ряды подписаны короткой датой MM-DD и содержат числа
    expect(data.sleep14[0].date).toMatch(/^\d{2}-\d{2}$/)
    expect(typeof data.heart14[0].resting).toBe('number')
  })
})
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run src/components/landing/liveDemo.test.ts`
Expected: FAIL — `Cannot find module './liveDemo.logic'`.

- [ ] **Step 3: Реализация**

`src/components/landing/liveDemo.logic.ts`:

```ts
import type { DailyMetrics } from '../../types'
import { computeDailyScores, type DailyScore } from '../../lib/scores'

// Табы живой демо-панели в hero. Лейблы — русские ключи i18n (переводит t()).
export const DEMO_TABS = ['readiness', 'sleep', 'heart', 'insights'] as const
export type DemoTab = (typeof DEMO_TABS)[number]

export const TAB_LABELS: Record<DemoTab, string> = {
  readiness: 'Готовность',
  sleep: 'Сон',
  heart: 'Пульс',
  insights: 'Инсайты',
}

export interface LiveDemoData {
  score: DailyScore
  sleep14: { date: string; deep: number | null; rem: number | null; core: number | null }[]
  heart14: { date: string; resting: number | null; max: number | null }[]
}

// Готовит данные панели из daily-метрик (демо-фикстура). Скор — той же
// формулой, что и в приложении, чтобы лендинг показывал настоящий продукт.
export function prepareLiveDemoData(daily: DailyMetrics[]): LiveDemoData {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const scores = computeDailyScores(sorted)
  const score = scores[scores.length - 1]
  const last14 = sorted.slice(-14)
  return {
    score,
    sleep14: last14.map(d => ({
      date: d.date.slice(5),
      deep: d.sleepDeep != null ? Math.round(d.sleepDeep * 10) / 10 : null,
      rem: d.sleepREM != null ? Math.round(d.sleepREM * 10) / 10 : null,
      core: d.sleepCore != null ? Math.round(d.sleepCore * 10) / 10 : null,
    })),
    heart14: last14.map(d => ({
      date: d.date.slice(5),
      resting: d.restingHeartRate != null ? Math.round(d.restingHeartRate) : null,
      max: d.heartRate ? Math.round(d.heartRate.max) : null,
    })),
  }
}
```

- [ ] **Step 4: Прогнать тест**

Run: `npx vitest run src/components/landing/liveDemo.test.ts`
Expected: первый тест ещё падает на переводах `Инсайты`? Нет — `Готовность`, `Сон`, `Пульс`, `Инсайты` уже есть в `translations.ts` (навигация приложения). Оба теста PASS. Если какой-то из четырёх ключей отсутствует — добавить его в Task 2 списком.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/liveDemo.logic.ts src/components/landing/liveDemo.test.ts
git commit -m "feat(landing): live demo panel data logic"
```

---

### Task 2: Переводы новых строк + обновление Landing.test.ts

**Files:**
- Modify: `src/lib/translations.ts` (секция лендинга)
- Modify: `src/components/landing/Landing.test.ts`

- [ ] **Step 1: Обновить список ключей в тесте (тест должен упасть)**

Заменить массив `LANDING_KEYS` в `src/components/landing/Landing.test.ts` на:

```ts
const LANDING_KEYS = [
  // оболочка
  'Войти', 'Попробовать', 'Посмотреть демо', 'Готов(а) попробовать?',
  'Всё о твоём здоровье — в одном месте. И AI, который находит, что на тебя реально влияет.',
  'Личный хаб здоровья: Apple Watch, привычки и анализы — а AI находит закономерности.',
  // живое демо
  'Готовность', 'Сон', 'Пульс', 'Инсайты',
  'Это живые данные — потрогай', 'Открыть полное демо',
  'Восстановление', 'Пульс покоя', 'Глубокий',
  // лента доверия
  'Apple Watch — синк сам', 'Telegram-бот', 'AI на Gemini', 'Данные твои — экспорт в один клик',
  // как это работает
  'Как это работает',
  'Часы синхронизируются сами',
  'Раз в час Apple Health отправляет свежие данные — без кнопок и кабелей.',
  'AI находит связи',
  'Сон, кофе, стресс, анализы — Tonus связывает всё и показывает, что на что влияет.',
  'Проверяешь экспериментом',
  'Меняешь привычку — Tonus честно считает «до» и «после».',
  '☕ Кофе после 15:00', '→ сон на 1.5 ч короче',
  'Период A', 'Период B', 'Результат', 'глубокий сон',
  // чат
  'Спрашивай о своём здоровье — отвечает по твоим данным',
  'Почему я так устаю днём?',
  'По твоим данным: за последнюю неделю сон в среднем 6.2 ч и поздний кофе 4 дня из 7. Попробуй сдвинуть кофе на утро.',
  'Что показали мои анализы?',
  'Ферритин 28 — ниже нормы, это может объяснять усталость из твоих заметок. Обсуди с врачом добавку железа.',
  'печатает…', 'ИИ отвечает по твоим данным, а не из интернета.',
  // telegram
  'Telegram — пульт от твоего здоровья',
  'Напоминания о препаратах в нужное время',
  'Лог одной строкой: «кофе», «магний», «пробежка»',
  'Отчёт раз в две недели — что улучшилось, что просело',
  '💊 Магний 400мг — пора принять', '✓ Принял', '☕ Записал: кофе в 14:20',
  '📊 За 2 недели: сон +40 мин, HRV +6 мс',
  // фича-грид
  'И это ещё не всё', 'Препараты и лечение', 'Анализы из лаборатории', 'Питание', 'Цели',
  'Эксперименты', 'Проблемы и симптомы', 'Экспорт данных', 'Три языка: ru / uk / en',
]
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/components/landing/Landing.test.ts`
Expected: FAIL — `missing translation for "..."` на новых ключах.

- [ ] **Step 3: Добавить переводы**

В `src/lib/translations.ts`, в конец секции лендинга (найти по комментарию `// ── Лендинг` или добавить рядом с существующими лендинг-ключами):

```ts
  // ── Лендинг 2.0 ────────────────────────────────────────────
  'Это живые данные — потрогай': { uk: 'Це живі дані — поторкай', en: 'Live data — click around' },
  'Открыть полное демо': { uk: 'Відкрити повне демо', en: 'Open the full demo' },
  'Apple Watch — синк сам': { uk: 'Apple Watch — синк сам', en: 'Apple Watch — syncs itself' },
  'Telegram-бот': { uk: 'Telegram-бот', en: 'Telegram bot' },
  'AI на Gemini': { uk: 'AI на Gemini', en: 'AI powered by Gemini' },
  'Данные твои — экспорт в один клик': { uk: 'Дані твої — експорт в один клік', en: 'Your data — one-click export' },
  'Как это работает': { uk: 'Як це працює', en: 'How it works' },
  'Часы синхронизируются сами': { uk: 'Годинник синхронізується сам', en: 'Your watch syncs itself' },
  'Раз в час Apple Health отправляет свежие данные — без кнопок и кабелей.': { uk: 'Раз на годину Apple Health надсилає свіжі дані — без кнопок і кабелів.', en: 'Every hour Apple Health pushes fresh data — no buttons, no cables.' },
  'AI находит связи': { uk: 'AI знаходить зв’язки', en: 'AI finds the links' },
  'Сон, кофе, стресс, анализы — Tonus связывает всё и показывает, что на что влияет.': { uk: 'Сон, кава, стрес, аналізи — Tonus пов’язує все і показує, що на що впливає.', en: 'Sleep, coffee, stress, labs — Tonus connects everything and shows what affects what.' },
  'Проверяешь экспериментом': { uk: 'Перевіряєш експериментом', en: 'You verify with an experiment' },
  'Меняешь привычку — Tonus честно считает «до» и «после».': { uk: 'Змінюєш звичку — Tonus чесно рахує «до» і «після».', en: 'Change a habit — Tonus honestly measures before vs after.' },
  'Что показали мои анализы?': { uk: 'Що показали мої аналізи?', en: 'What did my labs show?' },
  'Ферритин 28 — ниже нормы, это может объяснять усталость из твоих заметок. Обсуди с врачом добавку железа.': { uk: 'Феритин 28 — нижче норми, це може пояснювати втому з твоїх нотаток. Обговори з лікарем добавку заліза.', en: 'Ferritin is 28 — below range, which may explain the fatigue in your notes. Discuss iron supplementation with your doctor.' },
  'ИИ отвечает по твоим данным, а не из интернета.': { uk: 'ШІ відповідає за твоїми даними, а не з інтернету.', en: 'The AI answers from your data, not the internet.' },
  'Telegram — пульт от твоего здоровья': { uk: 'Telegram — пульт від твого здоров’я', en: 'Telegram — the remote control for your health' },
  'Напоминания о препаратах в нужное время': { uk: 'Нагадування про препарати в потрібний час', en: 'Supplement reminders at the right time' },
  'Лог одной строкой: «кофе», «магний», «пробежка»': { uk: 'Лог одним рядком: «кава», «магній», «пробіжка»', en: 'One-line logging: “coffee”, “magnesium”, “run”' },
  'Отчёт раз в две недели — что улучшилось, что просело': { uk: 'Звіт раз на два тижні — що покращилось, що просіло', en: 'A report every two weeks — what improved, what slipped' },
  '💊 Магний 400мг — пора принять': { uk: '💊 Магній 400мг — час прийняти', en: '💊 Magnesium 400mg — time to take it' },
  '✓ Принял': { uk: '✓ Прийняв', en: '✓ Taken' },
  '☕ Записал: кофе в 14:20': { uk: '☕ Записав: кава о 14:20', en: '☕ Logged: coffee at 14:20' },
  '📊 За 2 недели: сон +40 мин, HRV +6 мс': { uk: '📊 За 2 тижні: сон +40 хв, HRV +6 мс', en: '📊 Last 2 weeks: sleep +40 min, HRV +6 ms' },
  'Проблемы и симптомы': { uk: 'Проблеми і симптоми', en: 'Concerns & symptoms' },
```

Примечание: часть ключей (`'Эксперименты'`, `'Готовность'`, `'Восстановление'`, `'Пульс покоя'`, `'Глубокий'`, `'Посмотреть демо'` и т.п.) уже есть в словаре — добавлять только отсутствующие; тест покажет какие.

- [ ] **Step 4: Прогнать тесты лендинга**

Run: `npx vitest run src/components/landing/`
Expected: `Landing.test.ts` PASS, `liveDemo.test.ts` PASS. (`HeroShowcase.test.ts` ещё существует и проходит — удалим в Task 9.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/translations.ts src/components/landing/Landing.test.ts
git commit -m "feat(landing): translations for landing 2.0 strings"
```

---

### Task 3: Каркас — LandingScreen (LazyMotion, фон, sticky-topbar) + база CSS

Секции пока старые — экран должен продолжать работать после каждого шага.

**Files:**
- Rewrite: `src/components/landing/LandingScreen.tsx`
- Modify: `src/components/landing/Landing.css` (добавить базу, старые классы пока не удалять)

- [ ] **Step 1: Новый LandingScreen**

`src/components/landing/LandingScreen.tsx` — заменить целиком:

```tsx
import { useEffect, useState } from 'react'
import { LazyMotion, domAnimation, MotionConfig } from 'motion/react'
import { useT } from '../../lib/i18n'
import { HeroBlock } from './blocks/HeroBlock'
import { MetricsBlock } from './blocks/MetricsBlock'
import { InsightsBlock } from './blocks/InsightsBlock'
import { ChatBlock } from './blocks/ChatBlock'
import { ExperimentsBlock } from './blocks/ExperimentsBlock'
import { FeatureGrid } from './blocks/FeatureGrid'
import './Landing.css'

export function LandingScreen({ onTry, onDemo }: { onTry: () => void; onDemo?: () => void }) {
  const { t, lang, setLang } = useT()
  const nextLang = lang === 'ru' ? 'uk' : lang === 'uk' ? 'en' : 'ru'
  const flag = lang === 'ru' ? '🇷🇺' : lang === 'uk' ? '🇺🇦' : '🇬🇧'
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div className="landing">
          <div className="lp-bg" aria-hidden="true">
            <span className="lp-glow lp-glow-a" />
            <span className="lp-glow lp-glow-b" />
          </div>

          <header className={`landing-topbar${scrolled ? ' scrolled' : ''}`}>
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
            <HeroBlock onTry={onTry} onDemo={onDemo} />
            {/* Старые блоки: заменяются по мере выполнения задач 5–8 */}
            <MetricsBlock />
            <InsightsBlock />
            <ChatBlock />
            <ExperimentsBlock />
            <FeatureGrid />
            <section className="landing-final-cta">
              <h2>{t('Готов(а) попробовать?')}</h2>
              <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
            </section>
          </main>
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
```

- [ ] **Step 2: База CSS**

В начало `src/components/landing/Landing.css` добавить (существующие правила пока не трогать):

```css
/* ── Лендинг 2.0: фон, стекло, топбар ─────────────────────── */
.landing { position: relative; isolation: isolate; }

.lp-bg { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
.lp-bg::before {
  content: ''; position: absolute; inset: 0; opacity: 0.035;
  background-image:
    linear-gradient(var(--text) 1px, transparent 1px),
    linear-gradient(90deg, var(--text) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, #000 40%, transparent 100%);
}
.lp-glow { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.16; }
.lp-glow-a { width: 520px; height: 520px; top: -160px; left: 8%; background: var(--accent); animation: lp-breathe 12s ease-in-out infinite; }
.lp-glow-b { width: 420px; height: 420px; top: 60px; right: 4%; background: #9f7cff; animation: lp-breathe 14s ease-in-out 2s infinite; }
@keyframes lp-breathe { 0%, 100% { transform: scale(1); opacity: 0.16; } 50% { transform: scale(1.15); opacity: 0.22; } }
@media (prefers-reduced-motion: reduce) { .lp-glow { animation: none; } }

.landing-topbar { position: sticky; top: 0; z-index: 50; transition: background 0.25s, border-color 0.25s, backdrop-filter 0.25s; border-bottom: 1px solid transparent; }
.landing-topbar.scrolled {
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(12px);
  border-bottom-color: var(--border);
}

.lp-glass {
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 16px;
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
}
.lp-glass:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 18%, transparent);
}

.lp-grad-text {
  background: linear-gradient(100deg, var(--accent), #9f7cff);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

.landing-block { padding: 72px 0; }
.block-kicker { font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); margin: 0 0 10px; }
```

Проверить, что `.landing-topbar` в старом CSS не имеет конфликтующего `position` (если имеет — удалить старое свойство).

- [ ] **Step 3: Проверка**

Run: `npx tsc -b && npx vitest run src/components/landing/ && npm run build`
Expected: всё зелёное. В превью (`npm run dev`, без demo-флага): лендинг открывается, фон с сеткой и свечениями, топбар получает подложку после скролла.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/LandingScreen.tsx src/components/landing/Landing.css
git commit -m "feat(landing): LazyMotion shell, grid+glow background, sticky topbar"
```

---

### Task 4: LiveDemoPanel + новый HeroBlock

**Files:**
- Create: `src/components/landing/LiveDemoPanel.tsx`
- Rewrite: `src/components/landing/blocks/HeroBlock.tsx`
- Modify: `src/components/landing/Landing.css`

- [ ] **Step 1: LiveDemoPanel**

`src/components/landing/LiveDemoPanel.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis } from 'recharts'
import { useT } from '../../lib/i18n'
import { makeDemoDaily } from '../../lib/demoFixture'
import { DEMO_TABS, TAB_LABELS, prepareLiveDemoData, type DemoTab } from './liveDemo.logic'

const INSIGHTS: { title: string; text: string }[] = [
  { title: '☕ Кофе после 15:00', text: '→ сон на 1.5 ч короче' },
  { title: '🍽️ Поздняя еда', text: '→ HRV падает на 15%' },
  { title: '💼 Стрессовые дни', text: '→ пульс покоя выше на 8 уд/мин' },
]

const RING_C = 2 * Math.PI * 52

function ReadinessView({ score, recovery, sleep }: { score: number; recovery: number | null; sleep: number | null }) {
  const { t } = useT()
  return (
    <div className="ld-readiness">
      <div className="ld-ring-wrap">
        <svg viewBox="0 0 120 120" className="ld-ring">
          <circle cx="60" cy="60" r="52" className="ld-ring-track" />
          <m.circle
            cx="60" cy="60" r="52" className="ld-ring-fill"
            strokeDasharray={RING_C}
            initial={{ strokeDashoffset: RING_C }}
            animate={{ strokeDashoffset: RING_C * (1 - score / 100) }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
        </svg>
        <div className="ld-ring-num">{score}</div>
      </div>
      <div className="ld-ring-bars">
        {[
          { label: t('Восстановление'), v: recovery },
          { label: t('Сон'), v: sleep },
          { label: t('Пульс покоя'), v: score },
        ].map(b => (
          <div key={b.label} className="ld-bar-row">
            <span>{b.label}</span>
            <div className="ld-bar-track">
              <m.div
                className="ld-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${b.v ?? 0}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LiveDemoPanel({ onDemo }: { onDemo?: () => void }) {
  const { t } = useT()
  const [tab, setTab] = useState<DemoTab>('readiness')
  const data = useMemo(() => prepareLiveDemoData(makeDemoDaily()), [])

  return (
    <div className="ld-panel lp-glass">
      <div className="ld-tabs" role="tablist">
        {DEMO_TABS.map(id => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`ld-tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            {t(TAB_LABELS[id])}
            {tab === id && <m.span layoutId="ld-tab-underline" className="ld-tab-underline" />}
          </button>
        ))}
      </div>

      <div className="ld-body">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            {tab === 'readiness' && (
              <ReadinessView
                score={Math.round(data.score.readiness ?? 0)}
                recovery={data.score.recovery_score}
                sleep={data.score.sleep_score}
              />
            )}
            {tab === 'sleep' && (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={data.sleep14} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={[0, 12]} />
                  <Bar dataKey="deep" stackId="s" fill="#6c8fff" isAnimationActive={false} />
                  <Bar dataKey="rem" stackId="s" fill="#5bc896" isAnimationActive={false} />
                  <Bar dataKey="core" stackId="s" fill="#8888a0" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {tab === 'heart' && (
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={data.heart14} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                  <Line dataKey="resting" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="max" stroke="#ff6b6b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
            {tab === 'insights' && (
              <div className="ld-insights">
                {INSIGHTS.map(i => (
                  <div key={i.title} className="ld-insight">
                    <span className="ld-insight-title">{t(i.title)}</span>
                    <span className="ld-insight-text">{t(i.text)}</span>
                  </div>
                ))}
              </div>
            )}
          </m.div>
        </AnimatePresence>
      </div>

      <div className="ld-footer">
        <span>{t('Это живые данные — потрогай')}</span>
        {onDemo && <button className="ld-demo-link" onClick={onDemo}>{t('Открыть полное демо')} →</button>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Новый HeroBlock**

`src/components/landing/blocks/HeroBlock.tsx` — заменить целиком:

```tsx
import { lazy, Suspense } from 'react'
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

const LiveDemoPanel = lazy(() =>
  import('../LiveDemoPanel').then(mod => ({ default: mod.LiveDemoPanel })),
)

const titleVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.08 } },
}
const wordVariants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
}

export function HeroBlock({ onTry, onDemo }: { onTry: () => void; onDemo?: () => void }) {
  const { t } = useT()
  const title = t('Всё о твоём здоровье — в одном месте. И AI, который находит, что на тебя реально влияет.')
  return (
    <section className="landing-hero">
      <div className="landing-hero-grid">
        <div className="landing-hero-copy">
          <m.h1 className="landing-hero-title" variants={titleVariants} initial="hidden" animate="show">
            {title.split(' ').map((w, i) => (
              <m.span
                key={i}
                variants={wordVariants}
                className={/AI|ШІ|ИИ/.test(w) ? 'lp-word lp-grad-text' : 'lp-word'}
              >
                {w}{' '}
              </m.span>
            ))}
          </m.h1>
          <m.p
            className="landing-hero-sub"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.5 }}
          >
            {t('Личный хаб здоровья: Apple Watch, привычки и анализы — а AI находит закономерности.')}
          </m.p>
          <m.div
            className="landing-hero-actions"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
            {onDemo && <button className="landing-ghost landing-cta-lg" onClick={onDemo}>{t('Посмотреть демо')}</button>}
          </m.div>
        </div>
        <div className="landing-hero-demo">
          <Suspense fallback={<div className="ld-panel ld-skeleton lp-glass" />}>
            <LiveDemoPanel onDemo={onDemo} />
          </Suspense>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: CSS панели и hero**

Добавить в `Landing.css`:

```css
/* ── Живая демо-панель ────────────────────────────────────── */
.ld-panel { width: 100%; max-width: 440px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.ld-skeleton { aspect-ratio: 440 / 330; }
.ld-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
.ld-tab { position: relative; background: none; border: none; color: var(--text-muted); font-size: 13.5px; padding: 8px 12px 10px; cursor: pointer; }
.ld-tab.active { color: var(--text); }
.ld-tab-underline { position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; background: var(--accent); border-radius: 2px; display: block; }
.ld-body { min-height: 200px; }
.ld-readiness { display: flex; align-items: center; gap: 20px; padding: 8px 4px; }
.ld-ring-wrap { position: relative; width: 132px; flex: none; }
.ld-ring { transform: rotate(-90deg); }
.ld-ring-track { fill: none; stroke: var(--surface2); stroke-width: 9; }
.ld-ring-fill { fill: none; stroke: var(--green, #5bc896); stroke-width: 9; stroke-linecap: round; }
.ld-ring-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 800; }
.ld-ring-bars { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.ld-bar-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--text-muted); }
.ld-bar-row > span { width: 110px; flex: none; }
.ld-bar-track { flex: 1; height: 6px; border-radius: 4px; background: var(--surface2); overflow: hidden; }
.ld-bar-fill { height: 100%; border-radius: 4px; background: var(--green, #5bc896); }
.ld-insights { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
.ld-insight { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; }
.ld-insight-title { font-size: 13.5px; font-weight: 600; }
.ld-insight-text { font-size: 12.5px; color: var(--text-muted); }
.ld-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 10px; flex-wrap: wrap; }
.ld-demo-link { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 12.5px; padding: 0; }
.ld-demo-link:hover { text-decoration: underline; }
.lp-word { display: inline-block; }
```

- [ ] **Step 4: Проверка**

Run: `npx tsc -b && npx vitest run src/components/landing/ && npm run build`
Expected: зелёно; в выводе build появился отдельный чанк `LiveDemoPanel-*.js`, entry-чанк вырос не больше чем на ~40KB gzip (Motion). В превью: заголовок появляется каскадом, панель кликается по 4 табам, кольцо анимируется, «Открыть полное демо» запускает демо.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/LiveDemoPanel.tsx src/components/landing/blocks/HeroBlock.tsx src/components/landing/Landing.css
git commit -m "feat(landing): hero with staggered headline and live demo panel"
```

---

### Task 5: TrustStrip

**Files:**
- Create: `src/components/landing/blocks/TrustStrip.tsx`
- Modify: `src/components/landing/LandingScreen.tsx` (вставить после HeroBlock)
- Modify: `src/components/landing/Landing.css`

- [ ] **Step 1: Компонент**

`src/components/landing/blocks/TrustStrip.tsx`:

```tsx
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

const ITEMS = [
  { icon: '⌚', label: 'Apple Watch — синк сам' },
  { icon: '✈️', label: 'Telegram-бот' },
  { icon: '✨', label: 'AI на Gemini' },
  { icon: '🔐', label: 'Данные твои — экспорт в один клик' },
]

export function TrustStrip() {
  const { t } = useT()
  return (
    <section className="lp-trust" aria-label="trust">
      {ITEMS.map((it, i) => (
        <m.span
          key={it.label}
          className="lp-trust-item"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ delay: i * 0.08, duration: 0.45 }}
        >
          <span aria-hidden="true">{it.icon}</span> {t(it.label)}
        </m.span>
      ))}
    </section>
  )
}
```

- [ ] **Step 2: Вставить в LandingScreen**

В `LandingScreen.tsx`: `import { TrustStrip } from './blocks/TrustStrip'` и `<TrustStrip />` сразу после `<HeroBlock ... />`.

- [ ] **Step 3: CSS**

```css
/* ── Лента доверия ────────────────────────────────────────── */
.lp-trust { display: flex; justify-content: center; gap: 28px; flex-wrap: wrap; padding: 8px 0 40px; border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent); }
.lp-trust-item { font-size: 13.5px; color: var(--text-muted); display: inline-flex; gap: 7px; align-items: center; }
```

- [ ] **Step 4: Проверка + Commit**

Run: `npx tsc -b && npm run build` → зелёно; в превью строка появляется stagger'ом.

```bash
git add src/components/landing/blocks/TrustStrip.tsx src/components/landing/LandingScreen.tsx src/components/landing/Landing.css
git commit -m "feat(landing): trust strip"
```

---

### Task 6: HowItWorks (3 шага, sticky-сцены) — замена Metrics/Insights/Experiments

**Files:**
- Create: `src/components/landing/blocks/HowItWorks.tsx`
- Modify: `src/components/landing/LandingScreen.tsx`
- Modify: `src/components/landing/Landing.css`
- Delete: `src/components/landing/blocks/MetricsBlock.tsx`, `InsightsBlock.tsx`, `ExperimentsBlock.tsx`

- [ ] **Step 1: Компонент**

`src/components/landing/blocks/HowItWorks.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'
import { Counter } from '../../ui/Counter'

// Сцена 1: часы → поток точек → карточка приложения
function SyncScene() {
  return (
    <div className="hiw-scene" aria-hidden="true">
      <span className="hiw-watch">⌚</span>
      <span className="hiw-dots"><i /><i /><i /></span>
      <span className="hiw-app">📊</span>
    </div>
  )
}

// Сцена 2: граф связей + карточка-инсайт
function AiScene() {
  const { t } = useT()
  return (
    <div className="hiw-scene" aria-hidden="true">
      <svg className="hiw-web" viewBox="0 0 260 120">
        <circle cx="40" cy="30" r="5" /><circle cx="130" cy="70" r="7" />
        <circle cx="220" cy="24" r="5" /><circle cx="80" cy="104" r="5" /><circle cx="200" cy="100" r="5" />
        <path d="M40,30 L130,70" /><path d="M220,24 L130,70" /><path d="M80,104 L130,70" /><path d="M200,100 L130,70" />
      </svg>
      <div className="hiw-insight">
        <b>{t('☕ Кофе после 15:00')}</b>
        <span>{t('→ сон на 1.5 ч короче')}</span>
      </div>
    </div>
  )
}

// Сцена 3: A/B периоды + результат
function ExperimentScene({ animate }: { animate: boolean }) {
  const { t } = useT()
  return (
    <div className="hiw-scene" aria-hidden="true">
      <div className="hiw-ab">
        <div className="hiw-period a"><span>{t('Период A')}</span></div>
        <div className="hiw-period b"><span>{t('Период B')}</span></div>
      </div>
      <div className="hiw-result">
        <span>{t('Результат')}</span>
        <b>+{animate ? <Counter value={12} /> : 12}%</b>
        <span>{t('глубокий сон')}</span>
      </div>
    </div>
  )
}

const STEPS = [
  { title: 'Часы синхронизируются сами', text: 'Раз в час Apple Health отправляет свежие данные — без кнопок и кабелей.' },
  { title: 'AI находит связи', text: 'Сон, кофе, стресс, анализы — Tonus связывает всё и показывает, что на что влияет.' },
  { title: 'Проверяешь экспериментом', text: 'Меняешь привычку — Tonus честно считает «до» и «после».' },
]

function Scene({ index, animate }: { index: number; animate: boolean }) {
  if (index === 0) return <SyncScene />
  if (index === 1) return <AiScene />
  return <ExperimentScene animate={animate} />
}

function StepText({ index, active, onActive, children }: {
  index: number; active: boolean; onActive: (i: number) => void; children: React.ReactNode
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.6, once: false })
  useEffect(() => { if (inView) onActive(index) }, [inView, index, onActive])
  return (
    <div ref={ref} className={`hiw-step${active ? ' active' : ''}`}>
      {children}
    </div>
  )
}

export function HowItWorks() {
  const { t } = useT()
  const [active, setActive] = useState(0)
  return (
    <section className="landing-block">
      <p className="block-kicker">{t('Как это работает')}</p>
      <div className="hiw-grid">
        <div className="hiw-steps">
          {STEPS.map((s, i) => (
            <StepText key={s.title} index={i} active={active === i} onActive={setActive}>
              <span className="hiw-num">{i + 1}</span>
              <h3>{t(s.title)}</h3>
              <p>{t(s.text)}</p>
              {/* мобильная встроенная сцена; на десктопе скрыта */}
              <div className="hiw-inline-scene"><Scene index={i} animate /></div>
            </StepText>
          ))}
        </div>
        <div className="hiw-sticky lp-glass">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={active}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4 }}
            >
              <Scene index={active} animate />
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Заменить блоки в LandingScreen**

В `LandingScreen.tsx`: убрать импорты и JSX `MetricsBlock`, `InsightsBlock`, `ExperimentsBlock`; добавить `import { HowItWorks } from './blocks/HowItWorks'` и `<HowItWorks />` после `<TrustStrip />` (ChatBlock остаётся следом).

- [ ] **Step 3: Удалить старые блоки**

```bash
git rm src/components/landing/blocks/MetricsBlock.tsx src/components/landing/blocks/InsightsBlock.tsx src/components/landing/blocks/ExperimentsBlock.tsx
```

- [ ] **Step 4: CSS**

```css
/* ── Как это работает ─────────────────────────────────────── */
.hiw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: start; }
.hiw-steps { display: flex; flex-direction: column; gap: 8vh; padding: 4vh 0; }
.hiw-step { opacity: 0.45; transition: opacity 0.3s; padding: 12px 0; }
.hiw-step.active { opacity: 1; }
.hiw-num { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; border: 1px solid var(--accent); color: var(--accent); border-radius: 50%; font-size: 13px; margin-bottom: 10px; }
.hiw-step h3 { margin: 0 0 8px; font-size: 22px; }
.hiw-step p { margin: 0; color: var(--text-muted); font-size: 15px; max-width: 40ch; }
.hiw-sticky { position: sticky; top: 96px; min-height: 280px; display: flex; align-items: center; justify-content: center; padding: 24px; }
.hiw-inline-scene { display: none; }
.hiw-scene { display: flex; flex-direction: column; align-items: center; gap: 18px; font-size: 40px; }
.hiw-dots { display: flex; gap: 8px; }
.hiw-dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: hiw-flow 1.2s ease-in-out infinite; }
.hiw-dots i:nth-child(2) { animation-delay: 0.2s; }
.hiw-dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes hiw-flow { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(10px); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .hiw-dots i { animation: none; } }
.hiw-web { width: 100%; max-width: 260px; }
.hiw-web circle { fill: var(--accent); }
.hiw-web path { stroke: color-mix(in srgb, var(--accent) 55%, transparent); stroke-width: 1.5; fill: none; stroke-dasharray: 140; stroke-dashoffset: 140; animation: hiw-draw 1s ease-out forwards; }
@keyframes hiw-draw { to { stroke-dashoffset: 0; } }
.hiw-insight { display: flex; flex-direction: column; gap: 2px; font-size: 14px; border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; }
.hiw-insight span { color: var(--text-muted); font-size: 13px; }
.hiw-ab { display: flex; gap: 8px; width: 100%; max-width: 300px; }
.hiw-period { flex: 1; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; }
.hiw-period.a { background: color-mix(in srgb, var(--text-muted) 18%, transparent); }
.hiw-period.b { background: color-mix(in srgb, var(--green, #5bc896) 30%, transparent); }
.hiw-result { display: flex; align-items: baseline; gap: 10px; font-size: 14px; color: var(--text-muted); }
.hiw-result b { font-size: 32px; color: var(--green, #5bc896); }
@media (max-width: 860px) {
  .hiw-grid { grid-template-columns: 1fr; }
  .hiw-sticky { display: none; }
  .hiw-steps { gap: 28px; }
  .hiw-step { opacity: 1; }
  .hiw-inline-scene { display: block; margin-top: 16px; }
}
```

Также удалить из старого CSS правила, использовавшиеся только удалёнными блоками (`.metrics-grid`, `.lp-metric-card`, `.lp-bars`, `.lp-bar`, `.insights-web`, `.node`, `.web-lines`, `.lp-insight-card*`, `.lp-exp-*`) — проверить grep'ом, что классы больше нигде не используются.

- [ ] **Step 5: Проверка + Commit**

Run: `npx tsc -b && npx vitest run src/components/landing/ && npm run build` → зелёно. Превью: скролл по секции переключает сцены справа, на мобилке (375px) сцены встроены в карточки.

```bash
git add -A src/components/landing
git commit -m "feat(landing): how-it-works sticky scenes, drop old metric/insight/experiment blocks"
```

---

### Task 7: ChatBlock с печатающейся перепиской

**Files:**
- Rewrite: `src/components/landing/blocks/ChatBlock.tsx`
- Modify: `src/components/landing/Landing.css`

- [ ] **Step 1: Компонент**

`src/components/landing/blocks/ChatBlock.tsx` — заменить целиком:

```tsx
import { useEffect, useState } from 'react'
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'
import { useInView } from '../useInView'

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// Печатает text посимвольно, когда start=true. При reduce-motion — сразу весь.
function useTypewriter(text: string, start: boolean, cps = 45): { out: string; done: boolean } {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!start) return
    if (reducedMotion()) { setN(text.length); return }
    let i = 0
    const id = setInterval(() => {
      i += 1
      setN(i)
      if (i >= text.length) clearInterval(id)
    }, 1000 / cps)
    return () => clearInterval(id)
  }, [start, text, cps])
  return { out: text.slice(0, n), done: n >= text.length }
}

const EXCHANGES = [
  {
    q: 'Почему я так устаю днём?',
    a: 'По твоим данным: за последнюю неделю сон в среднем 6.2 ч и поздний кофе 4 дня из 7. Попробуй сдвинуть кофе на утро.',
  },
  {
    q: 'Что показали мои анализы?',
    a: 'Ферритин 28 — ниже нормы, это может объяснять усталость из твоих заметок. Обсуди с врачом добавку железа.',
  },
]

function Exchange({ q, a, start, onDone }: { q: string; a: string; start: boolean; onDone: () => void }) {
  const { t } = useT()
  const [showTyping, setShowTyping] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const answer = useTypewriter(t(a), showAnswer)

  useEffect(() => {
    if (!start) return
    const t1 = setTimeout(() => setShowTyping(true), 500)
    const t2 = setTimeout(() => { setShowTyping(false); setShowAnswer(true) }, reducedMotion() ? 500 : 1600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [start])

  useEffect(() => { if (answer.done) onDone() }, [answer.done, onDone])

  if (!start) return null
  return (
    <>
      <m.div className="appchat-msg user" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
        {t(q)}
      </m.div>
      {showTyping && <div className="appchat-typing">{t('печатает…')}</div>}
      {showAnswer && <div className="appchat-msg bot">{answer.out}<span className={answer.done ? '' : 'appchat-caret'} /></div>}
    </>
  )
}

export function ChatBlock() {
  const { t } = useT()
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.4 })
  const [stage, setStage] = useState(0) // сколько обменов запущено/завершено

  return (
    <section className="landing-block" ref={ref}>
      <h2 className="block-title">💬 {t('Спрашивай о своём здоровье — отвечает по твоим данным')}</h2>
      <div className="chat-stage lp-glass">
        <div className="appchat">
          <Exchange {...EXCHANGES[0]} start={inView} onDone={() => setStage(s => Math.max(s, 1))} />
          <Exchange {...EXCHANGES[1]} start={stage >= 1} onDone={() => setStage(s => Math.max(s, 2))} />
        </div>
      </div>
      <p className="block-sub" style={{ textAlign: 'center' }}>{t('ИИ отвечает по твоим данным, а не из интернета.')}</p>
    </section>
  )
}
```

- [ ] **Step 2: CSS**

Добавить (старые `.appchat*`-правила сохранить, добавить недостающее):

```css
.chat-stage { max-width: 560px; margin: 0 auto 16px; padding: 20px; }
.appchat-caret { display: inline-block; width: 2px; height: 1em; background: var(--accent); margin-left: 2px; vertical-align: text-bottom; animation: lp-caret 0.8s step-start infinite; }
@keyframes lp-caret { 50% { opacity: 0; } }
```

- [ ] **Step 3: Проверка + Commit**

Run: `npx tsc -b && npx vitest run src/components/landing/ && npm run build` → зелёно. Превью: при доскролле — вопрос въезжает, «печатает…», ответ печатается, затем второй обмен.

```bash
git add src/components/landing/blocks/ChatBlock.tsx src/components/landing/Landing.css
git commit -m "feat(landing): typing AI chat demo with labs exchange"
```

---

### Task 8: TelegramBlock

**Files:**
- Create: `src/components/landing/blocks/TelegramBlock.tsx`
- Modify: `src/components/landing/LandingScreen.tsx` (после ChatBlock)
- Modify: `src/components/landing/Landing.css`

- [ ] **Step 1: Компонент**

```tsx
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

const MESSAGES = [
  { from: 'bot', text: '💊 Магний 400мг — пора принять', chip: '✓ Принял' },
  { from: 'user', text: 'кофе' },
  { from: 'bot', text: '☕ Записал: кофе в 14:20' },
  { from: 'bot', text: '📊 За 2 недели: сон +40 мин, HRV +6 мс' },
] as const

const BULLETS = [
  'Напоминания о препаратах в нужное время',
  'Лог одной строкой: «кофе», «магний», «пробежка»',
  'Отчёт раз в две недели — что улучшилось, что просело',
]

export function TelegramBlock() {
  const { t } = useT()
  return (
    <section className="landing-block">
      <div className="tg-grid">
        <div className="tg-copy">
          <h2 className="block-title">✈️ {t('Telegram — пульт от твоего здоровья')}</h2>
          <ul className="tg-bullets">
            {BULLETS.map(b => <li key={b}>{t(b)}</li>)}
          </ul>
        </div>
        <div className="tg-phone lp-glass" aria-hidden="true">
          <div className="tg-phone-screen">
            {MESSAGES.map((msg, i) => (
              <m.div
                key={i}
                className={`tg-msg ${msg.from}`}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: 0.3 + i * 0.35, duration: 0.4 }}
              >
                {t(msg.text)}
                {'chip' in msg && msg.chip && <span className="tg-chip">{t(msg.chip)}</span>}
              </m.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Вставить в LandingScreen** (`<TelegramBlock />` после `<ChatBlock />`).

- [ ] **Step 3: CSS**

```css
/* ── Telegram ─────────────────────────────────────────────── */
.tg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
.tg-bullets { margin: 16px 0 0; padding: 0 0 0 2px; list-style: none; display: flex; flex-direction: column; gap: 12px; color: var(--text-muted); font-size: 15px; }
.tg-bullets li::before { content: '→ '; color: var(--accent); }
.tg-phone { max-width: 300px; margin: 0 auto; border-radius: 32px; padding: 14px; }
.tg-phone-screen { border-radius: 22px; background: var(--bg); min-height: 340px; padding: 18px 12px; display: flex; flex-direction: column; gap: 10px; }
.tg-msg { max-width: 85%; padding: 9px 12px; border-radius: 14px; font-size: 13.5px; line-height: 1.35; }
.tg-msg.bot { background: var(--surface2); border-bottom-left-radius: 4px; align-self: flex-start; }
.tg-msg.user { background: var(--accent); color: #fff; border-bottom-right-radius: 4px; align-self: flex-end; }
.tg-chip { display: block; margin-top: 8px; font-size: 12px; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); border-radius: 8px; padding: 4px 10px; width: fit-content; }
@media (max-width: 860px) { .tg-grid { grid-template-columns: 1fr; gap: 28px; } }
```

- [ ] **Step 4: Проверка + Commit**

Run: `npx tsc -b && npx vitest run src/components/landing/ && npm run build` → зелёно.

```bash
git add src/components/landing/blocks/TelegramBlock.tsx src/components/landing/LandingScreen.tsx src/components/landing/Landing.css
git commit -m "feat(landing): telegram bot section with phone mockup"
```

---

### Task 9: FeatureGrid (8 карточек) + FinalCta + удаление HeroShowcase

**Files:**
- Rewrite: `src/components/landing/blocks/FeatureGrid.tsx`
- Create: `src/components/landing/blocks/FinalCta.tsx`
- Modify: `src/components/landing/LandingScreen.tsx`
- Delete: `HeroShowcase.tsx`, `HeroShowcase.css`, `HeroShowcase.test.ts`, `heroShowcase.logic.ts`
- Modify: `src/components/landing/Landing.css`

- [ ] **Step 1: FeatureGrid**

`src/components/landing/blocks/FeatureGrid.tsx` — заменить целиком:

```tsx
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

const ITEMS = [
  { icon: '💊', label: 'Препараты и лечение' },
  { icon: '🧪', label: 'Анализы из лаборатории' },
  { icon: '🍔', label: 'Питание' },
  { icon: '🎯', label: 'Цели' },
  { icon: '🔬', label: 'Эксперименты' },
  { icon: '🩺', label: 'Проблемы и симптомы' },
  { icon: '📤', label: 'Экспорт данных' },
  { icon: '🌍', label: 'Три языка: ru / uk / en' },
]

export function FeatureGrid() {
  const { t } = useT()
  return (
    <section className="landing-block">
      <h2 className="block-title">{t('И это ещё не всё')}</h2>
      <div className="feature-grid">
        {ITEMS.map((it, i) => (
          <m.div
            key={it.label}
            className="feature-cell lp-glass"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: (i % 4) * 0.07, duration: 0.45 }}
          >
            <span className="feature-icon">{it.icon}</span>
            <span>{t(it.label)}</span>
          </m.div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: FinalCta**

`src/components/landing/blocks/FinalCta.tsx`:

```tsx
import { m } from 'motion/react'
import { useT } from '../../../lib/i18n'

export function FinalCta({ onTry, onDemo }: { onTry: () => void; onDemo?: () => void }) {
  const { t } = useT()
  return (
    <m.section
      className="landing-final-cta lp-glass"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.55 }}
    >
      <h2>{t('Готов(а) попробовать?')}</h2>
      <div className="landing-hero-actions" style={{ justifyContent: 'center' }}>
        <button className="landing-cta landing-cta-lg" onClick={onTry}>{t('Попробовать')}</button>
        {onDemo && <button className="landing-ghost landing-cta-lg" onClick={onDemo}>{t('Посмотреть демо')}</button>}
      </div>
      <p className="lp-footer">Tonus © 2026</p>
    </m.section>
  )
}
```

В `LandingScreen.tsx`: заменить инлайн-секцию `landing-final-cta` на `<FinalCta onTry={onTry} onDemo={onDemo} />`, импортировать.

- [ ] **Step 3: Удалить HeroShowcase**

```bash
git rm src/components/landing/HeroShowcase.tsx src/components/landing/HeroShowcase.css src/components/landing/HeroShowcase.test.ts src/components/landing/heroShowcase.logic.ts
```

Проверить, что импортов не осталось: `grep -rn "HeroShowcase\|heroShowcase" src/` → пусто.

- [ ] **Step 4: CSS финальных секций**

```css
/* ── Фича-грид и финальный CTA ────────────────────────────── */
.feature-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.feature-cell { display: flex; flex-direction: column; gap: 10px; padding: 18px 16px; font-size: 14px; }
.feature-icon { font-size: 22px; }
@media (max-width: 860px) { .feature-grid { grid-template-columns: repeat(2, 1fr); } }
.landing-final-cta { text-align: center; padding: 56px 24px; margin: 40px 0 32px; position: relative; overflow: hidden; }
.landing-final-cta::before { content: ''; position: absolute; inset: -40%; background: radial-gradient(circle at 50% 120%, color-mix(in srgb, var(--accent) 25%, transparent), transparent 60%); pointer-events: none; }
.landing-final-cta h2 { font-size: clamp(24px, 3.4vw, 36px); margin: 0 0 24px; }
.lp-footer { margin: 28px 0 0; font-size: 12.5px; color: var(--text-muted); }
```

Также убрать из старого CSS `.feature-cell`-правила с `transitionDelay`-подходом, если конфликтуют.

- [ ] **Step 5: Проверка + Commit**

Run: `npx tsc -b && npx vitest run && npm run build` → всё зелёное (тестов HeroShowcase больше нет).

```bash
git add -A src/components/landing
git commit -m "feat(landing): glass feature grid, final CTA, remove HeroShowcase"
```

---

### Task 10: Финальная верификация и чистка CSS

**Files:**
- Modify: `src/components/landing/Landing.css` (удаление мёртвых правил)

- [ ] **Step 1: Мёртвый CSS**

Для каждого класса из старого `Landing.css` проверить использование: `grep -rn "имя-класса" src/`. Удалить правила классов, которые больше не встречаются (ожидаемо: `.landing-reveal`, `.hero-pulse`, `.metrics-grid` и прочие из Task 6 списка, если ещё остались).

- [ ] **Step 2: Полный прогон**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test          # все тесты зелёные
npm run lint      # не больше 295 pre-existing ошибок
npm run build     # успешно; записать размеры чанков
```

Expected: entry-чанк ≤ 150KB gzip; `LiveDemoPanel` — отдельный чанк.

- [ ] **Step 3: Ручная проверка в превью (обязательно все пункты)**

1. Десктоп 1280px: hero-каскад, панель (4 таба кликаются, графики видны — если бары пустые, проверить `isAnimationActive={false}`), trust strip, sticky-сцены при скролле, печатающийся чат, telegram-сообщения, грид, CTA.
2. Мобилка 375px: hero колонкой, панель на всю ширину, hiw-сцены в карточках, ничего не перекрывается, нет горизонтального скролла (`document.documentElement.scrollWidth === 375`).
3. Языки: переключить en и uk — ни одной русской строки на странице.
4. Reduced motion: `preview_resize`/эмуляция или DevTools → `prefers-reduced-motion: reduce` — страница статична, но полностью читаема (чат показывает полные тексты).
5. Кнопки: «Попробовать» → AuthScreen; «Посмотреть демо» и «Открыть полное демо» → демо-дашборд; «Выйти» из демо возвращает на лендинг.

- [ ] **Step 4: Commit + push**

```bash
git add -A src/components/landing
git commit -m "chore(landing): prune dead CSS after redesign"
git push origin main
```

---

## Self-review (выполнен при написании плана)

- Покрытие спеки: hero+панель (T4), trust (T5), how-it-works (T6), чат (T7), telegram (T8), грид+CTA+футер (T9), фон/топбар/LazyMotion (T3), i18n (T2), логика+тесты (T1), перф/чистка (T10). Светлая тема, SEO — вне скоупа по спеке.
- Плейсхолдеров нет; каждый код-шаг содержит полный код.
- Согласованность типов: `DemoTab`/`TAB_LABELS`/`prepareLiveDemoData` (T1) используются в T4 с теми же именами; `onDemo` проброшен из App (уже существует).
