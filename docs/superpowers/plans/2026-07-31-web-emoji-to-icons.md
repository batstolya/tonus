# Emoji → Phosphor icons (dashboard pilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's emoji with Phosphor duotone icons behind a semantic registry, with a build flag that restores the emoji without reverting code.

**Architecture:** One new module, `apps/web/src/lib/icons.tsx`, owns the mapping from a semantic name to both a Phosphor component and the emoji it replaces, plus an `<Icon>` wrapper that picks between them by reading `import.meta.env.VITE_ICONS`. Call sites import only `Icon` and a name — never Phosphor directly. Three conversion tasks then move 28 call sites onto it, each adding its files to a guard test that fails if an emoji comes back.

**Tech Stack:** React 19, TypeScript, Vite, vitest (jsdom project for component tests, node project for source-text tests), `@phosphor-icons/react` 2.1.10.

## Global Constraints

- Node 24 for every npm command: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- `npm test` from the repo root is a three-part chain (`npm run -w tonus-web test && npm run -w @tonus/shared test && vitest run`), roughly 451 + 41 + 324 tests. One segment is not the suite.
- Lint runs with `--max-warnings 0`. Zero tolerance.
- Everything committed is in English: commit messages, comments, identifiers. Pre-existing Russian comments stay untouched. UI strings stay in Russian and keep flowing through `t()`.
- Do NOT edit `components/landing/**`, `components/auth/**`, `apps/mobile/**`, or `lib/translations/*` — the landing and `TelegramDemo` keep their emoji on purpose.
- `✓` (U+2713) and `✕` (U+2715) are typographic glyphs, not emoji. They stay.
- Icon weight is `duotone` everywhere. Default size is 18.
- End every commit message with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Work on branch `spec/web-emoji-to-icons`. Do not create branches, do not push.

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/web/src/lib/icons.tsx` (new) | The registry: name → `{ icon, emoji }`, the `Icon` component, the flag read. The only file that imports `@phosphor-icons/react`, and after this plan the only pilot file that contains emoji. |
| `apps/web/src/lib/icons.test.tsx` (new) | Registry behaviour: every entry renders, the flag restores emoji, a11y attributes are right. jsdom project. |
| `apps/web/src/lib/noEmoji.test.ts` (new) | The guard: pilot files contain none of the registry's emoji. node project — reads source text, renders nothing. |
| `apps/web/src/components/dashboard/*.tsx` | Call sites. |
| `apps/web/src/components/ui/{EmptyState,DataGaps}.tsx` | Call sites. |

---

### Task 1: The registry and the revert flag

**Files:**
- Create: `apps/web/src/lib/icons.tsx`
- Create: `apps/web/src/lib/icons.test.tsx`
- Modify: `apps/web/package.json` (add the dependency)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ICONS` (the registry object), `type IconName = keyof typeof ICONS`, and `Icon({ name, size?, title?, className? })`. Tasks 2-4 import only `Icon` and `IconName` from `../../lib/icons` (depth depends on the importing file).

- [ ] **Step 1: Add the dependency**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm install -w tonus-web @phosphor-icons/react@2.1.10
```

Expected: `apps/web/package.json` gains `"@phosphor-icons/react": "^2.1.10"` under `dependencies`, and `package-lock.json` updates. Commit both.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/icons.test.tsx`. Note this is a `.tsx` test, so it runs in the **jsdom** project.

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ICONS, Icon, type IconName } from './icons'

const names = Object.keys(ICONS) as IconName[]

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('icon registry', () => {
  it('covers every name with a Phosphor component and the emoji it replaces', () => {
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const entry = ICONS[name]
      expect(typeof entry.icon, `${name}.icon`).toBe('object')
      expect(entry.emoji, `${name}.emoji`).toMatch(/\S/)
    }
  })

  it('renders an svg for every name', () => {
    for (const name of names) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg'), `${name} should render an svg`).not.toBeNull()
      unmount()
    }
  })

  it('renders the emoji instead when VITE_ICONS is 0', () => {
    vi.stubEnv('VITE_ICONS', '0')
    for (const name of names) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg'), `${name} should not render an svg`).toBeNull()
      expect(container.textContent, `${name} should render its emoji`).toBe(ICONS[name].emoji)
      unmount()
    }
  })

  it('hides decorative icons from screen readers', () => {
    const { container } = render(<Icon name="streak" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
  })

  it('exposes a label when the icon carries the meaning', () => {
    const { container } = render(<Icon name="streak" title="Серия" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('Серия')
    expect(svg.getAttribute('aria-hidden')).toBeNull()
  })

  it('labels the emoji fallback the same way', () => {
    vi.stubEnv('VITE_ICONS', '0')
    const { container } = render(<Icon name="streak" title="Серия" />)
    const span = container.querySelector('span')!
    expect(span.getAttribute('role')).toBe('img')
    expect(span.getAttribute('aria-label')).toBe('Серия')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: FAIL — `Failed to resolve import "./icons"`.

- [ ] **Step 4: Write the registry**

Create `apps/web/src/lib/icons.tsx`:

```tsx
import {
  ArrowsClockwise, Broadcast, CalendarBlank, CheckCircle, Circle, Eye, Fire,
  Heartbeat, Lightning, PersonSimpleRun, PersonSimpleWalk, Snowflake, Sparkle,
  SmileyMeh, SmileyNervous, Target, ThumbsUp, Warning, type Icon as PhosphorIcon,
} from '@phosphor-icons/react'

// Every entry keeps the emoji it replaces so VITE_ICONS=0 restores the old
// look without reverting code. This is also why this file is the one place
// the no-emoji guard exempts.
type Entry = { icon: PhosphorIcon; emoji: string }

export const ICONS = {
  stressed:   { icon: SmileyNervous,    emoji: '😓' },
  calm:       { icon: SmileyMeh,        emoji: '😌' },
  warning:    { icon: Warning,          emoji: '⚠' },
  focus:      { icon: Target,           emoji: '🎯' },
  auto:       { icon: ArrowsClockwise,  emoji: '🔄' },
  dayMet:     { icon: CheckCircle,      emoji: '🟢' },
  dayMissed:  { icon: Circle,           emoji: '⚪' },
  streak:     { icon: Fire,             emoji: '🔥' },
  weekly:     { icon: Lightning,        emoji: '⚡' },
  calendar:   { icon: CalendarBlank,    emoji: '📅' },
  planDone:   { icon: CheckCircle,      emoji: '✅' },
  frozen:     { icon: Snowflake,        emoji: '❄️' },
  analyze:    { icon: Sparkle,          emoji: '✦' },
  noData:     { icon: Broadcast,        emoji: '📡' },
  alertHigh:  { icon: Heartbeat,        emoji: '🫀' },
  alertWatch: { icon: Eye,              emoji: '👀' },
  steps:      { icon: PersonSimpleWalk, emoji: '🚶' },
  exercise:   { icon: PersonSimpleRun,  emoji: '🏃' },
  allClear:   { icon: ThumbsUp,         emoji: '👌' },
} as const satisfies Record<string, Entry>

export type IconName = keyof typeof ICONS

interface Props {
  name: IconName
  size?: number
  /** Set only when the icon is the sole carrier of meaning; otherwise it is
      decorative and hidden from screen readers. */
  title?: string
  className?: string
}

