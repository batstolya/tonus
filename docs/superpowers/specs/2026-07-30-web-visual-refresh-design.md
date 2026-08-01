# Web app visual refresh: palette and radius system (dashboard pilot)

**Date:** 2026-07-30
**Status:** Design approved, pending spec review
**Updated:** 2026-08-02 — the brass accent shipped, was seen live, and was
rejected. The accent is now graphite; see "Palette" below for what changed
and why, kept alongside the original brass reasoning rather than written over
it.

## Problem

The web app's visual identity reads as machine-generated defaults rather than
a deliberate design. Three concrete symptoms, all in `apps/web/src/index.css`:

1. **The palette is the AI default.** `--accent: #6c8fff` is periwinkle
   indigo — the single most common generated-UI accent. `--green: #5bc896`,
   `--red: #ff6b6b`, `--yellow: #ffd166` are Tailwind's emerald/rose/amber
   family. The neutral ramp (`#0f0f12` → `#2e2e3a`) is untinted grey-violet,
   with no temperature of its own.
2. **There is no radius system.** 251 `border-radius` declarations use ~18
   distinct values; only 33 of them go through `var(--radius)`. The
   distribution clusters at 8/10/12px, which is exactly the uniform
   mid-radius look that signals "defaults were never revisited".
3. **Tokens leak.** 94 distinct hard-coded hex values live outside the token
   block, so the theme cannot actually be changed from one place.

Separately, `--green` / `--red` / `--yellow` are named after colors rather
than roles. Any palette change makes those names lie.

## Goals

1. A deliberate palette — "night indigo + graphite" (shipped first as
   "night indigo + brass", replaced after live review — see "Palette" below)
   — applied to the authed web app, with verified contrast in both themes.
2. A radius system of three tokens with an intentional contrast between
   surfaces and controls, replacing ad-hoc per-rule values.
3. Role-named semantic tokens (`--ok` / `--warn` / `--bad`) with the old
   color names kept as aliases, so no existing call site breaks.
4. All of the above proven on one screen — the dashboard — before any
   app-wide rollout.

## Non-goals

- **The landing page is not touched.** Not visually, not in
  `components/landing/Landing.css`. See "Landing isolation" below for how
  this is guaranteed structurally rather than by discipline.
- **The auth screen is not touched** — it renders outside `.app`
  (`App.tsx:99`) and therefore keeps the current palette. It will be picked
  up when the landing is.
- **No icon work.** Replacing the ~120 emoji with an SVG icon pack was
  considered and explicitly deferred (see "Deferred" below). No new
  dependency is added by this spec.
- **No i18n changes.** Emoji baked into translation keys
  (`'☕ Кофе': { uk: '☕ Кава', … }`) stay exactly as they are.
- **No layout, spacing, typography or copy changes.** Colors and corner radii
  only.
- **Not all 251 radius declarations and 94 hard-coded colors** — the pilot
  converts the dashboard's share of them. The rest is rollout work.
- **No mobile app changes.** `apps/mobile` has its own styles and does not
  consume this CSS.

## Design

### Landing isolation

The landing consumes the same global tokens the app does: `var(--accent)`
appears 23 times in `Landing.css` and 20 more in the landing components, plus
`--bg`, `--surface`, `--border`, `--text`, `--text-muted`. Editing `:root`
would repaint it.

It renders **outside** the app shell, though — `LandingScreen` at
`App.tsx:100`, `<div className="app">` at `App.tsx:111` — and there are no
React portals anywhere in the codebase, so `.app` cleanly encloses the entire
authed UI including modals and the chat widget.

Therefore:

> **Every token this spec introduces gets a `:root` default equal to today's
> rendered value, and a `.app` override carrying the new value.**

New values live in `.app { … }` and `[data-theme="light"] .app { … }`.
`:root` keeps the current palette. This rule matters beyond tidiness: shared
rules like `.btn-primary` are used both inside and outside `.app`, and a
token referenced with no `:root` definition would compute as invalid there
and silently break the landing's buttons. With the rule applied, the landing
renders byte-identically before and after.

