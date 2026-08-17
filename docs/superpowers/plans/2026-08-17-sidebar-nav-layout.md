# Sidebar Navigation Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, opt-in navigation layout — a collapsible left sidebar for wide screens — switchable back to today's top bar from Settings.

**Architecture:** One nav source (`src/app/navigation.tsx`) feeds both layouts. A `useNavLayout` hook keeps the choice (`navLayout`) and the collapsed state (`navCollapsed`) in `localStorage`. `App.tsx` renders either the existing top nav or a new `Sidebar` component and marks the root element `app--side`; which layout is actually visible at a given width is decided by CSS breakpoints, not by JavaScript, so narrow screens keep today's UI untouched with no flash on load.

**Tech Stack:** React 19, TypeScript, Vite, vitest (node + jsdom projects), Testing Library, plain CSS in `src/index.css`.

**Design spec:** `docs/superpowers/specs/2026-08-17-sidebar-nav-layout-design.md`

## Global Constraints

- Node 24 for every command: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` (default Node 18 fails on modern syntax).
- The repo root for this branch is the worktree `/Users/anatolii/tonus/.claude/worktrees/sidebar-nav` — run every command from there unless the step says otherwise. Web sources live under `apps/web/`.
- The `node` and `jsdom` vitest projects are defined in `apps/web/vitest.config.ts`: `--project node|jsdom` only resolves when vitest runs from `apps/web`. `npm test`, `npm run lint` and `npm run build` run from the repo root.
- `npm run lint` runs with `--max-warnings 0`: zero errors **and** zero warnings.
- Everything committed is in English — commit messages, code comments, identifiers, docs. The only exceptions: product UI strings and chat.
- User-facing strings go through `t()` from `src/lib/i18n`, with the Russian source text as the key and `uk` + `en` values added to `src/lib/translations/*.ts`.
- Default layout is `top`: with no stored preference, the UI must be byte-identical to today's.
- Breakpoint: sidebar visible only at `min-width: 769px`, the exact complement of the `max-width: 768px` mobile block in `apps/web/src/index.css` (the 1024px rules live in `App.css` and are unrelated template leftovers).
- Sidebar width 240px expanded, 60px collapsed.
- Never touch `apps/mobile/`.
- Frequent commits: one commit per task, `feat(nav):` / `refactor(nav):` prefixes.

---

### Task 1: `useNavLayout` hook

Stores the layout choice and the collapsed state in `localStorage`, like `useTheme` does for the theme. Pure parsers are exported so the node test project can cover the parsing rules without a DOM.

**Files:**
- Create: `apps/web/src/hooks/useNavLayout.ts`
- Test: `apps/web/src/hooks/useNavLayout.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `export type NavLayout = 'top' | 'side'`
  - `export function resolveNavLayout(saved: string | null): NavLayout`
  - `export function resolveNavCollapsed(saved: string | null): boolean`
  - `export function useNavLayout(): { layout: NavLayout; setLayout: (l: NavLayout) => void; collapsed: boolean; toggleCollapsed: () => void }`
  - `localStorage` keys: `navLayout` (`'top'` | `'side'`), `navCollapsed` (`'1'` | `'0'`).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/useNavLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveNavLayout, resolveNavCollapsed } from './useNavLayout'

describe('resolveNavLayout', () => {
  it('accepts both known layouts', () => {
    expect(resolveNavLayout('top')).toBe('top')
    expect(resolveNavLayout('side')).toBe('side')
  })
  it('falls back to top for missing or unknown values', () => {
    expect(resolveNavLayout(null)).toBe('top')
    expect(resolveNavLayout('')).toBe('top')
    expect(resolveNavLayout('sidebar')).toBe('top')
    expect(resolveNavLayout('SIDE')).toBe('top')
  })
})

describe('resolveNavCollapsed', () => {
  it('is collapsed only for the stored "1"', () => {
    expect(resolveNavCollapsed('1')).toBe(true)
    expect(resolveNavCollapsed('0')).toBe(false)
    expect(resolveNavCollapsed(null)).toBe(false)
    expect(resolveNavCollapsed('true')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && cd apps/web && npx vitest run --project node src/hooks/useNavLayout.test.ts
```

Expected: FAIL — cannot resolve `./useNavLayout`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/hooks/useNavLayout.ts`:

```ts
import { useState } from 'react'

// Which navigation layout the app shows on wide screens: the historical top bar
// or the opt-in left sidebar. Per-device on purpose — this is a trial layout,
// not a profile setting (see the design spec).
export type NavLayout = 'top' | 'side'

const LAYOUT_KEY = 'navLayout'
const COLLAPSED_KEY = 'navCollapsed'

export function resolveNavLayout(saved: string | null): NavLayout {
  return saved === 'side' ? 'side' : 'top'
}

export function resolveNavCollapsed(saved: string | null): boolean {
  return saved === '1'
}

// localStorage throws in private-mode Safari and when storage is full. The
// layout is a cosmetic preference: swallow the failure and use the default
// rather than taking the whole app down.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* preference is not worth an error */
  }
}

