# Avatar Account Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four separate desktop account controls with one accessible Tonus-styled menu opened from the user's avatar.

**Architecture:** `App` continues to own language, theme, navigation, and sign-out state and passes them to an expanded `TopbarAvatar`. The avatar component owns only popover visibility and its main/language/theme view. Existing mobile drawer controls remain in `App` and unchanged.

**Tech Stack:** React 19, TypeScript 6, Vitest, Testing Library, CSS design tokens, Phosphor icon registry.

## Global Constraints

- Dev and production builds require Node 24.
- Reuse existing `useT`, `useTheme`, `Icon`, and avatar-loading behavior; add no dependency.
- Desktop only: do not redesign the mobile drawer.
- Use existing Tonus color, border, radius, shadow, typography, and spacing tokens.
- Preserve unrelated working-tree changes in Doctor Report files.
- Verify focused tests, the web test suite, the Node 24 production build, and light/dark desktop visual states.

---

### Task 1: Account menu behavior

**Files:**
- Create: `apps/web/src/components/ui/TopbarAvatar.behavior.test.tsx`
- Modify: `apps/web/src/components/ui/TopbarAvatar.tsx`

**Interfaces:**
- Consumes: `User` from `@supabase/supabase-js`, `Lang` from `lib/i18n`, `ThemeMode` from `hooks/useTheme`, `Icon`, `Avatar`, `getAvatarUrl`, and `AVATAR_CHANGED`.
- Produces: `TopbarAvatar({ user, lang, onSelectLang, themeMode, onSelectTheme, onOpenSettings, onSignOut })` with callbacks typed as `(lang: Lang) => void`, `(mode: ThemeMode) => void`, and `() => void`.

- [ ] **Step 1: Write failing interaction tests**

Create tests that mock `getAvatarUrl`, render a user with `email: 'test@example.com'`, and assert:

```tsx
const props = {
  user: { id: 'u1', email: 'test@example.com' } as User,
  lang: 'en' as Lang,
  onSelectLang: vi.fn(),
  themeMode: 'system' as ThemeMode,
  onSelectTheme: vi.fn(),
  onOpenSettings: vi.fn(),
  onSignOut: vi.fn(),
}

fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
expect(screen.getByText('test@example.com')).toBeInTheDocument()
expect(screen.getByRole('button', { name: /Language/ })).toHaveTextContent('EN')
expect(screen.getByRole('button', { name: /Theme/ })).toHaveTextContent('System')
```

Add separate cases for language selection, theme selection, settings, sign-out,
outside click, and Escape. Language/theme cases enter the corresponding in-panel
view, click a concrete option, assert the callback argument, and assert the main
rows are visible again. Settings/sign-out cases assert their callbacks and menu
closure. Outside-click and Escape cases assert `aria-expanded="false"` and panel
removal.

- [ ] **Step 2: Run the focused test and verify red state**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npx vitest run apps/web/src/components/ui/TopbarAvatar.behavior.test.tsx
```

Expected: FAIL because the current component accepts only `onOpen` and renders no account panel.

- [ ] **Step 3: Implement the typed menu state and markup**

Change the component interface to:

```tsx
interface TopbarAvatarProps {
  user: User
  lang: Lang
  onSelectLang: (lang: Lang) => void
  themeMode: ThemeMode
  onSelectTheme: (mode: ThemeMode) => void
  onOpenSettings: () => void
  onSignOut: () => void
}

type AccountMenuView = 'main' | 'language' | 'theme'
```

Keep the existing avatar URL effect. Wrap the trigger in `.account-menu`, add
`aria-haspopup="menu"`, `aria-expanded`, and `aria-controls="account-menu-panel"`.
Render a fixed overlay and `.account-menu-panel` only while open. On the main
view render the email header and rows for language, theme, settings, and sign-out.
Use `Icon` names `world`, `moon`, `settings`, `signOut`, and `chevronRight`.
Language options are `ru`, `uk`, `en`; theme options are `light`, `dark`,
`system`. Provide a back button in each option view. After selection, call the
supplied callback and return to `main` without closing the popover.

Use an effect while open to listen for `keydown`; close and reset to `main` on
Escape. The overlay closes and resets the menu. Settings and sign-out call their
callbacks after closing.

- [ ] **Step 4: Run the focused test and verify green state**

Run the same Vitest command. Expected: all `TopbarAvatar` behavior tests PASS.

- [ ] **Step 5: Commit the self-contained component behavior**

```bash
git add apps/web/src/components/ui/TopbarAvatar.tsx apps/web/src/components/ui/TopbarAvatar.behavior.test.tsx
git commit -m "feat(web): add avatar account menu"
```

---

### Task 2: Desktop topbar integration and Tonus styling

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.behavior.test.tsx`
- Modify: `apps/web/src/index.css`
- Test: `apps/web/src/components/ui/TopbarAvatar.behavior.test.tsx`

**Interfaces:**
- Consumes: the `TopbarAvatarProps` contract from Task 1 and existing `lang`, `setLang`, `themeMode`, `setThemeMode`, `setView`, and `handleSignOut` values in `App`.
- Produces: one desktop account-menu trigger with no separate desktop language, theme, settings, or sign-out controls; unchanged mobile drawer controls.