// Read per render rather than at module scope: Vite still inlines the value at
// build time, and tests can stub it with vi.stubEnv without resetting modules.
function iconsEnabled() {
  return import.meta.env.VITE_ICONS !== '0'
}

export function Icon({ name, size = 18, title, className }: Props) {
  const { icon: Glyph, emoji } = ICONS[name]
  const a11y = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true }

  if (!iconsEnabled()) {
    return <span className={className} {...a11y}>{emoji}</span>
  }
  return <Glyph size={size} weight="duotone" className={className} {...a11y} />
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: PASS, 6 tests.

- [ ] **Step 6: Prove the flag test can fail**

Temporarily change `iconsEnabled` to `return true`, re-run the same command.
Expected: the `renders the emoji instead when VITE_ICONS is 0` case FAILS. Restore the function and confirm green again. Record both outputs in your report.

- [ ] **Step 7: Run the full gate and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

```bash
git add apps/web/package.json package-lock.json apps/web/src/lib/icons.tsx apps/web/src/lib/icons.test.tsx
git commit -m "feat(web): a semantic icon registry with an emoji revert flag"
```

---

### Task 2: The dashboard's own surfaces

**Files:**
- Modify: `apps/web/src/components/dashboard/Dashboard.tsx` (stress days, early warning, coach focus, empty state)
- Modify: `apps/web/src/components/dashboard/StreakStats.tsx`
- Modify: `apps/web/src/components/dashboard/WorkoutPlanCard.tsx`
- Create: `apps/web/src/lib/noEmoji.test.ts`

