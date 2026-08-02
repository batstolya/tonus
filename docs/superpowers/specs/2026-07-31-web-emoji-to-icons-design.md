# Emoji → Phosphor icons, piloted on the dashboard

**Date:** 2026-07-31
**Status:** Design approved, pending spec review

## Problem

The app carries 311 emoji occurrences across ~40 files, used as interface
icons: `<div className="sd-icon">😓</div>`, `icon="🔥"`, `🎯 {t('Фокус
недели')}`. They are inconsistent in size and weight, they cannot take a
colour from the design tokens, they render differently on every platform, and
several of them carry state in colour alone (`🟢` / `⚪`, `🔴`).

This became more visible, not less, after
`2026-07-30-web-visual-refresh-design.md` landed: system emoji are saturated
and glossy, and against the muted brass-and-teal palette they now read as
foreign. That spec predicted this and recorded the icon work as deferred.

## Goals

1. A semantic icon registry that keeps the property emoji had — one symbol
   means the same thing everywhere — while making icons take their colour
   from the role tokens.
2. Phosphor **duotone** as the app's icon voice.
3. A build flag that restores the previous emoji rendering without reverting
   code, so the new look can be abandoned cheaply if it is not liked.
4. All of it proven on the dashboard before any rollout.

## Non-goals

- **The landing page and `TelegramDemo` keep their emoji.** There, emoji are
  not interface affordances — they depict the content of real Telegram
  messages, which do contain emoji. Replacing them with SVG would misrepresent
  the product. This covers the 51 occurrences in `lib/translations/onboarding.ts`
  and 15 in `lib/translations/landing.ts`.
- **Emoji baked into i18n keys stay** (`'☕ Кофе': { uk: '☕ Кава' }` and
  friends, ~60 of them). They serve QuickLog, concerns and chart events —
  other screens, and a separate mechanism. Rollout work.
- **Server-emitted emoji are out of reach.** Guard alerts arrive as HTML
  strings shaped `🔴 <b>Заголовок</b>…`; the client already strips them at
  `lib/notifications.ts:66`. Nothing in this spec changes that.
- **`✓` and `✕` stay as they are.** They are typographic glyphs inside button
  text, not emoji. Swapping them for inline SVG is work with no visual payoff.
- No other screens, no palette or radius changes, no copy changes.

## Design

### The registry

`src/lib/icons.tsx` owns the mapping and the rendering:

```tsx
export const ICONS = {
  streak:   { icon: Fire,          emoji: '🔥' },
  weekly:   { icon: Lightning,     emoji: '⚡' },
  focus:    { icon: Target,        emoji: '🎯' },
  …
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 18, title }: IconProps)
```

Emoji currently act as shared semantic tokens — ☕ means coffee on five
screens — and the registry preserves that: one place to change what a concept
looks like. It also gives tests a stable `name` to assert instead of a
symbol, and it confines the `@phosphor-icons/react` import to a single file.
That last point is practical: importing from the package's root barrel makes
Vite pre-bundle thousands of modules in dev, and if that proves painful the
switch to `dist/csr/*` paths is one file's edit.

`weight="duotone"` is the component's default — outline plus a translucent
fill of the same colour, so the icon gains weight without a second colour and
still follows `currentColor`. That is what makes icons inherit `--ok`,
`--warn`, `--bad` and `--accent-text` from the palette work: status now
travels on two channels, shape and colour, instead of colour alone.

### The revert flag

Each registry entry keeps the emoji it replaces, and the component chooses:

```tsx
const USE_ICONS = import.meta.env.VITE_ICONS !== '0'
```

`VITE_ICONS=0` renders `<span aria-hidden>{emoji}</span>` — the previous
appearance, from the same call sites, with no code revert. Default is icons
on; flipping it on Vercel is an environment variable and a redeploy.

Two honest limits. It is a **build** flag, not a runtime toggle: there is no
in-app switch, and flipping it requires a deploy. And turning icons off does
not shrink the bundle — the registry references the Phosphor components
eagerly, so they are bundled either way.

A useful side effect: after this change every emoji the pilot touched lives
in one file instead of being scattered across eight.

### Mapping

Direct substitutions: 😓 `SmileyNervous`, 😌 `SmileyMeh`, ⚠ `Warning`,
🎯 `Target`, 🔥 `Fire`, ⚡ `Lightning`, 📅 `CalendarBlank`, ✅ `CheckCircle`,
❄️ `Snowflake`, ✦ `Sparkle`, 📡 `Broadcast`, 🫀 `Heartbeat`, 👀 `Eye`,
🚶 `PersonSimpleWalk`, 🏃 `PersonSimpleRun`, 🔄 `ArrowsClockwise`,
👌 `ThumbsUp`.

Three sites need a decision rather than a substitution:

- **The coach-focus week dots** (`Dashboard.tsx:253`) become `CheckCircle` /
  `Circle` rather than a coloured dot. A tick inside a circle reads as "done"
  without relying on colour, which `🟢` never did.
- **Emoji inside sentences** — `` `🚶 ${steps} / …` `` at
  `NotificationBell.tsx:109` and `StreakMenu.tsx:104` — need the string
  broken into a JSX fragment. These are the only two places in the pilot where
  markup structure changes rather than a single node.
- **Prop-carried emoji** — `EmptyState icon="🔥"` (`Dashboard.tsx:418`) and
  the notification builders' `icon: '🔥'` / `icon: '📡'` — take an `IconName`
  instead of a string.

### Accessibility

`Icon` is `aria-hidden` by default: an icon beside its own label is noise in a
screen reader. Where the icon is the only carrier of meaning — the bell's
level marker, the week dots — `title` is required. Today `aria-hidden` is
applied inconsistently across the emoji; the registry makes the correct
behaviour the default.

### Pilot scope

28 sites across `components/dashboard/*` (`Dashboard`, `NotificationBell`,
`StreakMenu`, `StreakStats`, `ActivityCalendar`, `AiAnalysisBlock`,
`WorkoutPlanCard`) and `components/ui/{EmptyState,DataGaps}`.

## Verification

- **A registry test** renders every `ICONS` entry and asserts an `<svg>`
  results — a mistyped Phosphor export otherwise fails only at runtime.
- **A flag test** asserts the same entries render their emoji when
  `VITE_ICONS=0`, so the escape hatch is known to work rather than assumed.
- **A guard test** reads the pilot's files and fails if an emoji reappears in
  them. It defines "done" and prevents drift. `src/lib/icons.tsx` is exempt —
  that is where the emoji deliberately live now.
- `EmptyState.test.tsx` and `NotificationBell.test.tsx` assert on emoji today
  and are updated deliberately, noted in the PR.
- Bundle size measured before and after. If the barrel import moves it
  materially, the registry switches to direct paths.
- `npm test`, `npm run lint` and `npm run build` on Node 24; dashboard
  screenshotted in both themes, and once more with `VITE_ICONS=0` to prove the
  revert path renders the old look.

## Rollout

Ships as its own PR, after `#166` (palette and radius) merges. The remaining
screens, and the i18n keys with their icon/label separation, follow in a
later pass.
