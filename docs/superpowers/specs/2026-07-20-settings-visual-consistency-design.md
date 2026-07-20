# Settings screen: visual consistency pass

**Date:** 2026-07-20
**Status:** Design approved, pending spec review

## Problem

`src/components/settings/**` grew section-by-section over many PRs (see
`docs/superpowers/specs/2026-07-16-...` tech-debt work, PR #43-#59 and later
section extractions). Each section is internally fine, but the screen as a
whole reads as inconsistent: section titles mix SVG icons, inline emoji, and
no icon at all; three near-identical classes exist for the same "small text
link" affordance; a couple of sections borrow an input style from the
Dashboard's quick-log instead of the Settings-local one; and small text
(labels, meta rows, one accent number) is sized anywhere from 11px to 18px
with no consistent scale.

None of this is a functional bug — every control works. The goal is a single
visual language across the screen: one icon treatment, one button/link
system, one input style, one small type scale.

## Goals

1. Every section header in Settings follows one markup pattern: SVG icon +
   title, no emoji-in-text.
2. One class for the small "text link" button inside Settings, replacing
   three overlapping ones.
3. Settings-owned inputs use the Settings input style, not a borrowed one.
4. Small text inside sections (labels, meta rows, the one accent number)
   follows a 4-step size scale instead of ad-hoc px values.

## Non-goals

- No changes to `.btn-primary` / `.btn-secondary` / `.btn-ghost` definitions
  or any other class shared with screens outside Settings — those are used
  by 4-6 other components and restyling them is a separate, riskier change.
- No changes to `DoctorReport.tsx` (`dr-*` classes) — it's a printable report
  document, not a settings section, and is intentionally styled differently.
- No changes to the `ConnectGuide` overlay (device-connection wizard).
- No behavior changes: no new features, no removed sections, no changed
  copy beyond what icon markup requires.
- No introduction of a global CSS custom-property token system for font
  sizes — `index.css` has no such system today (app-wide, out of scope);
  this pass applies fixed literal values consistently within Settings only,
  matching the existing codebase convention.

## Current state (verified)

Confirmed by reading every file in `src/components/settings/` and
`src/components/settings/sections/`, and the `settings-*`/settings-only CSS
rules in `src/index.css` (~line 1140-1170, 1747-1752).

**Section title icons** — `grep -n "<h[1-6]" src/components/settings/**`:

