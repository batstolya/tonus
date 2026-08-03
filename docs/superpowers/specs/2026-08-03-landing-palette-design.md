# One palette for the landing and the app

**Status:** approved 2026-08-03. Colour ships first; icons follow separately.

## Problem

The product looked like two products. The app moved to a pine-green palette
while the landing and the auth screen kept a legacy blue one, because they
render outside `.app` and `:root` still held the old values. `index.css` even
carried the note: "when the landing is brought onto the new palette, the `.app`
blocks move up into `:root` and these defaults are deleted."

## Decisions

**Colour:** the landing takes the app's palette. The blue accent (`#4a6fff`
light, `#6c8fff` dark) becomes pine (`#24443B` / `#D3E6DD`).

**Shape:** radii stay as the landing has them — 14px surfaces, 10px controls —
rather than adopting the app's 4px surfaces and fully round controls. This may
change later, so the structure is built to make that a one-block deletion.

**The violet goes.** `#9f7cff` was the landing's own accent from before the
product had one. It survived in the "AI" gradient and a background glow; with a
pine accent the gradient ran green to purple. Both now stay inside the pine
family.

## Structure

| Scope | Holds |
|---|---|
| `:root` | the whole palette, dark values (the default) + landing radii |
| `[data-theme="light"]` | the whole palette, light values |
| `.app` | radii only — 4px surfaces, round controls |

Colour is defined once. `.app` differs from the landing in shape and nothing
else, so switching the landing onto the app's shapes later means deleting the
radius block in `:root`, not editing files across the tree.

`[data-theme="light"] .app` disappears entirely: with colour living one level
up, it had nothing left to say.

### Chart tokens move with it

`:root` used to carry the *light* chart steps even though `:root` is the dark
default, so the landing's demo chart drew light-theme steps on a dark page —
`--chart-1` at 3.49:1 against the landing surface where the app's own dark step
gives 5.68:1. Dark steps now live in `:root`, light steps in
`[data-theme="light"]`, and both surfaces get the right ones by construction.

## Landing colours that were spelled out

- **Label on an accent fill** was `#fff` in three places. Safe against a blue
  accent, 1.30:1 against pale mint. Now `--on-accent`: 14.11:1 dark, 10.69:1
  light.
- **Feature tiles** rotated four unrelated pastels. They still rotate, but the
  tints are mixed from `--chart-1..4`, so they follow the theme and belong to
  the same palette as everything else.
- **Glows, chat bubbles, phone mock-up** take `--ok`, `--surface`, `--surface2`.
- `var(--green, #5bc896)` fallbacks dropped: `--green` is always defined, so the
  literal never fired.

Left alone: the `#000` in a mask gradient (an alpha stop, not a colour), the
landing's deliberate pure-white light background, and Google's brand colours on
the sign-in button.

## Not in this change

The 32 distinct emoji across the landing and auth screen, and the 18 of them
with no icon-registry entry. That is a separate pass — in particular
`TelegramDemo.tsx` holds 25 emoji **inside translation keys**, the same trap the
quick log had, where a naive replacement silently drops uk/en back to Russian.

## Verification

- Resolved tokens read out of the running app for both surfaces in both themes:
  the app's values must be unchanged, the landing's colours must match them, and
  the landing's radii must stay 14/10/10/6.
- The dark landing CTA must read as dark ink on mint, not white on mint.
- Both themes looked at in the browser.
