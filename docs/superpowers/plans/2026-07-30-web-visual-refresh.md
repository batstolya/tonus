# Web Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the web app's generated-default palette and ad-hoc corner radii with a deliberate token system — "night indigo + brass" plus a three-token radius scale — proven on the dashboard, without touching the landing or auth screen.

**Architecture:** All new tokens are declared twice: a `:root` default equal to what the page renders today, and a `.app` / `[data-theme="light"] .app` override carrying the new value. The landing and auth screen render outside `.app` (`apps/web/src/App.tsx:99-100`) and there are no React portals anywhere in the codebase, so this scoping is airtight. A vitest suite parses `index.css` and enforces both the isolation invariant and the WCAG contrast floor, so the design cannot silently rot.

**Tech Stack:** Plain CSS custom properties in `apps/web/src/index.css` (no Tailwind, no CSS-in-JS), vitest node project for the token tests, Vite dev server in demo mode for visual verification.

**Spec:** `docs/superpowers/specs/2026-07-30-web-visual-refresh-design.md`

## Global Constraints

- **Node 24 for everything.** Before any npm command:
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`. Node 18 fails on modern syntax.
- **Lint is zero-tolerance:** `npm run lint` runs with `--max-warnings 0`.
- **Everything committed is in English** — commit messages, comments, identifiers, docs. Only product UI strings and i18n content may be ru/uk. Existing Russian comments in `index.css` are left as-is; new comments are written in English.
- **Do not edit** `apps/web/src/components/landing/**`, `apps/web/src/components/auth/**`, `apps/mobile/**`, or any `lib/translations/*` file.
- **Do not add dependencies.** The icon pack is explicitly out of scope.
- **Do not touch emoji.** No `<div className="sd-icon">😓</div>` → icon conversions.
- Work happens on branch `spec/web-visual-refresh` (already created from `main`, spec already committed).
- Token values are copied verbatim from the spec tables. Dark: `--bg #0F1422`, `--surface #161C2D`, `--surface2 #1E2538`, `--border #2A3247`, `--text #E6E9F2`, `--text-muted #8B93AB`, `--accent #C9A227`, `--accent-text #C9A227`, `--on-accent #0F1422`, `--ok #3FA68A`, `--warn #E08A3C`, `--bad #E36A64`. Light: `--bg #F4F5F9`, `--surface #FFFFFF`, `--surface2 #EDEFF6`, `--border #E2E5EE`, `--text #141826`, `--text-muted #5D667F`, `--accent #B08A15`, `--accent-text #6E550A`, `--on-accent #141826`, `--ok #27735F`, `--warn #96521A`, `--bad #C2403C`. Radius: `--r-surface 4px`, `--r-control 999px`, `--r-inner 2px`; `:root` defaults `14px` / `10px` / `6px`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/web/src/theme.test.ts` | **Create.** Parses `index.css` and enforces the token contract: `:root` defaults exist for every `.app` override, legacy defaults are preserved, contrast floors hold, converted rules use tokens instead of literals. |
| `apps/web/src/index.css` | **Modify.** Token blocks (top of file) + the pilot's rule conversions. The only production file this plan touches. |

No component files change. The pilot is entirely CSS plus one new test file.

---

### Task 1: Token contract test and the token blocks

**Files:**
- Create: `apps/web/src/theme.test.ts`
- Modify: `apps/web/src/index.css:1-30` (the `:root` and `[data-theme="light"]` blocks; new `.app` blocks added directly after them)

**Interfaces:**
- Consumes: nothing.
- Produces: three helpers used by every later task's tests, exported from `apps/web/src/theme.test.ts`'s own module scope (they are local to the file — later tasks add assertions to this same file rather than importing):
  - `tokens(css: string, selector: string): Record<string, string>` — merged custom properties from every block whose selector matches exactly.
  - `rule(css: string, selector: string): string` — the raw declaration text of the first rule with that exact selector.
  - `contrast(hexA: string, hexB: string): number` — WCAG 2.1 contrast ratio.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/theme.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, 'index.css'), 'utf8')

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Merged custom properties from every rule whose selector matches exactly. */
export function tokens(source: string, selector: string): Record<string, string> {
  const re = new RegExp(`(^|\\})\\s*${escape(selector)}\\s*\\{([^}]*)\\}`, 'g')
  const out: Record<string, string> = {}
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    for (const decl of m[2].split(';')) {
      const d = /^\s*(--[a-z0-9-]+)\s*:\s*(.+)$/i.exec(decl)
      if (d) out[d[1]] = d[2].trim()
    }
  }
  return out
}