When the landing is eventually brought along, the `.app` block moves to
`:root` and the defaults are deleted.

### Palette: night indigo + graphite

**Originally shipped as "night indigo + brass."** The reasoning that picked
brass is kept below verbatim, because it was the real reasoning at the time —
not because it still holds:

> Chosen over a warm-terracotta and a sage-plum alternative because a health
> dashboard encodes state in color constantly, and the accent must not
> collide with the status trio. Brass sits far from teal/ochre/coral on the
> wheel; a terracotta accent would have sat between the "warn" and "bad"
> hues.

Brass shipped, was seen live, and was rejected. Forcing the fill to clear
4.5:1 against white desaturates any warm hue into a muddy tan, and at the
readiness-score number — the single largest coloured element on the
dashboard at a mid-range score — that read as a second brown mass sitting
next to the already-brown accessible "warn" state. The lesson wasn't "pick a
different hue" (a cooler accent has the same problem in reverse against
"ok"); it's that any *hued* accent competes with the three status colors by
construction, however far apart on the wheel it starts.

**The accent became graphite** — near-black in light theme, near-white in
dark theme — so colour is reserved for status indicators alone. Everything
that used to be "coloured because it's a control" (buttons, the wordmark,
active tabs) is ink now instead. The readiness-score number itself was moved
off `r.color` for the same reason and now inherits `--text`; its band colour
still lives on the sublabel underneath it and on the three progress bars.

**Dark (`.app`)**

| Token | Value | Contrast |
| --- | --- | --- |
| `--bg` | `#0F1422` | — |
| `--surface` | `#161C2D` | — |
| `--surface2` | `#1E2538` | — |
| `--border` | `#2A3247` | 1.44 on bg (decorative) |
| `--text` | `#E6E9F2` | 15.13 on bg |
| `--text-muted` | `#8B93AB` | 6.00 on bg, 5.54 on surface |
| `--accent` | `#E6E9F2` | 13.97 as text on surface |
| `--accent-text` | `#E6E9F2` | same as `--accent` in dark |
| `--on-accent` | `#0F1422` | 15.13 on accent fill |
| `--ok` | `#3FA68A` | 6.15 on bg, 5.68 on surface |
| `--warn` | `#E08A3C` | 6.88 on bg, 6.36 on surface |
| `--bad` | `#E36A64` | 5.26 on surface |
| `--ok-fill` | `#3FA68A` | fill only, no contrast floor — see "Fill tokens" below |
| `--warn-fill` | `#E08A3C` | fill only |
| `--bad-fill` | `#E36A64` | fill only |

**Light (`[data-theme="light"] .app`)**

| Token | Value | Contrast |
| --- | --- | --- |
| `--bg` | `#F4F5F9` | — |
| `--surface` | `#FFFFFF` | — |
| `--surface2` | `#EDEFF6` | — |
| `--border` | `#E2E5EE` | decorative |
| `--text` | `#141826` | 16.22 on bg |
| `--text-muted` | `#5D667F` | 5.72 on surface |
| `--accent` | `#232936` | 14.56 as text on surface |
| `--on-accent` | `#FFFFFF` | 14.56 on accent fill |
| `--accent-text` | `#232936` | same as `--accent` — graphite is dark enough to serve as both |
| `--ok` | `#27735F` | 5.67 on surface |
| `--warn` | `#96521A` | 5.97 on surface |
| `--bad` | `#C2403C` | 5.13 on surface |
| `--ok-fill` | `#3FA68A` | fill only, no contrast floor — see "Fill tokens" below |
| `--warn-fill` | `#E0A33E` | fill only — marginally lighter than dark's `--warn-fill` |
| `--bad-fill` | `#E36A64` | fill only |

Every ratio above was computed against WCAG 2.1 relative luminance and clears
4.5:1 for text use. Two consequences worth stating explicitly:

- **`--on-accent` is required, not cosmetic.** `.btn-primary` currently
  hard-codes `color: #fff` over `background: var(--accent)`. White on brass
  was 2.42:1 (dark) / 3.23:1 (light) — a real accessibility failure that
  motivated the rule regardless of which hue the accent ends up being. The
  rule is `color: var(--on-accent)`, with `:root { --on-accent: #fff }`
  preserving today's landing rendering.
- **`--accent-text` was a separate value in light theme only while the
  accent was brass.** The brass *fill* (`#B08A15`) was too light to sit on
  white as text (3.23:1), so accent-colored text and links needed their own
  darker value there. Graphite doesn't have that problem — `#232936` clears
  14.56:1 as both a fill and as text — so `--accent-text` is `var(--accent)`
  in both themes now. The token itself stays (call sites still reference it),
  it's just no longer aliasing to a distinct literal.

**Role aliases.** `--ok` / `--warn` / `--bad` are the real tokens;
`--green: var(--ok)`, `--red: var(--bad)`, `--yellow: var(--warn)` are kept
so that ~200 existing references keep working untouched. New and migrated
code uses the role names. The old names are removed only when the last
reference is gone — not in this pass.

**Fill tokens.** `--ok` / `--warn` / `--bad` are used two ways at once: as
text (the readiness sublabel, warning copy) and as fills (the readiness
progress bars, the streak today-bar). Text on white must clear 4.5:1, which
is exactly what forces light theme's `--warn` down to `#96521A` — an
accessible amber is necessarily brown once it has to serve as text. A bar
carries no text and has no contrast requirement, so it was paying a tax it
didn't owe: the same brown that reads fine as a small label reads as dead
weight across a whole progress track.

Each role therefore gets a second token — `--ok-fill` / `--warn-fill` /
`--bad-fill` — reserved for surfaces that carry no text. In dark theme these
equal the existing text tokens (already bright enough to double as fills).
In light theme they diverge: light and dark converge on essentially one
bright set of fills (`--warn-fill` is `#E0A33E` in light vs `#E08A3C` in
dark — marginally lighter, chosen by eye, otherwise identical), while the
text tokens stay theme-specific and dark-in-light. `:root` defaults each
`-fill` token to `var(--ok)` / `var(--warn)` / `var(--bad)`, so nothing
outside `.app` changes.

The split is applied narrowly: only to fills with nothing rendered on top of
them (the three readiness bars, `.streak-menu-today-fill`). Filled surfaces
that carry a label — `.activity-cal-cell.status-active`,
`.activity-cal-week.done`, `.bell-badge`, `.coach-focus-btn.done`,
`.empty-state-cta` — stay on the text-safe tokens, because `--on-ok` is
white and white on `--ok-fill` (`#3FA68A`) measures 2.99:1, a contrast
failure.

### Radius: contrast system

| Token | Value | Applies to |
| --- | --- | --- |
| `--r-surface` | `4px` | cards, panels, modals, the topbar's descendants |
| `--r-control` | `999px` | buttons, chips, tabs, inputs, badges |
| `--r-inner` | `2px` | elements nested inside a card (chart bars, thumbnails) |

`--radius` becomes an alias of `--r-surface`.

The point is the *contrast*, not the numbers: near-rectangular surfaces
against fully-rounded controls reads as a decision, where a uniform 8–12px
everywhere reads as a default. It also makes "this is clickable" legible
without relying on color.

Each `:root` default is chosen so that everything outside `.app` keeps the
exact radius it renders today. The boundary is crossed in two ways, both
enumerated by grep:

- **By class.** `.btn-primary` and `.btn-ghost` are the only app-shell
  classes the landing and auth markup use. `.btn-primary`'s current literal
  `10px` fixes `--r-control: 10px`; `.btn-ghost` has no radius and no accent.
- **By token.** `Landing.css` reads `--accent`, `--bg`, `--surface`,
  `--surface2`, `--border`, `--text`, `--text-muted`, `--topbar-bg` and
  `--radius`. The last one (`Landing.css:195`) is what fixes
  `--r-surface: 14px`, since `--radius` becomes its alias.