export function useNavLayout() {
  const [layout, setLayoutState] = useState<NavLayout>(() => resolveNavLayout(read(LAYOUT_KEY)))
  const [collapsed, setCollapsedState] = useState<boolean>(() => resolveNavCollapsed(read(COLLAPSED_KEY)))

  function setLayout(next: NavLayout) {
    write(LAYOUT_KEY, next)
    setLayoutState(next)
  }

  function toggleCollapsed() {
    setCollapsedState(prev => {
      const next = !prev
      write(COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  return { layout, setLayout, collapsed, toggleCollapsed }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && cd apps/web && npx vitest run --project node src/hooks/useNavLayout.test.ts
```

Expected: PASS, 2 suites.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useNavLayout.ts apps/web/src/hooks/useNavLayout.test.ts && git commit -m "feat(nav): remember the navigation layout choice per device"
```

---

### Task 2: Export nav types from `navigation.tsx`

The `Sidebar` needs the group type and the group-id union that today live unexported inside `src/app/navigation.tsx`. This task only widens the module's public surface — no behaviour changes.

**Files:**
- Modify: `apps/web/src/app/navigation.tsx:5` (the `GroupId` type) and the `NAV_GROUPS` declaration
- Test: extend the existing `apps/web/src/app/navigation.test.tsx`

**Interfaces:**
- Consumes: `NAV_GROUPS`, `filterNavGroups` (existing).
- Produces:
  - `export type GroupId = 'body' | 'journal' | 'coach'`
  - `export type NavGroup = { id: GroupId; label: string; defaultView: AppView; icon: React.ReactElement; views: NavView[] }`
  - `export type NavView = { view: AppView; label: string; requiresMetric?: keyof AvailableMetrics }`
  - `NAV_GROUPS: NavGroup[]`, `filterNavGroups(m: AvailableMetrics): NavGroup[]`, `getActiveGroup(view: AppView): GroupId | null`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/app/navigation.test.tsx`:

```tsx
describe('exported nav types', () => {
  it('exposes groups as NavGroup[] so both layouts share one shape', () => {
    const groups: NavGroup[] = filterNavGroups({
      hasHeartRate: true, hasSleep: true, hasActivity: true, hasStress: true,
    } as AvailableMetrics)
    const ids: GroupId[] = groups.map(g => g.id)
    expect(ids).toEqual(['body', 'journal', 'coach'])
    for (const g of groups) {
      expect(typeof g.label).toBe('string')
      expect(g.views.length).toBeGreaterThan(0)
    }
  })
})
```

Add `NavGroup` and `GroupId` to the existing import at the top of the file:

```tsx
import { NAV_GROUPS, getActiveGroup, getActiveSubView, filterNavGroups, type NavGroup, type GroupId } from './navigation'
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && cd apps/web && npx vitest run --project jsdom src/app/navigation.test.tsx
```

Expected: FAIL — `navigation.tsx` has no exported member `NavGroup`.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/app/navigation.tsx`, replace the type declarations and the `NAV_GROUPS` signature:

```tsx
export type GroupId = 'body' | 'journal' | 'coach'

export type NavView = { view: AppView; label: string; requiresMetric?: keyof AvailableMetrics }

export type NavGroup = {
  id: GroupId
  label: string
  defaultView: AppView
  icon: React.ReactElement
  views: NavView[]
}

export const NAV_GROUPS: NavGroup[] = [
```

Leave the array contents, `getActiveGroup`, `getActiveSubView` and `filterNavGroups` exactly as they are.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && cd apps/web && npx vitest run --project jsdom src/app/navigation.test.tsx && npx tsc -b
```

Expected: PASS, and `tsc` silent.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/navigation.tsx apps/web/src/app/navigation.test.tsx && git commit -m "refactor(nav): export the nav group types for reuse by both layouts"
```

---

### Task 3: `Sidebar` component

A presentational component: it takes the visible groups and the current view, and reports clicks. It holds no app state. Both states (expanded, collapsed) render from the same markup; the collapsed flyout is CSS-driven, so there is no open/close state to manage.

**Files:**
- Create: `apps/web/src/components/navigation/Sidebar.tsx`
- Test: `apps/web/src/components/navigation/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `NavGroup`, `GroupId` (Task 2); `AppView` from `src/store/appStore`; `Icon` from `src/lib/icons`; `useT` from `src/lib/i18n`.
- Produces:
  ```tsx
  export type SidebarProps = {
    groups: NavGroup[]
    view: AppView
    activeGroup: GroupId | null
    activeSubView: AppView
    collapsed: boolean
    onToggleCollapsed: () => void
    onNavigate: (view: AppView) => void
  }
  export function Sidebar(props: SidebarProps): React.ReactElement
  ```
- Class names later tasks and the CSS rely on: `sidebar`, `sidebar--collapsed`, `sidebar-logo`, `sidebar-collapse-btn`, `sidebar-group`, `sidebar-caption`, `sidebar-flyout`, `sidebar-btn`, `sidebar-btn.active`, `sidebar-icon-btn`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/navigation/Sidebar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderWithProviders, screen, fireEvent, cleanup } from '../../test/utils'
import { Sidebar } from './Sidebar'
import { filterNavGroups } from '../../app/navigation'
import type { AvailableMetrics } from '../../lib/availableMetrics'

const allMetrics = {
  hasHeartRate: true, hasSleep: true, hasActivity: true, hasStress: true,
} as AvailableMetrics

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); localStorage.clear() })

function renderSidebar(over: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const onNavigate = vi.fn()
  const onToggleCollapsed = vi.fn()
  const { container } = renderWithProviders(
    <Sidebar
      groups={filterNavGroups(allMetrics)}
      view="sleep"
      activeGroup="body"
      activeSubView="sleep"
      collapsed={false}
      onToggleCollapsed={onToggleCollapsed}
      onNavigate={onNavigate}
      {...over}
    />,
  )
  return { container, onNavigate, onToggleCollapsed }
}

describe('Sidebar', () => {
  it('lists dashboard, every group caption, every sub-view and settings', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByText('Body')).toBeTruthy()
    expect(screen.getByText('Journal')).toBeTruthy()
    expect(screen.getByText('Coach')).toBeTruthy()
    for (const label of ['Overview', 'Heart rate', 'Sleep', 'Activity', 'Stress', 'Supplements', 'Nutrition', 'Lab results', 'Concerns', 'Insights', 'Research', 'Experiments', 'Goals']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
  })

  it('omits sub-views whose metric is missing', () => {
    renderSidebar({ groups: filterNavGroups({ ...allMetrics, hasSleep: false }) })
    expect(screen.queryByRole('button', { name: 'Sleep' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy()
  })

  it('marks the current sub-view active', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: 'Sleep' }).className).toContain('active')
    expect(screen.getByRole('button', { name: 'Overview' }).className).not.toContain('active')
  })

  it('marks concerns active while on the hair screen', () => {
    renderSidebar({ view: 'hair', activeGroup: 'journal', activeSubView: 'concerns' })
    expect(screen.getByRole('button', { name: 'Concerns' }).className).toContain('active')
  })

  it('marks settings active on the settings screen', () => {
    renderSidebar({ view: 'settings', activeGroup: null, activeSubView: 'settings' })
    expect(screen.getByRole('button', { name: 'Settings' }).className).toContain('active')
  })

  it('navigates when a sub-view is clicked', () => {
    const { onNavigate } = renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(onNavigate).toHaveBeenCalledWith('activity')
  })

  it('collapses and expands through the toggle', () => {
    const { onToggleCollapsed } = renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse menu' }))
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
  })

  it('collapsed: shows group icon buttons that open the group default view', () => {
    const { container, onNavigate } = renderSidebar({ collapsed: true })
    expect(container.querySelector('.sidebar')!.className).toContain('sidebar--collapsed')
    expect(screen.getByRole('button', { name: 'Expand menu' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Body' }))
    expect(onNavigate).toHaveBeenCalledWith('metrics')
  })

  it('collapsed: keeps sub-views reachable through the flyout markup', () => {
    const { container, onNavigate } = renderSidebar({ collapsed: true })
    expect(container.querySelectorAll('.sidebar-flyout').length).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'Goals' }))
    expect(onNavigate).toHaveBeenCalledWith('goals')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && cd apps/web && npx vitest run --project jsdom src/components/navigation/Sidebar.test.tsx
```

Expected: FAIL — cannot resolve `./Sidebar`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/navigation/Sidebar.tsx`:

```tsx
import type { AppView } from '../../store/appStore'
import type { GroupId, NavGroup } from '../../app/navigation'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'

export type SidebarProps = {
  groups: NavGroup[]
  view: AppView
  activeGroup: GroupId | null
  activeSubView: AppView
  collapsed: boolean
  onToggleCollapsed: () => void
  onNavigate: (view: AppView) => void
}

// Same grid glyph the mobile bottom nav uses for the dashboard.
const dashboardIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
)

// The opt-in wide-screen layout: one vertical list with every section visible,
// collapsing to a strip of group icons. Sub-views stay reachable while
// collapsed through a flyout that opens on hover/focus — pure CSS, no state.
export function Sidebar({
  groups, view, activeGroup, activeSubView, collapsed, onToggleCollapsed, onNavigate,
}: SidebarProps) {
  const { t } = useT()
  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar-head">
        {!collapsed && (
          <button className="sidebar-logo" onClick={() => onNavigate('dashboard')}>Tonus</button>
        )}
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapsed}
          aria-label={t(collapsed ? 'Развернуть меню' : 'Свернуть меню')}
          title={t(collapsed ? 'Развернуть меню' : 'Свернуть меню')}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`sidebar-btn${view === 'dashboard' ? ' active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          <span className="sidebar-btn-icon">{dashboardIcon}</span>
          <span className="sidebar-btn-label">{t('Дашборд')}</span>
        </button>

        {groups.map(g => (
          <div key={g.id} className="sidebar-group">
            {collapsed ? (
              <button
                className={`sidebar-icon-btn${activeGroup === g.id ? ' active' : ''}`}
                onClick={() => onNavigate(g.defaultView)}
                aria-label={t(g.label)}
                title={t(g.label)}
              >
                {g.icon}
              </button>
            ) : (
              <div className="sidebar-caption">{t(g.label)}</div>
            )}
            <div className="sidebar-flyout">
              {collapsed && <div className="sidebar-flyout-title">{t(g.label)}</div>}
              {g.views.map(v => (
                <button
                  key={v.view}
                  className={`sidebar-btn${activeSubView === v.view ? ' active' : ''}`}
                  onClick={() => onNavigate(v.view)}
                >
                  <span className="sidebar-btn-label">{t(v.label)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button
          className={`sidebar-btn${view === 'settings' ? ' active' : ''}`}
          onClick={() => onNavigate('settings')}
          aria-label={t('Настройки')}
          title={t('Настройки')}
        >
          <span className="sidebar-btn-icon"><Icon name="settings" size={20} /></span>
          <span className="sidebar-btn-label">{t('Настройки')}</span>
        </button>
      </div>
    </aside>
  )
}
```

Note on the collapsed group label: the icon button carries `aria-label`, and the flyout repeats the label as a heading — that is why the test queries the group button by accessible name while the caption text also exists when expanded.

- [ ] **Step 4: Add the two new strings**

In `apps/web/src/lib/translations/common.ts`, inside the `// ── Навигация ──` block, after `'Меню': …`:

```ts
  'Свернуть меню': { uk: 'Згорнути меню', en: 'Collapse menu' },
  'Развернуть меню': { uk: 'Розгорнути меню', en: 'Expand menu' },
```

- [ ] **Step 5: Verify the icon names exist**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && grep -n "chevronLeft\|chevronRight\|settings:" apps/web/src/lib/icons.tsx
```

Expected: all three names present. If `chevronLeft` is missing, add it to the registry next to `chevronRight` following the file's existing pattern, rather than inlining an SVG here.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && cd apps/web && npx vitest run --project jsdom src/components/navigation/Sidebar.test.tsx
```

Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/navigation/Sidebar.tsx apps/web/src/components/navigation/Sidebar.test.tsx apps/web/src/lib/translations/common.ts && git commit -m "feat(nav): add the sidebar component with a collapsed icon strip"
```

---

### Task 4: Wire the layout into `App.tsx`

`App.tsx` picks the layout: in `side` mode it renders the `Sidebar`, drops the top bar's nav row, and marks the root `app--side`. The `subnav` row stays in the DOM for narrow screens (CSS hides it above the breakpoint — Task 5).

**Files:**
- Modify: `apps/web/src/App.tsx:111-133` (root element, header nav) and `apps/web/src/App.tsx:212-224` (subnav)
- Test: `apps/web/src/App.behavior.test.tsx`

**Interfaces:**
- Consumes: `useNavLayout` (Task 1), `Sidebar` (Task 3), `NavGroup`/`GroupId` (Task 2), existing `getActiveGroup`, `getActiveSubView`, `filterNavGroups`.
- Produces: root element classes `app` (default) and `app app--side`; the `.sidebar` element is present only in `side` mode.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/App.behavior.test.tsx`:

```tsx
describe('navigation layout', () => {
  it('defaults to the top layout: no sidebar, no marker class', () => {
    const { container } = renderWithProviders(<App />)
    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.querySelector('.app')!.className).not.toContain('app--side')
    expect(container.querySelector('.topbar-nav')).toBeTruthy()
  })

  it('renders the sidebar and marks the root when the side layout is stored', () => {
    localStorage.setItem('navLayout', 'side')
    const { container } = renderWithProviders(<App />)
    expect(container.querySelector('.sidebar')).toBeTruthy()
    expect(container.querySelector('.app')!.className).toContain('app--side')
    expect(container.querySelector('.topbar-nav')).toBeNull()
  })

  it('keeps the sidebar collapsed when that is stored', () => {
    localStorage.setItem('navLayout', 'side')
    localStorage.setItem('navCollapsed', '1')
    const { container } = renderWithProviders(<App />)
    expect(container.querySelector('.sidebar')!.className).toContain('sidebar--collapsed')
  })
})
```

The file's existing `beforeEach` sets `lang` and its `afterEach` clears `localStorage`, so these stored values do not leak between tests.

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && cd apps/web && npx vitest run --project jsdom src/App.behavior.test.tsx
```

Expected: FAIL — the sidebar test finds no `.sidebar`.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/App.tsx`:

Add the imports next to the other hook imports (line ~39) and the lazy screens:

```tsx
import { useNavLayout } from './hooks/useNavLayout'
import { Sidebar } from './components/navigation/Sidebar'
```

Call the hook next to `useTheme` (line ~55):

```tsx
  const { layout: navLayout, collapsed: navCollapsed, toggleCollapsed: toggleNavCollapsed } = useNavLayout()
```

Replace the root element (line 112) with:

```tsx
    <div className={`app${navLayout === 'side' ? ' app--side' : ''}`}>
```

Inside the `(hasData || dbLoading)` fragment, render the sidebar before the header:

```tsx
          {navLayout === 'side' && (
            <Sidebar
              groups={visibleNavGroups}
              view={state.view}
              activeGroup={activeGroup}
              activeSubView={activeSubView}
              collapsed={navCollapsed}
              onToggleCollapsed={toggleNavCollapsed}
              onNavigate={setView}
            />
          )}
```

In the header, keep the logo but render the nav row only in top mode — the sidebar owns both in side mode:

```tsx
          <header className="topbar">
            {navLayout === 'top' && (
              <button className="logo-btn" onClick={() => setView('dashboard')}>Tonus</button>
            )}
            {navLayout === 'top' && (
              <nav className="topbar-nav">
                … unchanged contents …
              </nav>
            )}
```

Leave the `topbar-right` block, the mobile drawer and the `subnav` block exactly as they are: narrow screens keep using them.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && cd apps/web && npx vitest run --project jsdom src/App.behavior.test.tsx
```

Expected: PASS — the three new tests plus every pre-existing test in the file, unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/App.behavior.test.tsx && git commit -m "feat(nav): render the sidebar layout when it is the stored choice"
```

---

### Task 5: Styles for the sidebar layout

All rules live in `apps/web/src/index.css` next to the existing `.topbar` / `.subnav` blocks, using the app's existing CSS variables (`--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--text-muted`, `--accent`, `--on-accent`, `--topbar-bg`). No new colours are invented, so both themes work.

**Files:**
- Modify: `apps/web/src/index.css` (append a new section after the `.subnav` rules, around line 335)

**Interfaces:**
- Consumes: class names produced by Task 3 and Task 4.
- Produces: no JS surface.

- [ ] **Step 1: Write the styles**

Append after the `.subnav-btn.active` rule in `apps/web/src/index.css`:

```css
/* ── Sidebar layout (opt-in, wide screens only) ──────────────
   The complement of the max-width:768px mobile block below: the sidebar is
   never visible where the bottom nav is, so the two layouts cannot overlap.
   Chosen by CSS rather than matchMedia so there is no flash on first paint. */
.sidebar { display: none; }

@media (min-width: 769px) {
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 240px;
    padding: 12px 10px;
    box-sizing: border-box;
    background: var(--topbar-bg);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    z-index: 20;
  }
  .sidebar--collapsed { width: 60px; overflow: visible; }

  /* The app column starts to the right of the sidebar; the sticky topbar
     inherits the offset because it lives inside .app. */
  .app--side { padding-left: 240px; }
  .app--side:has(.sidebar--collapsed) { padding-left: 60px; }

  /* The sidebar owns the sub-views in this layout. */
  .app--side .subnav { display: none; }

  .sidebar-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 10px; }
  .sidebar--collapsed .sidebar-head { justify-content: center; }
  .sidebar-logo {
    background: none; border: none; padding: 0; cursor: pointer;
    font-size: 18px; font-weight: 700; color: var(--accent);
  }
  .sidebar-collapse-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 8px;
    background: none; border: 1px solid var(--border); color: var(--text-muted); cursor: pointer;
  }
  .sidebar-collapse-btn:hover { background: var(--surface2); color: var(--text); }

  .sidebar-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .sidebar-group { position: relative; display: flex; flex-direction: column; gap: 2px; margin-top: 10px; }
  .sidebar-caption {
    padding: 4px 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--text-muted);
  }

  .sidebar-btn {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 7px 10px; border: none; border-radius: 8px;
    background: none; color: var(--text-muted); font-size: 14px; text-align: left; cursor: pointer;
  }
  .sidebar-btn:hover { background: var(--surface2); color: var(--text); }
  .sidebar-btn.active { background: var(--accent); color: var(--on-accent); font-weight: 500; }
  .sidebar-btn-icon { display: flex; align-items: center; }

  .sidebar-icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 40px; height: 40px; margin: 0 auto; border: none; border-radius: 10px;
    background: none; color: var(--text-muted); cursor: pointer;
  }
  .sidebar-icon-btn:hover { background: var(--surface2); color: var(--text); }
  .sidebar-icon-btn.active { background: var(--accent); color: var(--on-accent); }

  .sidebar-foot { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 8px; }

  /* Collapsed: the label column disappears and sub-views move into a flyout
     that opens on hover or keyboard focus — no JS state to get out of sync. */
  .sidebar--collapsed .sidebar-btn { justify-content: center; padding: 8px; }
  .sidebar--collapsed .sidebar-nav > .sidebar-btn .sidebar-btn-label,
  .sidebar--collapsed .sidebar-foot .sidebar-btn-label { display: none; }
  .sidebar--collapsed .sidebar-flyout {
    display: none;
    position: absolute; left: calc(100% + 6px); top: 0; min-width: 180px;
    padding: 6px; border: 1px solid var(--border); border-radius: 12px;
    background: var(--surface); box-shadow: var(--shadow); z-index: 30;
  }
  .sidebar--collapsed .sidebar-group:hover .sidebar-flyout,
  .sidebar--collapsed .sidebar-group:focus-within .sidebar-flyout { display: block; }
  .sidebar-flyout-title {
    padding: 4px 10px 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--text-muted);
  }
}
```

- [ ] **Step 2: Check the CSS variables used above all exist**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && grep -n -- "--topbar-bg\|--surface2:\|--on-accent\|--shadow:" apps/web/src/index.css | head
```

Expected: each variable is defined in the theme blocks. Replace any missing one with the closest existing variable rather than a literal colour.

- [ ] **Step 3: Build to verify the stylesheet parses**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm run build
```

Expected: build succeeds with no CSS warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/index.css && git commit -m "feat(nav): style the sidebar and its collapsed icon strip"
```

---

### Task 6: Settings switch

A new section next to the language picker, following `LanguageSection`'s shape exactly (archive button, `settings-section` wrapper, `rep-seg` segmented control).

**Files:**
- Create: `apps/web/src/components/settings/sections/NavLayoutSection.tsx`
- Test: `apps/web/src/components/settings/sections/NavLayoutSection.test.tsx`
- Modify: `apps/web/src/components/settings/SettingsScreen.tsx` (import, `SECTION_TITLES`, render after `LanguageSection`)
- Modify: `apps/web/src/lib/translations/settings.ts`

**Interfaces:**
- Consumes: `useNavLayout` (Task 1), `SectionProps` and `ArchiveBtn` from `./ArchiveBtn`.
- Produces: `export function NavLayoutSection(props: SectionProps): React.ReactElement`; archive id `navLayout`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/settings/sections/NavLayoutSection.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, screen, fireEvent, cleanup } from '../../../test/utils'
import { NavLayoutSection } from './NavLayoutSection'

beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); localStorage.clear() })

describe('NavLayoutSection', () => {
  it('shows the top layout as selected by default', () => {
    renderWithProviders(<NavLayoutSection archived={false} onArchive={() => {}} />)
    expect(screen.getByRole('button', { name: 'Top' }).className).toContain('on')
    expect(screen.getByRole('button', { name: 'Side' }).className).not.toContain('on')
  })

  it('stores the side layout when picked', () => {
    renderWithProviders(<NavLayoutSection archived={false} onArchive={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Side' }))
    expect(localStorage.getItem('navLayout')).toBe('side')
    expect(screen.getByRole('button', { name: 'Side' }).className).toContain('on')
  })

  it('reads the stored choice on mount', () => {
    localStorage.setItem('navLayout', 'side')
    renderWithProviders(<NavLayoutSection archived={false} onArchive={() => {}} />)
    expect(screen.getByRole('button', { name: 'Side' }).className).toContain('on')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && cd apps/web && npx vitest run --project jsdom src/components/settings/sections/NavLayoutSection.test.tsx
```

Expected: FAIL — cannot resolve `./NavLayoutSection`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/settings/sections/NavLayoutSection.tsx`:

```tsx
import { useT } from '../../../lib/i18n'
import { useNavLayout, type NavLayout } from '../../../hooks/useNavLayout'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

const OPTIONS: { value: NavLayout; label: string }[] = [
  { value: 'top', label: 'Сверху' },
  { value: 'side', label: 'Сбоку' },
]

// Trial switch between the two navigation layouts. The choice is per-device
// (localStorage), so this section deliberately has no server state.
export function NavLayoutSection({ archived, onArchive }: SectionProps) {
  const { t } = useT()
  const { layout, setLayout } = useNavLayout()
  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="navLayout" onArchive={onArchive} />
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
        {t('Расположение меню')}
      </h3>
      <div className="rep-seg">
        {OPTIONS.map(o => (
          <button
            key={o.value}
            className={`rep-seg-btn${layout === o.value ? ' on' : ''}`}
            onClick={() => setLayout(o.value)}
          >{t(o.label)}</button>
        ))}
      </div>
      <p className="settings-hint">{t('Действует на широких экранах')}</p>
    </section>
  )
}
```

- [ ] **Step 4: Add the strings**

In `apps/web/src/lib/translations/settings.ts`, inside the `// ── Настройки ──` block:

```ts
  'Расположение меню': { uk: 'Розташування меню', en: 'Menu layout' },
  'Сверху': { uk: 'Зверху', en: 'Top' },
  'Сбоку': { uk: 'Збоку', en: 'Side' },
  'Действует на широких экранах': { uk: 'Діє на широких екранах', en: 'Applies to large screens' },
```

- [ ] **Step 5: Check the hint class exists**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && grep -rn "settings-hint" apps/web/src/index.css apps/web/src/components/settings | head -3
```

If `.settings-hint` is not already styled, use the class the neighbouring sections use for small explanatory text instead (find it with `grep -n "settings-section-title" -A 6 apps/web/src/components/settings/sections/CalSyncSection.tsx`).

- [ ] **Step 6: Wire it into the settings screen**

In `apps/web/src/components/settings/SettingsScreen.tsx`:

```tsx
import { NavLayoutSection } from './sections/NavLayoutSection'
```

Add to `SECTION_TITLES`:

```ts
  navLayout: 'Расположение меню',
```

Render it right after `LanguageSection` (line ~79):

```tsx
      <NavLayoutSection archived={isArchived('navLayout')} onArchive={archiveSection} />
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && cd apps/web && npx vitest run --project jsdom src/components/settings
```

Expected: PASS — the three new tests plus the existing settings suites (including `SettingsScreen.characterization.test.tsx`) unchanged.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/settings apps/web/src/lib/translations/settings.ts && git commit -m "feat(nav): add a settings switch between the top and side layouts"
```

---

### Task 7: Full verification and visual proof

**Files:**
- No source changes expected. Fix anything that turns red here in the task that owns it.

**Interfaces:**
- Consumes: everything above.
- Produces: screenshots plus a green test/lint/build/deno run.

- [ ] **Step 1: Run the whole suite**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test 2>&1 | tail -30
```

Expected: all projects pass. Check the exit code explicitly — grepping the log for `FAIL` is not enough:

```bash
echo "exit: $?"
```

- [ ] **Step 2: Lint at zero tolerance**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm run lint
```

Expected: no errors, no warnings.

- [ ] **Step 3: Build**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm run build
```

Expected: `tsc -b` clean, `vite build` succeeds.

- [ ] **Step 4: Start the app in demo mode**

Create `apps/web/.env.local` if it is missing (gitignored):

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key
VITE_DEMO=1
```

Then start the dev server through the preview tool (never a bare `npm run dev` in a shell) and follow the `running-tonus` skill.

- [ ] **Step 5: Capture the three states at desktop width**

Resize the preview to 1280×800, then:

1. Default: top navigation, unchanged — screenshot.
2. Open Settings → «Расположение меню» → «Сбоку» — screenshot of the expanded sidebar.
3. Click the collapse toggle, hover a group icon — screenshot of the 60px strip with the flyout open.

Check the console for errors after each step (`read_console_messages`).

- [ ] **Step 6: Check the narrow width is untouched**

Resize to 375×812 with the side layout still stored and reload. Expected: the mobile top bar, the burger drawer and the bottom nav, with no sidebar and no left padding — the `subnav` row visible as before.

- [ ] **Step 7: Commit anything the verification fixed, then hand off**

```bash
git status --short
```

Expected: clean tree if nothing needed fixing. Report the screenshots and the command output to the user, then follow `superpowers:finishing-a-development-branch` for the PR.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| ---------------- | ---- |
| Layout setting `top`/`side`, default `top` | 1, 6 |
| Visible only ≥769px, narrow screens untouched | 5 (CSS), 7 step 6 (verified) |
| Expanded sidebar: dashboard, captions, all sub-views, settings | 3 |
| Metric-gated sub-views hidden | 3 (uses `filterNavGroups`) |
| Active highlight, `hair`→Concerns, `settings` row | 3 |
| Logo moves into the sidebar | 3, 4 |
| Collapsed 60px icon strip, click → `defaultView` | 3, 5 |
| Hover/focus flyout with sub-views | 3 (markup), 5 (CSS) |
| Top bar keeps its right-hand controls, left side empty | 4 |
| `subnav` hidden on wide screens in side mode | 5 |
| Both keys in `localStorage`, unknown values → defaults, storage failure survivable | 1 |
| Single nav source shared by both layouts | 2, 3 |
| `TopBar` extraction | **dropped** — see below |
| i18n for every new string | 3 step 4, 6 step 4 |
| Node + jsdom tests as specified | 1, 3, 4, 6 |
| Existing suites pass unchanged | 4, 7 |

**Deviation from the spec, deliberate:** the spec proposed extracting the header into `components/navigation/TopBar.tsx` to keep `App.tsx` from growing. The actual change to `App.tsx` is ~15 lines (one hook call, one class, one conditional block, two conditionals in the header), so the extraction would be a large diff of moved markup with its own regression risk and no benefit to this feature. Task 4 keeps the header in place. If `App.tsx` grows past ~400 lines the extraction is worth doing on its own.

**Placeholder scan:** no TBD/TODO steps; every code step carries the actual code; the two "if the class/icon is missing" steps name the exact fallback and the command that decides it.

**Type consistency:** `NavLayout`, `NavGroup`, `GroupId`, `SidebarProps`, `resolveNavLayout`, `resolveNavCollapsed`, `useNavLayout`, `NavLayoutSection` and the class names (`sidebar`, `sidebar--collapsed`, `sidebar-flyout`, `sidebar-btn`, `sidebar-icon-btn`, `app--side`) are spelled identically in Tasks 1–6 and in the CSS.