/** Raw declaration text of the first rule with that exact selector. */
export function rule(source: string, selector: string): string {
  const re = new RegExp(`(^|\\})\\s*${escape(selector)}\\s*\\{([^}]*)\\}`)
  const m = re.exec(source)
  if (!m) throw new Error(`rule not found: ${selector}`)
  return m[2]
}

const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

function luminance(hex: string): number {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(full.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const rootTokens = tokens(css, ':root')
const appDark = tokens(css, '.app')
const appLight = tokens(css, '[data-theme="light"] .app')

describe('token isolation from the landing', () => {
  it('every token overridden in .app has a :root default', () => {
    const missing = Object.keys(appDark).filter(t => !(t in rootTokens))
    expect(missing).toEqual([])
  })

  it('preserves the legacy values the landing renders today', () => {
    // Landing.css:195 reads var(--radius); .btn-primary is used by landing and auth.
    expect(rootTokens['--radius']).toBe('var(--r-surface)')
    expect(rootTokens['--r-surface']).toBe('14px')
    expect(rootTokens['--r-control']).toBe('10px')
    expect(rootTokens['--on-accent']).toBe('#fff')
    expect(rootTokens['--accent']).toBe('#6c8fff')
  })
})

describe('role tokens', () => {
  it('keeps the colour-named tokens as aliases so existing call sites work', () => {
    for (const scope of [rootTokens, appDark, appLight]) {
      expect(scope['--green']).toBe('var(--ok)')
      expect(scope['--red']).toBe('var(--bad)')
      expect(scope['--yellow']).toBe('var(--warn)')
    }
  })
})

describe.each([
  ['dark', appDark],
  ['light', appLight],
])('%s theme contrast', (_name, t) => {
  const pairs: Array<[string, string, string]> = [
    ['body text on background', '--text', '--bg'],
    ['body text on surface', '--text', '--surface'],
    ['muted text on background', '--text-muted', '--bg'],
    ['muted text on surface', '--text-muted', '--surface'],
    ['accent text on surface', '--accent-text', '--surface'],
    ['button label on accent fill', '--on-accent', '--accent'],
    ['ok on surface', '--ok', '--surface'],
    ['warn on surface', '--warn', '--surface'],
    ['bad on surface', '--bad', '--surface'],
  ]

  it.each(pairs)('%s clears 4.5:1', (_label, fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test -w tonus-web -- --project node theme
```

Expected: FAIL. The `.app` and `[data-theme="light"] .app` token blocks do not exist yet, so `appDark` / `appLight` are empty objects and the contrast assertions throw on `undefined` hex values; `rootTokens['--r-surface']` is `undefined`.

- [ ] **Step 3: Add the token blocks**

In `apps/web/src/index.css`, replace the existing `:root` and `[data-theme="light"]` blocks (lines 1-30) with the following, keeping every token that is already there and adding the new ones:

```css
/* Design tokens.
   :root holds the legacy palette: it is what the landing and the auth screen
   render, and both live outside .app (App.tsx:99-100). The .app blocks below
   carry the current design. When the landing is brought onto the new palette,
   the .app blocks move up into :root and these defaults are deleted. */
:root {
  --bg: #0f0f12;
  --surface: #1a1a20;
  --surface2: #23232c;
  --border: #2e2e3a;
  --text: #e8e8f0;
  --text-muted: #8888a0;
  --accent: #6c8fff;
  --accent-text: var(--accent);
  --accent-border: color-mix(in srgb, var(--accent) 45%, var(--border));
  --on-accent: #fff;
  --ok: #5bc896;
  --warn: #ffd166;
  --bad: #ff6b6b;
  --green: var(--ok);
  --red: var(--bad);
  --yellow: var(--warn);
  --r-surface: 14px;
  --r-control: 10px;
  --r-inner: 6px;
  --radius: var(--r-surface);
  --card-shadow: none;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --topbar-bg: rgba(15,15,18,0.92);
  --shadow: 0 1px 0 rgba(255,255,255,0.04);
}

[data-theme="light"] {
  --bg: #f6f6f9;
  --surface: #ffffff;
  --surface2: #f2f2f7;
  --border: #ececf2;
  --text: #111118;
  --text-muted: #6e6e80;
  --accent: #4a6fff;
  --ok: #34c678;
  --warn: #f59e0b;
  --bad: #e53935;
  --topbar-bg: rgba(255,255,255,0.92);
  --shadow: 0 1px 0 rgba(0,0,0,0.08);
  --card-shadow: 0 4px 16px rgba(17, 17, 24, 0.06);
}

/* Night indigo + brass. Scoped to the app shell; see the comment on :root. */
.app {
  --bg: #0F1422;
  --surface: #161C2D;
  --surface2: #1E2538;
  --border: #2A3247;
  --text: #E6E9F2;
  --text-muted: #8B93AB;
  --accent: #C9A227;
  --accent-text: var(--accent);
  --accent-border: color-mix(in srgb, var(--accent) 45%, var(--border));
  --on-accent: #0F1422;
  --ok: #3FA68A;
  --warn: #E08A3C;
  --bad: #E36A64;
  --green: var(--ok);
  --red: var(--bad);
  --yellow: var(--warn);
  --r-surface: 4px;
  --r-control: 999px;
  --r-inner: 2px;
  --radius: var(--r-surface);
  --topbar-bg: rgba(15,20,34,0.92);
  --shadow: 0 1px 0 rgba(255,255,255,0.04);
}

[data-theme="light"] .app {
  --bg: #F4F5F9;
  --surface: #FFFFFF;
  --surface2: #EDEFF6;
  --border: #E2E5EE;
  --text: #141826;
  --text-muted: #5D667F;
  --accent: #B08A15;
  /* The brass fill is too light to read as text on white (4.00:1), so accent
     text and links get their own darker value. */
  --accent-text: #6E550A;
  --accent-border: color-mix(in srgb, var(--accent) 45%, var(--border));
  --on-accent: #141826;
  --ok: #27735F;
  --warn: #96521A;
  --bad: #C2403C;
  --green: var(--ok);
  --red: var(--bad);
  --yellow: var(--warn);
  --topbar-bg: rgba(244,245,249,0.92);
  --shadow: 0 1px 0 rgba(0,0,0,0.08);
  --card-shadow: 0 4px 16px rgba(20, 24, 38, 0.06);
}
```

Note: `body` sets `background: var(--bg)` and sits outside `.app`, so the
backdrop behind the app shell would stay on the legacy value. Fix that in the
same edit by giving the app shell rule its own background (`index.css:48`):

```css
.app { display: flex; flex-direction: column; min-height: 100vh; background: var(--bg); color: var(--text); }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test -w tonus-web -- --project node theme
```

Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/theme.test.ts apps/web/src/index.css
git commit -m "feat(web): a scoped token system for palette and radius

New values live under .app; :root keeps the legacy palette so the landing
and auth screen render byte-identically. Tests parse index.css and enforce
both the isolation invariant and a 4.5:1 contrast floor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Convert the shared shell rules

The topbar, nav, buttons and metric cards frame every screen. They must move first, because the dashboard is seen through them.

**Files:**
- Modify: `apps/web/src/index.css` — `.theme-toggle` (71), `.btn-secondary` (84), `.logo-btn` (95), `.nav-btn` (105), `.metric-card` (255), `.btn-primary` (545)

**Line numbers throughout Tasks 2-4 are as of `main`.** Task 1 inserts roughly
70 lines at the top of the file, so everything below shifts. Locate rules by
selector, not by line.
- Test: `apps/web/src/theme.test.ts`

**Interfaces:**
- Consumes: `tokens`, `rule`, `contrast` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/theme.test.ts`:

```ts
describe('shared shell rules use tokens', () => {
  it('primary button reads its label colour from the accent pair', () => {
    const decls = rule(css, '.btn-primary')
    expect(decls).toMatch(/color:\s*var\(--on-accent\)/)
    expect(decls).not.toMatch(/#fff/)
  })

  it.each(['.btn-primary', '.btn-secondary', '.nav-btn', '.theme-toggle'])(
    '%s uses the control radius token',
    selector => {
      expect(rule(css, selector)).toMatch(/border-radius:\s*var\(--r-control\)/)
    },
  )

  it('metric card uses the surface radius token', () => {
    expect(rule(css, '.metric-card')).toMatch(/border-radius:\s*var\(--r-surface\)/)
  })

  it('the wordmark is accent text, so it takes the readable accent', () => {
    expect(rule(css, '.logo-btn')).toMatch(/color:\s*var\(--accent-text\)/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test -w tonus-web -- --project node theme
```

Expected: FAIL — `.btn-primary` still has `color: #fff` and `border-radius: 10px`; the other selectors still carry literal `8px` / `10px` / `var(--radius)`.

- [ ] **Step 3: Convert the rules**

In `apps/web/src/index.css`, make these exact substitutions:

- `.theme-toggle` — `border-radius: 8px;` → `border-radius: var(--r-control);`
- `.btn-secondary` — `border-radius: 10px;` → `border-radius: var(--r-control);`
- `.nav-btn` — `border-radius: 8px;` → `border-radius: var(--r-control);`
- `.btn-primary` — `border-radius: 10px;` → `border-radius: var(--r-control);` and `color: #fff;` → `color: var(--on-accent);`
- `.metric-card` — `border-radius: var(--radius);` → `border-radius: var(--r-surface);`
- `.logo-btn` — `color: var(--accent);` → `color: var(--accent-text);` (the wordmark is text, and the brass *fill* is only 4.00:1 on a light topbar)

- [ ] **Step 4: Run the test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test -w tonus-web -- --project node theme
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/index.css apps/web/src/theme.test.ts
git commit -m "feat(web): move the app shell onto the radius and accent tokens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Convert the dashboard's status surfaces

Readiness, stress days, early warning, the geomagnetic banner, the context journal and the coach-focus card. This is where hard-coded `rgba()` tints of the old red and green live.

**Files:**
- Modify: `apps/web/src/index.css` — `.readiness-card` (997), `.link-btn` (1014), `.r-bar-track` / `.r-bar-fill` (1016-1017), `.stress-days-card` (1020), `.sd-item.sd-bad` / `.sd-good` (1036-1037), `.sd-item.sd-bad .sd-date` / `.sd-good .sd-date` (1042-1043), `.early-warning` (1047), `.early-warning strong` (1058), `.geostorm-banner` (1063), `.geostorm-pop` (1100), `.context-journal` (1176), `.cj-textarea` (1186), `.cj-saved` (1185), `.coach-focus-card` (1369), `.coach-focus-label` (1371), `.coach-focus-btn` (1374-1375)
- Test: `apps/web/src/theme.test.ts`

**Interfaces:**
- Consumes: `tokens`, `rule` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/theme.test.ts`:

```ts
describe('dashboard status surfaces use tokens', () => {
  it.each(['.readiness-card', '.stress-days-card', '.early-warning', '.geostorm-banner', '.context-journal', '.coach-focus-card'])(
    '%s uses the surface radius token',
    selector => {
      expect(rule(css, selector)).toMatch(/border-radius:\s*var\(--r-surface\)/)
    },
  )

  it('status tints are derived from role tokens, not literal rgba', () => {
    for (const selector of ['.sd-item.sd-bad', '.sd-item.sd-good', '.early-warning']) {
      const decls = rule(css, selector)
      expect(decls).toMatch(/color-mix\(in srgb, var\(--(ok|bad)\)/)
      expect(decls).not.toMatch(/rgba\(\s*\d/)
    }
  })

  it('the accent link colour uses the readable accent, not the fill', () => {
    expect(rule(css, '.link-btn')).toMatch(/color:\s*var\(--accent-text\)/)
    expect(rule(css, '.coach-focus-label')).toMatch(/color:\s*var\(--accent-text\)/)
  })

  it('the done state of the focus button pairs its fill with on-accent', () => {
    expect(rule(css, '.coach-focus-btn.done')).toMatch(/color:\s*var\(--on-accent\)/)
  })

  it('inputs and inner bars use the control and inner radii', () => {
    expect(rule(css, '.cj-textarea')).toMatch(/border-radius:\s*var\(--r-control\)/)
    expect(rule(css, '.r-bar-track')).toMatch(/border-radius:\s*var\(--r-inner\)/)
    expect(rule(css, '.r-bar-fill')).toMatch(/border-radius:\s*var\(--r-inner\)/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test -w tonus-web -- --project node theme
```

Expected: FAIL on every assertion above — these rules still use `var(--radius)`, literal `rgba(255, 107, 107, 0.05)`, `var(--accent)` for text, `#fff`, and literal `3px` / `8px` radii.

- [ ] **Step 3: Convert the rules**

Radius conversions — replace `border-radius: var(--radius);` with `border-radius: var(--r-surface);` in `.readiness-card`, `.stress-days-card`, `.early-warning`, `.geostorm-banner`, `.context-journal`; and `border-radius: 14px;` → `border-radius: var(--r-surface);` in `.coach-focus-card`, `border-radius: 18px;` → `border-radius: var(--r-surface);` in `.geostorm-pop`.

Inner and control radii:

```css
.r-bar-track { flex: 1; height: 6px; background: var(--border); border-radius: var(--r-inner); overflow: hidden; }
.r-bar-fill { height: 100%; border-radius: var(--r-inner); transition: width 0.4s ease; }
```

`.cj-textarea` — `border-radius: 8px;` → `border-radius: var(--r-control);`
`.coach-focus-btn` — `border-radius: 10px;` → `border-radius: var(--r-control);`

Status tints — replace the literal rgba values with role-token mixes:

```css
.sd-item.sd-bad { background: color-mix(in srgb, var(--bad) 5%, transparent); }
.sd-item.sd-good { background: color-mix(in srgb, var(--ok) 5%, transparent); }
```

```css
.early-warning {
  display: flex;
  gap: 12px;
  background: color-mix(in srgb, var(--bad) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--bad) 30%, transparent);
  border-radius: var(--r-surface);
  padding: 14px 16px;
  margin-bottom: 16px;
  align-items: flex-start;
}
```

Accent text — `.link-btn` `color: var(--accent, #6c8fff);` → `color: var(--accent-text);` (the literal fallback goes: `--accent` is always defined). `.coach-focus-label` `color: var(--accent);` → `color: var(--accent-text);`

The focus button's done state — `.coach-focus-btn.done { background: var(--green); border-color: var(--green); color: #fff; }` → use role tokens and the accent pair:

```css
.coach-focus-btn.done { background: var(--ok); border-color: var(--ok); color: var(--on-accent); }
```

Leave the `.geostorm-*` severity colours (`#BA7517`, `#D85A30`, `#E24B4A` and their `strong` variants) exactly as they are: they encode a published Kp severity scale rather than app state, and re-deriving them from role tokens is a semantic change, not a restyle.

- [ ] **Step 4: Run the test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test -w tonus-web -- --project node theme
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/index.css apps/web/src/theme.test.ts
git commit -m "feat(web): derive dashboard status surfaces from role tokens

Status tints were literal rgba() of the old red and green, so they could
not follow a palette change. They are now color-mix over --ok/--bad.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Convert the streak, bell, calendar and empty state

The gamified-home surfaces, plus the `--accent-border` bug the spec calls out.

**Files:**
- Modify: `apps/web/src/index.css` — `.streak-card` (2079), `.streak-menu-trigger` (2089), `.streak-menu-panel` (2101), `.streak-menu-today-bar` / `-fill` (2124-2128), `.streak-menu-close` (2130), `.bell-trigger` (2142), `.bell-badge` (2150), `.bell-panel` (2160), `.bell-item` (2177), `.bell-item-icon` (2182), `.bell-item.level-streak .bell-item-icon` (2190), `.bell-item-more` (2196), `.bell-item-ack:hover` (2210), `.activity-cal` (2238), `.activity-cal-arrow` (2249), `.activity-cal-week.done` (2269), `.activity-cal-cell.status-active` (2276), `.empty-state` (2287), `.empty-state-cta` (2295)
- Test: `apps/web/src/theme.test.ts`

**Interfaces:**
- Consumes: `tokens`, `rule` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/theme.test.ts`:

```ts
describe('gamified home surfaces use tokens', () => {
  it.each(['.streak-menu-panel', '.bell-panel', '.bell-item', '.activity-cal', '.empty-state'])(
    '%s uses the surface radius token',
    selector => {
      expect(rule(css, selector)).toMatch(/border-radius:\s*var\(--r-surface\)/)
    },
  )

  it.each(['.streak-menu-trigger', '.bell-trigger', '.empty-state-cta'])(
    '%s uses the control radius token',
    selector => {
      expect(rule(css, selector)).toMatch(/border-radius:\s*var\(--r-control\)/)
    },
  )

  it('every accent-filled surface pairs its text with on-accent', () => {
    for (const selector of ['.empty-state-cta', '.bell-badge', '.activity-cal-week.done', '.activity-cal-cell.status-active']) {
      const decls = rule(css, selector)
      expect(decls).toMatch(/color:\s*var\(--on-accent\)/)
      expect(decls).not.toMatch(/#fff/)
    }
  })

  it('the streak level tint is derived from a token, not a stray orange', () => {
    expect(rule(css, '.bell-item.level-streak .bell-item-icon')).not.toMatch(/#ff7a1a/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test -w tonus-web -- --project node theme
```

Expected: FAIL — these rules still carry literal `8px` / `10px` / `12px` / `14px` / `18px` radii, `color: #fff`, and the hard-coded `#ff7a1a`.

- [ ] **Step 3: Convert the rules**

Radii — `border-radius: 10px;` in `.streak-card` → `var(--r-inner)` (it nests inside the streak panel); `12px` in `.streak-menu-panel`, `18px` in `.bell-panel`, `14px` in `.bell-item`, `var(--radius)` in `.activity-cal` and `.empty-state` → `var(--r-surface)`; `8px` in `.streak-menu-trigger` and `.bell-trigger`, `999px` in `.empty-state-cta` → `var(--r-control)`; `6px` in `.streak-menu-close` and `.activity-cal-arrow` → `var(--r-control)`; `2px` in `.streak-menu-today-bar` and `.streak-menu-today-fill` → `var(--r-inner)`; `12px` in `.bell-item-icon` → `var(--r-inner)`.

Leave `border-radius: 999px` on `.activity-cal-week`, `.activity-cal-cell` and `.bell-item-ack` as literals — those are circles by geometry (equal width and height), not controls following the scale.

Accent pairs:

```css
.bell-badge {
  position: absolute; top: -5px; right: -5px;
  min-width: 16px; height: 16px; padding: 0 4px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bad); color: var(--on-accent);
  border-radius: 999px; font-size: 10px; font-weight: 700; line-height: 1;
}
```

```css
.activity-cal-week.done { background: var(--ok); border-color: var(--ok); color: var(--on-accent); }
```

```css
.activity-cal-cell.status-active { background: var(--ok); color: var(--on-accent); }
```

```css
.empty-state-cta {
  border: none; border-radius: var(--r-control); padding: 8px 16px; cursor: pointer;
  background: var(--accent); color: var(--on-accent); font-weight: 600;
}
```

Colour tokens — `.streak-menu-today-fill` `background: var(--green);` → `var(--ok)`; `.bell-item-ack:hover` `color: var(--green);` → `color: var(--ok);`; `.bell-item-more` `color: var(--accent);` → `color: var(--accent-text);`; `.bell-item.level-red .bell-item-icon` and `.level-yellow` mixes switch from `var(--red)` / `var(--yellow)` to `var(--bad)` / `var(--warn)`; `.bell-item.level-streak .bell-item-icon` `color-mix(in srgb, #ff7a1a 16%, transparent)` → `color-mix(in srgb, var(--accent) 16%, transparent)`.

The `--accent-border` fix needs no edit here — Task 1 defined the token in
`:root` and both `.app` blocks, so `.streak-menu-trigger:hover` and
`.bell-trigger:hover` (which already reference it) start resolving.

- [ ] **Step 4: Run the test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test -w tonus-web -- --project node theme
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/index.css apps/web/src/theme.test.ts
git commit -m "feat(web): move streak, bell, calendar and empty state onto tokens

Also gives --accent-border a definition: it was referenced by the streak
and bell hover states and defined nowhere, so border-color fell back to
currentColor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Visual verification and full gate

No new code. This task proves the pilot in a browser and runs every gate CI will run.

**Files:**
- Modify: none expected. If verification surfaces a defect, fix it here and note it in the commit.

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: the evidence attached to the PR.

- [ ] **Step 1: Start the dev server**

`apps/web/.env.local` already sets `VITE_DEMO=1`, so the dashboard renders on fixtures with no Supabase.

Use `preview_start` with `{name: "tonus-dev"}` (from `.claude/launch.json`). Do not start Vite through Bash.

- [ ] **Step 2: Capture the dashboard in both themes**

Navigate to the dev server root. The demo dashboard is the default view. Screenshot dark, then toggle the theme in the topbar and screenshot light.

Check specifically, since these are the spec's contrast-critical spots:
- the primary button and the empty-state CTA — dark label on brass, legible in both themes;
- accent text (`.coach-focus-label`, `.link-btn`, `.bell-item-more`) in light theme;
- the streak and bell trigger hover borders — a brass tint, not the text colour.

- [ ] **Step 3: Prove the landing is untouched**

Set `VITE_DEMO=0` in `apps/web/.env.local`, reload, and screenshot the landing in both themes. It must be indistinguishable from `main`. Restore `VITE_DEMO=1` afterwards and leave `.env.local` as it was found — it is gitignored and must not be committed.

If the landing changed, a token was overridden without a `:root` default, or a shared rule was converted that the landing uses. The Task 1 test covers the first case; the second means auditing the converted selectors against `components/landing`.

- [ ] **Step 4: Run the full gate**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test && npm run lint && npm run build
```

Expected: all three pass. `npm test` runs the web, shared and root vitest projects; `npm run lint` runs with `--max-warnings 0`.

- [ ] **Step 5: Commit any fixes and open the PR**

```bash
git push -u origin spec/web-visual-refresh
```

Then open a PR to `main` titled `feat(web): a palette and radius system, piloted on the dashboard`, with the before/after dashboard screenshots and the landing comparison in the body.

---

## Self-Review

**Spec coverage.** Landing isolation → Task 1 (`:root` defaults + the isolation test) and Task 5 Step 3 (visual proof). Palette tables → Task 1 token blocks, with the contrast floor asserted per pair. Role aliases → Task 1 test and blocks. Radius system → Task 1 tokens, applied in Tasks 2-4. `--on-accent` requirement → Tasks 2 and 4 assert no `#fff` survives on accent fills. Light-theme `--accent-text` → Tasks 3 and 4. Pilot scope sections → Tasks 2-4 cover every section marker the spec lists, plus the coach-focus rules at 1369-1377. `--accent-border` bug → Task 1 defines it, Task 4 notes the resolution. Verification section → Task 5. Deferred icon work → not in any task, correctly.

**Known deviation from the spec's own scope note:** the spec lists `.topbar` among the shared surfaces, but Task 2 leaves it alone — it carries no radius and no colour literal, only `var(--topbar-bg)`, which Task 1 already overrides per scope. Nothing to convert.

**Placeholder scan:** no TBD/TODO, no "add error handling", every code step carries the actual CSS or TypeScript.

**Type consistency:** `tokens`, `rule` and `contrast` keep the same signatures across Tasks 1-4; every selector string used in a later test appears verbatim in that task's file list.