`--r-inner` is unconstrained — nothing outside `.app` uses it — and takes
`6px`. `.btn-secondary`, `.nav-btn`, `.auth-card` and every dashboard-local
class stay on their own side of the boundary, so converting them costs
nothing outside.

Where a control visibly nests inside a card, the inner radius follows
`outer − padding`; this only applies where the nesting is actually visible,
not as a blanket rule.

### Pilot scope: the dashboard

The pilot converts the dashboard's own CSS sections in `index.css` — by
section marker: *Readiness Score* (996), *Stress Days Card* (1019), *Early
Warning* (1046), *Geomagnetic storm banner* (1062), *Context Journal* (1175),
*streak stat cards* (2075), *notification bell* (2140), *activity calendar*
(2237), *empty state* (2286) — plus the coach-focus rules, which live outside
those markers (`index.css:1369-1377`), and the shared surfaces the dashboard
is seen through: `.app`, `.topbar`, `.nav-btn`, `.metric-card`,
`.btn-primary`, `.btn-secondary`, and the light-theme card block (1987).

Within that scope: replace hard-coded hex values with tokens, replace literal
`border-radius` values with the three radius tokens, and switch
color-named tokens to role names. Carve-out: `.geostorm-banner`/`.geostorm-badge`
per-level colors (`.minor`/`.strong`/`.extreme`, `index.css:1143-1184`) stay
as literals — Kp geomagnetic storm severity is a published scale, not app
state, so its colors do not belong on the app's own palette tokens.

One pre-existing bug falls inside this scope and is fixed while we are in
those rules: `--accent-border` is referenced at `index.css:2097` and `:2149`
(the streak and bell trigger hover states) but is **defined nowhere**, so
`border-color` computes to `currentColor` instead of an accent tint. It
becomes `color-mix(in srgb, var(--accent) 45%, var(--border))`.

Shared rules (`.btn-primary`, `.btn-secondary`, `.metric-card`) are edited once and
affect every screen. That is intended — those are exactly the surfaces that
must not diverge — and it is safe because the `:root`-default mechanism keeps
the landing and auth screen on their current values.

## Verification

- **Demo mode** (`VITE_DEMO=1`, Node 24) renders the dashboard on fixtures
  without Supabase. Screenshots before/after, in both themes.
- **The landing must be pixel-identical.** Screenshot before/after and
  compare; this is the primary regression check for the token mechanism.
- **The auth screen** likewise unchanged.
- `npm test`, `npm run lint` (`--max-warnings 0`), `npm run build` on Node 24.
- Manual check of the two contrast-critical spots the tables above call out:
  primary buttons in both themes, and accent-colored text in light theme.

No test asserts on colors or radii today, so no test changes are expected.
If any snapshot-style assertion turns out to cover styling, it is updated
deliberately and noted in the PR.

## Rollout

The pilot ships as a PR to `main` (branch-protected). After it is reviewed
and the dashboard is judged good, a follow-up pass takes the remaining
screens: the other CSS sections, the residual hard-coded colors, and the
remaining radius declarations. The `:root` default block is deleted — and
the landing brought onto the new palette — only as a separate, explicitly
requested step.

## Deferred

**Emoji → SVG icon pack.** ~120 emoji across ~40 files were to be replaced
with Phosphor icons behind a semantic registry (`src/lib/icons.tsx`), so that
`☕` and friends stay shared tokens rather than literals. Deferred by request
on 2026-07-30, before any code was written.

The consequence should be expected rather than discovered: system emoji are
saturated and glossy, and against a muted graphite-and-teal palette (brass at
the time this note was written, graphite now — see the "Updated" line at the
top) they will stand out *more* than they do against today's bright default
palette. The
dashboard after this pilot is a good palette with emoji on top of it. The
icon pass remains the obvious next step, and its hardest part is already
mapped — some emoji are baked into i18n keys and data (`QuickLog.tsx:9-18`,
`lib/translations/dashboard.ts:18-27`) and cannot be removed without
separating the icon from the label.
