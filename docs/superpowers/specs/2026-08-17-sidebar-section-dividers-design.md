# Sidebar sections and a flyout-free collapsed strip

Date: 2026-08-17
Status: approved design, ready for implementation
Follows: `2026-08-17-sidebar-nav-layout-design.md` (PR #226)

## Problem

Two complaints after living with the shipped sidebar:

1. **Everything reads as one heap.** The three groups sit in one continuous
   list with only a 10px gap and an uppercase caption between them, so the eye
   finds no structure. The reference the user brought (an admin console) makes
   each section a separate block: caption, items, then a hairline rule.
2. **The collapsed strip's flyout is the wrong mechanism.** Sub-views open on
   hover next to the 60px strip. It needs a pointer, it needed a
   `@media (hover: hover)` guard and a re-shown sub-nav row as the touch
   fallback, and the user simply does not want it — the top sub-nav row is
   where they expect to pick a sub-view while collapsed.

## Scope

In scope: the sidebar's visual grouping when expanded, removal of the flyout,
and the collapsed strip's separators.

Out of scope: which items exist and their order; the settings switch; the
`useNavLayout` hook; anything at narrow widths; the active-item style (stays on
the app's accent fill rather than the reference's white card — the reference's
palette is not ours).

## Behaviour

### Expanded (240px)

Each group becomes a visually separate block:

```
Tonus                    [«]
  Dashboard
  ─────────────────────────
  Body
    Overview
    Heart rate
    Sleep
    Activity
    Stress
  ─────────────────────────
  Journal
    Supplements
    …
  ─────────────────────────
  Coach
    …
  ─────────────────────────
  Settings
```

- A `1px solid var(--border)` rule closes every section, with 12px of space
  above and below it. The same rule already separated the Settings row, so the
  device is not new — it now applies to all of them, and Dashboard becomes its
  own block instead of reading as part of Body.
- Section captions follow the reference: 12px, weight 600, sentence case
  (today: 11px, uppercase, letter-spaced), colour `var(--text-muted)`.
- Items get room: vertical padding 7px → 9px, font size 14px, radius 10px,
  2px between items as today.
- The active item keeps the accent fill it has everywhere else in the app.

### Collapsed (60px)

- The flyout is **removed** — markup and CSS both, including
  `sidebar-flyout-title` and the `@media (hover: hover)` guard that existed
  only to keep hover-to-open off touch devices. Hovering an icon now does
  nothing beyond the normal hover highlight.
- Sub-views are picked in the top sub-nav row, which is already visible in this
  state. That was introduced as the touch fallback; it becomes the only path,
  so touch and pointer behave identically.
- The strip keeps the same rhythm as the expanded list: the section rules
  render between the group icons too.
- Clicking a group icon still opens that group's default view, and each icon
  keeps its `aria-label`.

Nothing changes below the 769px breakpoint, and nothing changes for a user on
the default top layout.

## Structure

| File | Change |
| ---- | ------ |
| `apps/web/src/components/navigation/Sidebar.tsx` | Drop the `sidebar-flyout` wrapper and its title; render each group's sub-views directly inside `sidebar-group` when expanded, and nothing but the icon when collapsed. Update the component comment, which currently describes the flyout. |
| `apps/web/src/index.css` | Section rules and spacing; caption restyle; item padding; delete every `.sidebar-flyout*` rule and the `@media (hover: hover)` block. The `.app--side:has(.sidebar--collapsed) .subnav` rule stays — it is now the primary path, not a fallback, so its comment needs rewording. |
| `apps/web/src/components/navigation/Sidebar.test.tsx` | The two flyout tests are replaced: collapsed renders no sub-view buttons at all, and expanded renders every one of them. |
| `e2e/sidebar-nav.spec.ts` | The collapsed test asserts the sub-nav row carries the sub-views and that no flyout element exists, instead of hovering for one. |

No new strings, no new icons, no new dependencies.

## Testing

- jsdom (`Sidebar.test.tsx`): expanded renders all sub-view buttons and one
  caption per group; collapsed renders the group icons and **no** sub-view
  buttons; the existing active-state, navigation and metric-gating tests stay
  green unchanged.
- Browser (`e2e/sidebar-nav.spec.ts`): collapsed at 1280px shows the 60px
  strip, `.sidebar-flyout` does not exist anywhere, the sub-nav row is visible
  and clicking a sub-view in it navigates; expanded still hides the sub-nav
  row. The existing default-layout and narrow-screen tests stay unchanged.
- Visual check in demo mode at 1280x800 for both states before review.
- `npm test`, `npm run lint`, `npm run build` all clean.

## Risks

- **The dividers could make a 16-row list feel busier, not calmer.** Mitigated
  by keeping them hairline and spending the space on padding rather than more
  ink; the visual check is where this gets judged.
- **Removing the flyout is a loss of one click** for pointer users while
  collapsed: a sub-view now takes a trip to the top row. That is the user's
  explicit call, and it buys identical behaviour on every input device.