**Interfaces:**
- Consumes: `Icon` and `IconName` from Task 1, imported as `import { Icon } from '../../lib/icons'`.
- Produces: `PILOT_FILES` in `noEmoji.test.ts` — an array of repo-relative paths that Tasks 3 and 4 append to.

- [ ] **Step 1: Write the failing guard test**

Create `apps/web/src/lib/noEmoji.test.ts`. This is a `.ts` test — it runs in the **node** project and only reads source text.

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ICONS } from './icons'

// Files the icon pilot has converted. Later tasks append to this list.
const PILOT_FILES = [
  'components/dashboard/Dashboard.tsx',
  'components/dashboard/StreakStats.tsx',
  'components/dashboard/WorkoutPlanCard.tsx',
]

const REPLACED = Object.values(ICONS).map(e => e.emoji)

describe('converted files carry no emoji', () => {
  for (const file of PILOT_FILES) {
    it(file, () => {
      const source = readFileSync(join(__dirname, '..', file), 'utf8')
      const found = REPLACED.filter(emoji => source.includes(emoji))
      expect(found, `${file} still contains ${found.join(' ')}`).toEqual([])
    })
  }
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: FAIL on all three files — `Dashboard.tsx still contains 😓 😌 ⚠ 🎯 🔄 🟢 ⚪ 🔥`, and similar for the other two.

- [ ] **Step 3: Convert the stress-days card**

In `Dashboard.tsx`, add `import { Icon } from '../../lib/icons'` alongside the existing imports, then replace the two icon nodes:

```tsx
        <div className="sd-icon"><Icon name="stressed" size={24} /></div>
```
```tsx
        <div className="sd-icon"><Icon name="calm" size={24} /></div>
```

- [ ] **Step 4: Convert the early-warning banner**

```tsx
      <span className="ew-icon"><Icon name="warning" size={18} /></span>
```

- [ ] **Step 5: Convert both coach-focus headers and the auto note**

There are two `coach-focus-label` spans (the data-driven card and the manual fallback). Both become:

```tsx
          <span className="coach-focus-label"><Icon name="focus" /> {t('Фокус недели')}</span>
```

And the auto note:

```tsx
        <div className="coach-focus-auto" style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}><Icon name="auto" size={14} /> {t('по данным')}</div>
```

- [ ] **Step 6: Convert the week dots**

These carry meaning by themselves, so each gets a `title`. Replace the dot span:

```tsx
            <span key={i} style={{ opacity: d.future ? 0.3 : 1 }}>
              <Icon name={d.met ? 'dayMet' : 'dayMissed'} size={14} title={d.date} />
            </span>
```

Note the `title={d.date}` moves from the wrapping `<span>` onto the `Icon`, so the tooltip and the accessible name are the same string.

- [ ] **Step 7: Convert the empty state**

`EmptyState`'s `icon` prop is typed `ReactNode`, so it takes an element directly — no change to `EmptyState` itself in this task:

```tsx
          icon={<Icon name="streak" size={32} />}
```

- [ ] **Step 8: Convert StreakStats and WorkoutPlanCard**

In `StreakStats.tsx`, add `import { Icon } from '../../lib/icons'` and replace:

```tsx
          <span className="streak-card-emoji"><Icon name="weekly" size={14} /></span>
```
```tsx
          <span className="streak-card-emoji"><Icon name="calendar" size={14} /></span>
```

In `WorkoutPlanCard.tsx`, same import, and:

```tsx
          <span className="streak-card-emoji"><Icon name="planDone" size={14} /></span>
```

The `aria-hidden` attributes on those spans are now redundant — `Icon` sets it on the svg itself — so drop them from the spans.

- [ ] **Step 9: Run the guard and the component tests**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: PASS, 3 tests.

Run: `npm test -w tonus-web -- --project jsdom Dashboard`
Expected: PASS. If a behaviour test asserted on an emoji, update it deliberately and say so in your report.

- [ ] **Step 10: Run the full gate and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

```bash
git add apps/web/src/lib/noEmoji.test.ts apps/web/src/components/dashboard/Dashboard.tsx apps/web/src/components/dashboard/StreakStats.tsx apps/web/src/components/dashboard/WorkoutPlanCard.tsx
git commit -m "feat(web): move the dashboard's own surfaces onto the icon registry"
```

---

### Task 3: The notification bell and the streak menu

These are the two places where an emoji sits inside a sentence, so the string becomes a JSX fragment. `derivedText` currently returns `{ icon: string; title: string; body: string }` and both fields change shape.

**Files:**
- Modify: `apps/web/src/components/dashboard/NotificationBell.tsx`
- Modify: `apps/web/src/components/dashboard/StreakMenu.tsx`
- Modify: `apps/web/src/lib/noEmoji.test.ts` (append two paths)

**Interfaces:**
- Consumes: `Icon`, `IconName` from Task 1; `PILOT_FILES` from Task 2.
- Produces: `derivedText` returns `{ icon: IconName; title: string; body: ReactNode }`.

- [ ] **Step 1: Extend the guard**

In `noEmoji.test.ts`, add to `PILOT_FILES`:

```ts
  'components/dashboard/NotificationBell.tsx',
  'components/dashboard/StreakMenu.tsx',
```

- [ ] **Step 2: Run it to verify the two new cases fail**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: FAIL — `NotificationBell.tsx still contains 🔥 📡 🫀 👀 🚶 🏃 👌` and `StreakMenu.tsx still contains 🔥 ⚡ 🚶 🏃`.

- [ ] **Step 3: Change `derivedText`'s contract in NotificationBell.tsx**

Add `import { Icon, type IconName } from '../../lib/icons'` and `import type { ReactNode } from 'react'`, then:

```tsx
  const derivedText = (item: BellItem): { icon: IconName; title: string; body: ReactNode } => {
    if (item.kind === 'streak-risk') {
      return {
        icon: 'streak',
        title: t('Стрик {n} дн. под угрозой', { n: item.streak }),
        body: (
          <>
            {t('Сегодня')}: <Icon name="steps" size={14} /> {item.steps.toLocaleString(locale)} / {ACTIVE_STEPS_MIN.toLocaleString(locale)}
            {' · '}<Icon name="exercise" size={14} /> {item.exercise} / {ACTIVE_EXERCISE_MIN} {t('мин')}.{' '}
            {item.freezes > 0
              ? t('Иначе сгорит заморозка (осталось {n})', { n: item.freezes })
              : t('Заморозок нет — стрик обнулится в полночь')}
          </>
        ),
      }
    }
    return {
      icon: 'noData',
      title: t('Нет данных {n} дн.', { n: item.days }),
      body: t('Проверь авто-синхронизацию на iPhone'),
    }
  }
```

- [ ] **Step 4: Render the icon name instead of the emoji**

The derived list's icon span currently interpolates the string. It becomes:

```tsx
                    <span className="bell-item-icon"><Icon name={icon} size={18} /></span>
```

Drop the now-redundant `aria-hidden` from that span.

- [ ] **Step 5: Convert the alert-level icon and the empty state**

The level marker is the only signal distinguishing an alert's severity, so it takes a `title`:

```tsx
                    <span className="bell-item-icon">
                      {a.level === 'red'
                        ? <Icon name="alertHigh" size={18} title={t('Высокий сигнал')} />
                        : <Icon name="alertWatch" size={18} title={t('Наблюдение')} />}
                    </span>
```

And the empty state:

```tsx
            <div className="bell-empty">{t('Все спокойно — сигналов нет')} <Icon name="allClear" size={16} /></div>
```

- [ ] **Step 6: Convert StreakMenu.tsx**

Add `import { Icon } from '../../lib/icons'`, then replace the trigger flame, the two counters and the progress line:

```tsx
        <span className="streak-menu-flame"><Icon name="streak" size={17} /></span>
```
```tsx
              <span className="streak-menu-counter" title={t('Дней подряд')}>
                <Icon name="streak" size={14} />{streak.current}
              </span>
              <span className="streak-menu-counter" title={t('Недель подряд')}>
                <Icon name="weekly" size={14} />{streak.weekly}
              </span>
```
```tsx
                {t('Сегодня')}: <Icon name="steps" size={14} /> {todaySteps.toLocaleString(locale)} / {ACTIVE_STEPS_MIN.toLocaleString(locale)}
                {' · '}<Icon name="exercise" size={14} /> {todayExercise} / {ACTIVE_EXERCISE_MIN} {t('мин')}
```

Drop the `aria-hidden` attributes from the spans you touched.

- [ ] **Step 7: Run the guard and the component tests**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: PASS, 5 tests.

Run: `npm test -w tonus-web -- --project jsdom NotificationBell StreakMenu`
Expected: PASS. `NotificationBell.test.tsx` asserts on alert text; if any assertion depended on an emoji or on `body` being a string, update it deliberately and report it.

- [ ] **Step 8: Run the full gate and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

```bash
git add apps/web/src/lib/noEmoji.test.ts apps/web/src/components/dashboard/NotificationBell.tsx apps/web/src/components/dashboard/StreakMenu.tsx
git commit -m "feat(web): move the bell and streak menu onto the icon registry"
```

---

### Task 4: Calendar, AI block and the shared UI states

**Files:**
- Modify: `apps/web/src/components/dashboard/ActivityCalendar.tsx`
- Modify: `apps/web/src/components/dashboard/AiAnalysisBlock.tsx`
- Modify: `apps/web/src/components/ui/DataGaps.tsx`
- Modify: `apps/web/src/components/ui/EmptyState.tsx` (comment only)
- Modify: `apps/web/src/lib/noEmoji.test.ts` (append three paths)

**Interfaces:**
- Consumes: `Icon` from Task 1; `PILOT_FILES` from Task 2.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Extend the guard**

```ts
  'components/dashboard/ActivityCalendar.tsx',
  'components/dashboard/AiAnalysisBlock.tsx',
  'components/ui/DataGaps.tsx',
```

- [ ] **Step 2: Run it to verify the three new cases fail**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: FAIL — `ActivityCalendar.tsx still contains ❄️`, `AiAnalysisBlock.tsx still contains ✦`, `DataGaps.tsx still contains ⚠`.

- [ ] **Step 3: Convert the frozen day in ActivityCalendar.tsx**

Add `import { Icon } from '../../lib/icons'` and replace the cell content. The `✓` on the week marker at line 107 is a glyph and stays:

```tsx
                  {status === 'frozen' ? <Icon name="frozen" size={14} /> : d.getDate()}
```

- [ ] **Step 4: Convert the analyse button in AiAnalysisBlock.tsx**

Add `import { Icon } from '../../lib/icons'` and replace the sparkle:

```tsx
            {loading ? <span className="ai-spinner" /> : <Icon name="analyze" size={14} />} {loading ? t('Анализируем…') : t('Проанализировать')}
```

- [ ] **Step 5: Convert both warnings in DataGaps.tsx**

Add `import { Icon } from '../../lib/icons'` and replace:

```tsx
        <Icon name="warning" size={14} /> {t('Неполные данные')} ({significant.length})
```
```tsx
      <div className="data-gaps-title"><Icon name="warning" size={14} /> {t('Пробелы в данных за')} {days} {t('дн')}:</div>
```

- [ ] **Step 6: Correct the stale comment in EmptyState.tsx**

The prop comment still says the icon is an emoji. It now takes an `<Icon>` element:

```tsx
  icon: ReactNode        // an <Icon /> element, or any small node
```

- [ ] **Step 7: Run the guard and the component tests**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: PASS, 8 tests.

Run: `npm test -w tonus-web -- --project jsdom EmptyState DataGaps ActivityCalendar`
Expected: `EmptyState.test.tsx` FAILS — it renders `<EmptyState icon="🎯" …>` and `icon="🔒"`. Those are test fixtures for a prop that accepts any node, and the strings are not part of the pilot's surface. Update them to `icon={<Icon name="focus" />}` and `icon={<Icon name="warning" />}` respectively, so the fixtures exercise the real usage, and note the change in your report.

- [ ] **Step 8: Run the full gate and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

```bash
git add apps/web/src/lib/noEmoji.test.ts apps/web/src/components/dashboard/ActivityCalendar.tsx apps/web/src/components/dashboard/AiAnalysisBlock.tsx apps/web/src/components/ui/DataGaps.tsx apps/web/src/components/ui/EmptyState.tsx apps/web/src/components/ui/EmptyState.test.tsx
git commit -m "feat(web): move the calendar, AI block and shared states onto the icon registry"
```

---

### Task 5: Bundle measurement, visual verification and the PR

No new behaviour. This task proves the pilot and records what it cost.

**Files:**
- Modify: none expected. If verification surfaces a defect, fix it here and note it in the commit.

- [ ] **Step 1: Measure the bundle**

Build this branch:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm run build -w tonus-web && ls -l apps/web/dist/assets/*.js | awk '{print $5, $9}' | sort -rn | head -5
```

Then build `main` in a throwaway worktree, so this branch's working tree is never touched:

```bash
git worktree add /tmp/tonus-baseline main
(cd /tmp/tonus-baseline && npm install --no-audit --no-fund && npm run build -w tonus-web \
  && ls -l apps/web/dist/assets/*.js | awk '{print $5, $9}' | sort -rn | head -5)
git worktree remove /tmp/tonus-baseline --force
```

Never use `git checkout main -- .` for this — it overwrites the working tree with main's files and silently discards the task's work.

Record both numbers. The spec's threshold: if the largest chunk grows by more than 50 kB gzipped, switch the registry's imports from the package root to `@phosphor-icons/react/dist/csr/<Name>` and re-measure. Report the delta either way.

- [ ] **Step 2: Build the demo bundle and screenshot both themes**

`apps/web/.env.local` is gitignored and does not exist. Create it with `VITE_SUPABASE_URL=http://localhost:54321`, `VITE_SUPABASE_ANON_KEY=test-anon-key`, `VITE_DEMO=1`, then:

```bash
npm run build -w tonus-web -- --base=./
```

Open `apps/web/dist/index.html` in the preview pane as a `file://` URL and screenshot the dashboard in light and dark. Check that icons inherit the role-token colours rather than rendering black, that duotone reads at 14px, and that the week dots are distinguishable.

- [ ] **Step 3: Prove the revert flag renders the old look**

Add `VITE_ICONS=0` to `apps/web/.env.local`, rebuild with the same command, reload and screenshot. Expected: the emoji are back, in the same positions. This is the escape hatch working end to end, not just in unit tests — the spec calls an unverified escape hatch no escape hatch at all.

Delete `apps/web/.env.local` afterwards.

- [ ] **Step 4: Run the full gate**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin spec/web-emoji-to-icons
```

Open a PR to `main` titled `feat(web): Phosphor icons on the dashboard, behind a revert flag`. The body states: what the registry is and why call sites do not import Phosphor directly; the `VITE_ICONS=0` escape hatch and its two limits (build flag, no bundle saving); the bundle delta measured in Step 1; what deliberately keeps its emoji (landing, `TelegramDemo`, i18n keys, server-emitted alert markers) and why; and that `✓`/`✕` are glyphs, not emoji.

---

## Self-Review

**Spec coverage.** Registry → Task 1. Duotone default → Task 1 (`weight="duotone"` in the wrapper). Revert flag → Task 1, proved end to end in Task 5 Step 3. Mapping table → Tasks 1-4; every emoji in the spec's list has an entry and a call site. Week dots as `CheckCircle`/`Circle` → Task 2 Step 6. Emoji inside sentences → Task 3 Steps 3 and 6. Prop-carried emoji → Task 2 Step 7 and Task 3 Step 3. Accessibility defaults → Task 1 (component) and enforced at the two meaning-carrying sites (Task 2 Step 6, Task 3 Step 5). Registry test → Task 1. Flag test → Task 1. Guard test → Task 2, extended in Tasks 3 and 4. Existing test updates → Tasks 3 and 4. Bundle measurement → Task 5 Step 1. Non-goals appear in no task, correctly.

**Placeholder scan:** no TBD/TODO; every code step carries the actual code.

**Type consistency:** `Icon`, `ICONS`, `IconName` keep one signature across all tasks. `derivedText`'s return type changes once, in Task 3, and its consumer is updated in the same task. `PILOT_FILES` is created in Task 2 and appended to in Tasks 3 and 4 — never renamed.

**One caution carried into the plan:** the bundle baseline in Task 5 Step 1 is built in a throwaway worktree rather than by checking `main` into the current one, because `git checkout main -- .` would overwrite the task's work. The step says so explicitly.
