# Sidebar navigation layout (opt-in, switchable back)

Date: 2026-08-17
Status: approved design, ready for planning

## Problem

The app navigates through a top bar: a logo, four top-level buttons (Dashboard +
three groups) and a second row (`subnav`) with the sub-views of the active group.
Two levels mean the sub-views of the other groups are invisible until you click
their group, and the two stacked rows eat vertical space on every screen.

The user wants to try the admin-console pattern instead: one vertical sidebar
that shows every section at once and collapses to a narrow icon strip when the
screen is needed for content. This is an experiment, not a replacement — the
current top layout must stay reachable with a single switch.

## Scope

In scope:

- A second navigation layout (sidebar) for wide screens, off by default.
- A settings switch between the two layouts, plus a collapse toggle.
- Same nav content in both layouts, from the single existing source.

Out of scope:

- Mobile and tablet. Below the wide-screen breakpoint everything stays exactly
  as it is today (top bar, burger menu, bottom nav); the setting is ignored.
- Storing the choice in the database or syncing it across devices.
- Changing which screens exist, their order, or their grouping.
- Restyling the top bar's right-hand controls or any screen content.

## Behaviour

### Layout switch

- Setting `navLayout`: `top` (default) or `side`.
- The sidebar is visible only at `min-width: 769px` — the exact complement of
  the `max-width: 768px` mobile block in `index.css`, which owns the burger
  drawer and the bottom nav, so the two layouts can never both show. (An
  earlier draft of this spec said 1025px, matching leftover template rules in
  `App.css` rather than the app's real mobile breakpoint; at 769-1024px that
  would have left side mode with no navigation at all.) Under that width the app
  renders the current layout regardless of the setting.
- Switching takes effect immediately, without reload.

### Sidebar, expanded (240px)

Vertical list, one item per line, no accordions — everything visible at once:

```
Tonus                    [«]
─────────────────────────
  Dashboard

  BODY
    Overview
    Heart rate
    Sleep
    Activity
    Stress

  JOURNAL
    Supplements
    Nutrition
    Labs
    Concerns

  COACH
    Insights
    Research
    Experiments
    Goals

  ─────────────────────
  Settings
```

- Group labels are section captions, not buttons.
- Sub-views gated by `requiresMetric` are hidden exactly as they are today
  (`filterNavGroups`), so a user without sleep data sees no Sleep row.
- The active item is highlighted from the current `view`. `hair` highlights
  `Concerns` (existing `getActiveSubView` rule); `settings` highlights the
  Settings row at the bottom.
- The logo moves into the sidebar and, as today, navigates to the dashboard.

### Sidebar, collapsed (60px)

- A narrow strip of icons: Dashboard, the three group icons, Settings.
- Clicking an icon navigates to that group's `defaultView` — same behaviour as
  clicking a group in today's top bar.
- Hovering an icon opens a flyout next to it listing that group's sub-views;
  clicking one navigates. The flyout is CSS-driven (`:hover`, `:focus-within`),
  so it needs no state and closes by itself on mouse leave or blur; keyboard
  focus opens it the same way.
- The collapse toggle sits at the top of the sidebar and flips between states.

### Top bar in sidebar mode

The header stays, minus the parts that moved:

- Left side: empty (no logo, no nav buttons, no breadcrumbs).
- Right side: unchanged — geo-storm badge, focus badge, streak, notifications,
  avatar menu.
- The `subnav` row is hidden on wide screens in sidebar mode; its content lives
  in the sidebar. It stays in the DOM because narrow screens still use it, and
  the wide-screen layout is selected by CSS breakpoint rather than by a
  JavaScript media query — no `matchMedia` state, no flash on load.

### Persistence

Both settings live in `localStorage`, like the theme:

| Key           | Values             | Default |
| ------------- | ------------------ | ------- |
| `navLayout`   | `top` \| `side`    | `top`   |
| `navCollapsed`| `1` \| `0`         | `0`     |

Unknown or missing values fall back to the defaults. If `localStorage` throws
(private mode), the app runs with the defaults instead of crashing. The choice
is deliberately per-device: this is a trial layout, and a database column would
cost a migration, `gen:types` and a manual `db push` for something the user may
switch back within a day. Moving it into the profile later is a small, separate
change.

## Structure

| Unit | Responsibility |
| ---- | -------------- |
| `app/navigation.tsx` (existing) | Single source of nav items. Both layouts read `NAV_GROUPS` / `filterNavGroups`, so a new screen appears in both. Unchanged apart from any icon needed by the collapsed strip. |
| `hooks/useNavLayout.ts` (new) | Reads and writes both keys; exposes `layout`, `setLayout`, `collapsed`, `toggleCollapsed`. Pure parsers `resolveNavLayout` / `resolveNavCollapsed` are exported for tests. |
| `components/navigation/Sidebar.tsx` (new) | Renders the sidebar in both states, including the collapsed flyout. Receives the visible groups, the current view and a `setView` callback — it holds no app state of its own. |
| `App.tsx` (edited) | Chooses the layout, renders the sidebar, marks the root `app--side`, and renders the top nav row only in `top` mode. The change is ~15 lines; extracting the header into its own component was considered and dropped — it would be a large diff of moved markup with its own regression risk and no benefit to this feature. Worth revisiting if the file grows past ~400 lines. |
| `components/settings/sections/NavLayoutSection.tsx` (new) | The switch, next to `LanguageSection`. On narrow screens it renders with a note that the choice applies to large screens. |
| `App.css` | Sidebar, collapsed strip, flyout, and the content offset in sidebar mode. Existing top-bar rules stay untouched. |

All user-facing strings go through `t()` with `uk`/`en` entries added to
`lib/translations/common.ts` (nav) and `settings.ts` (the switch), per the
`adding-translations` skill.

## Testing

Node project (`*.test.ts`):

- `resolveNavLayout` / `resolveNavCollapsed`: valid values, unknown strings,
  `null`, and a throwing `localStorage`.

jsdom project (`*.test.tsx`), via `renderWithProviders`:

- Sidebar mode renders every available item and marks the app root with
  `app--side` (hiding `subnav` above the breakpoint is a CSS rule, checked in
  the browser rather than in jsdom, which applies no stylesheets).
- Sub-views gated by missing metrics are absent from the sidebar.
- The item matching the current view carries the active class; `hair` marks
  Concerns; `settings` marks the Settings row.
- Clicking a sub-view calls `setView` with that view.
- Collapsed: icons render, hovering a group icon reveals its sub-views, and
  clicking a group icon navigates to its `defaultView`.
- The settings switch flips the layout and persists the value.

Regression: `App.behavior.test.tsx` and `app/navigation.test.tsx` must pass
unchanged — with the default `top` layout nothing about the current UI changes.

Manual: run the dev server in demo mode and capture both sidebar states as
screenshots before asking for review.

## Risks

- **Two layouts to maintain.** Mitigated by keeping one nav source; only
  presentation differs.
- **Collapsed flyout is the fiddliest part** (hover intent, keyboard, focus).
  Kept simple: no animation on open, no nested submenus.
- **The header's left side becomes empty** in sidebar mode, which can look
  unbalanced. Accepted for the trial; the streak, notifications and avatar keep
  the right side occupied.