| Section | Current title treatment |
|---|---|
| LanguageSection, TelegramSection (×2), GoogleCalendarSection, CalSyncSection, EnvironmentSection, ImportSection | SVG icon already, some with icon / some plain (Environment/Import have no icon despite using the pattern's `<h3>`) |
| PrivacySettings, AiConsentSection, DeleteAccountSection | Emoji prefix in the text node (🔒, ✨, 🗑) |
| AiBudgetSection, AutoSyncSettings, WorkoutScheduleSettings | No icon |
| DeviceSection | `<h2 className="settings-section-title">` — only section not using `<h3>` |

**Text-link buttons** — three classes doing the same job inside Settings:

- `.link-btn` (`index.css:1014`) — `color: var(--accent)`, 12px, underline.
  Used only in Settings (`CalSyncSection` ×2, `EnvironmentSection` ×2,
  `SettingsScreen` archive-restore). Safe to restyle.
- `.settings-edit-btn` (`index.css:1166`) — identical properties to
  `.link-btn`, used only in `AiBudgetSection`'s "Edit" button. Pure
  duplicate.
- `.btn-ghost` (`index.css:558`) — `color: var(--text-muted)`, 14px,
  underline, `margin-top: 8px`. Used in `PrivacySettings` ("Заблокировать
  сейчас") **and** 6 other screens (`TreatmentTracker`, `SupplementsScreen`,
  `SupplementSchedule`, `AuthScreen`, `GoalsScreen`, `ConcernsScreen`) — the
  class itself is shared and out of scope, but `PrivacySettings` also
  overrides it inline (`style={{ fontSize: 13 }}`), which is the
  Settings-local part we can change.

**Inputs** — `.settings-input` (`index.css:1747`, radius 10px, padding
10px/12px, 14px) is the Settings-native input style. `.log-input`
(`index.css:671`, radius 8px, padding 9px/12px, 13px) belongs to the
Dashboard quick-log widget but is also used by `PrivacySettings` (2 inputs)
and part of `WorkoutScheduleSettings`. `.log-input` itself is out of scope
(shared with Dashboard); only the Settings call sites move to
`.settings-input`.

**Font sizes** in settings-owned CSS, current → target:

| Class | Current | Target tier |
|---|---|---|
| `.settings-section-title`, `.settings-archive-toggle` | 15px/600 | title (unchanged, anchor) |
| `.settings-label`, `.settings-archive-row`, `.settings-budget-row`, `.settings-input`, `.rep-seg-btn` body text | 14px | body (unchanged, anchor) |
| `.settings-source-row` | 13px | meta (unchanged, anchor) |
| `.settings-tokens-row` | 12px | meta → 13px |
| `.settings-archive-caret` | 11px | meta → 13px |
| `.link-btn` (post-merge, see below) | 12px | meta → 13px |
| `.settings-budget-input` | 15px | body → 14px |
| `.settings-budget-val` | 18px/700 | accent → 20px/700 |

`.rep-*` classes (`rep-seg-btn`, `rep-setting`, `rep-seg`, `rep-toggle-row`)
looked shared at first glance (generic name) but are used only by
`LanguageSection`, `TelegramSection`, and `WorkoutScheduleSettings` — fully
Settings-owned despite the name. (Not to be confused with the unrelated
`rem-*` reminder classes used by `Dashboard`/`SupplementsScreen`.)

## Design

### 1. Section header icons

Standardize every section header to:

```tsx
<h3 className="settings-section-title">
  <SectionIcon />
  {t('Title')}
</h3>
```

- `.settings-section-title` gains `display: flex; align-items: center; gap: 8px;` so icon + text align regardless of which section renders it (currently only implicit via existing icon markup in a few sections).
- Icons are inline SVG, 16×16, `stroke="currentColor"`, `strokeWidth="2"`, matching the visual weight already established by `ArchiveBtn`/`LanguageSection`'s icons — no new icon library, just hand-drawn outline SVGs consistent with the existing ones.
- New icons needed for: AI Budget (wallet/coin outline), Import data (upload/tray outline), Auto-sync (refresh/sync outline), Workout schedule (dumbbell/calendar outline), Environment (cloud/leaf outline), Device (watch/phone outline), Export data (download outline).
- Emoji replaced with SVG: Privacy 🔒 → lock outline, AI consent ✨ → sparkle/shield outline, Delete account 🗑 → trash outline.
- `DeviceSection`'s `<h2>` becomes `<h3>` to match every sibling.
- Icon SVGs live inline in each section's `.tsx` file (matching current convention — `ArchiveBtn.tsx` and `LanguageSection.tsx` already inline their SVGs; no shared icon component is introduced, since that would be a reusable-component change and this pass is Settings-only).

### 2. Text-link button consolidation

- Delete `.settings-edit-btn` from `index.css`; `AiBudgetSection`'s "Edit" button uses `className="link-btn"` instead.
- `PrivacySettings`'s "Заблокировать сейчас" button switches from `className="btn-ghost" style={{ fontSize: 13 }}` to `className="link-btn"` (no inline style).
- `.link-btn` becomes the one small-text-link affordance inside Settings. Its definition doesn't move or get renamed (already Settings-only in practice, and small enough that renaming buys nothing).
- `.btn-ghost` itself is untouched — no other Settings usage remains after this change, so there's nothing left to reconcile.

### 3. Input consolidation

- `PrivacySettings`'s two `<input className="log-input" ...>` become `<input className="settings-input" ...>` (drop the `style={{ width: 140 }}` inline override in favor of natural full-width sizing consistent with every other Settings input, unless that breaks the inline PIN-entry layout — if it does, keep an explicit width but drop the borrowed class).
- `WorkoutScheduleSettings`'s two `.log-input` usages (time/day pickers) move to `.settings-input` the same way.

### 4. Font-size scale

Apply the "current → target" table above directly to the named CSS rules in
`index.css`. No new custom properties; each rule keeps its existing
declaration, just with the px value corrected. `font-weight` values are
untouched — this pass is about size only, not weight or color.

## Testing

This is a pure CSS/markup consistency pass with no logic changes, so:

- `npm run lint` (0 warnings, per repo convention) and `npm run build` must stay green.
- No new unit tests needed — existing component tests (`SettingsScreen.characterization.test.tsx`, per-section `.test.tsx` files) assert behavior, not exact class names/px values, and should keep passing unchanged. If any test asserts a removed class name (e.g. `settings-edit-btn`) literally, update it to the new one.
- Manual verification: open Settings in demo mode (`VITE_DEMO=1` or the landing "Посмотреть демо" button), visually confirm every section header now has a consistent icon, every small text-link looks the same, and no layout regressions in Privacy/Workout schedule input rows. Check both light and dark theme (`[data-theme="light"]` override block exists around `index.css:1999`).

## Rollout

Frontend-only change (`src/` + `index.css`). No edge functions, no
migrations, no secrets. Ships through the normal `main` → CI → Vercel deploy
hook path (see `CLAUDE.md` § Деплой) — no separate edge-function deploy
step.