- [ ] **Step 1: Add failing application composition assertions**

Extend `App.behavior.test.tsx` with a desktop-account-controls case. After rendering
`App`, await the lazy avatar trigger and assert the topbar has one profile button,
no direct `Sign out` button, and no direct topbar buttons titled `Language`,
`Theme`, or `Settings`. Open the avatar and assert the menu exposes those four
actions. Keep the existing mobile-drawer language tests unchanged.

```tsx
const profile = await screen.findByRole('button', { name: 'Profile' })
expect(container.querySelector('.topbar > .topbar-right > .signout-btn')).toBeNull()
fireEvent.click(profile)
expect(screen.getByRole('button', { name: /Language/ })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /Theme/ })).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
```

- [ ] **Step 2: Run application behavior tests and verify red state**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npx vitest run apps/web/src/App.behavior.test.tsx
```

Expected: FAIL because the four direct desktop controls still exist and the avatar
does not yet receive the new callbacks.

- [ ] **Step 3: Replace desktop controls in `App`**

Remove `langMenuOpen`, the desktop language popover, the `ThemeMenu` import and
render, the direct settings button, and the direct `.signout-btn`. Render:

```tsx
<TopbarAvatar
  user={user}
  lang={lang}
  onSelectLang={setLang}
  themeMode={themeMode}
  onSelectTheme={setThemeMode}
  onOpenSettings={() => setView('settings')}
  onSignOut={handleSignOut}
/>
```

Do not modify the theme and language segmented controls or sign-out action in the
mobile drawer.

- [ ] **Step 4: Add Tonus-native account menu CSS**

Add focused `.account-menu*` rules beside `.topbar-avatar`: relative anchor,
fixed overlay below popovers, right-aligned panel, width around `300px` capped by
the viewport, `var(--surface)`, `var(--border)`, `var(--r-surface)`, and existing
shadow language. Define email truncation, full-width action rows, muted values,
separator before sign-out, hover/active states, icon alignment, and visible
`:focus-visible` outlines.

Add a small-screen rule that hides `.topbar-avatar` at `max-width: 768px`, because
the unchanged burger drawer remains the mobile account entry point. Remove only
desktop-menu CSS that becomes provably unused; keep shared `.lang-*` and
`.theme-*` selectors if another screen still consumes them.

- [ ] **Step 5: Run focused behavior tests**

Run:

```bash
npx vitest run apps/web/src/components/ui/TopbarAvatar.behavior.test.tsx apps/web/src/App.behavior.test.tsx
```

Expected: PASS, including unchanged mobile drawer language cases.

- [ ] **Step 6: Commit integrated desktop UI**

```bash
git add apps/web/src/App.tsx apps/web/src/App.behavior.test.tsx apps/web/src/index.css
git commit -m "refactor(web): move account controls behind avatar"
```

---

### Task 3: Regression and visual verification

**Files:**
- Modify only if verification exposes a scoped defect: `apps/web/src/components/ui/TopbarAvatar.tsx`, `apps/web/src/App.tsx`, `apps/web/src/index.css`, or their tests.

**Interfaces:**
- Consumes: completed avatar menu and desktop topbar composition.
- Produces: tested, buildable account menu with documented desktop and mobile visual checks.

- [ ] **Step 1: Run the web test suite under Node 24**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm --prefix apps/web test
```

Expected: PASS with no new failures.

- [ ] **Step 2: Run lint only for changed TypeScript files**

```bash
npx eslint apps/web/src/App.tsx apps/web/src/App.behavior.test.tsx apps/web/src/components/ui/TopbarAvatar.tsx apps/web/src/components/ui/TopbarAvatar.behavior.test.tsx
```

Expected: PASS. Do not broaden this to fixing pre-existing repository lint errors.

- [ ] **Step 3: Run the production build under Node 24**

```bash
npm --prefix apps/web run build
```

Expected: TypeScript and Vite build succeed.

- [ ] **Step 4: Perform local visual QA**

Create the gitignored `apps/web/.env.local` only if it does not already exist,
using the documented dummy Supabase URL and anon key, then run the dev server on
Node 24. At desktop width verify light and dark modes: controls are aligned,
email truncates, all menu views stay within the viewport, active/focus states are
visible, and settings/sign-out close the menu. At `<=768px`, verify the avatar is
hidden and the burger drawer still exposes settings, theme, language, and sign-out.

- [ ] **Step 5: Review the final diff for scope and unrelated changes**

```bash
git diff --check
git status --short
git diff origin/main...HEAD -- apps/web/src/App.tsx apps/web/src/App.behavior.test.tsx apps/web/src/components/ui/TopbarAvatar.tsx apps/web/src/components/ui/TopbarAvatar.behavior.test.tsx apps/web/src/index.css
```

Expected: no whitespace errors; only the agreed account-menu files are part of
this implementation. Existing Doctor Report modifications remain unstaged and
untouched.

- [ ] **Step 6: Commit any verification-only correction**

If Step 1–5 required a scoped correction, stage only the corrected account-menu
files and commit:

```bash
git commit -m "fix(web): polish avatar account menu"
```

If no correction was needed, do not create an empty commit.
