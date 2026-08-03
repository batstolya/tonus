# Dismissable weekly-focus card

**Status:** approved 2026-08-03

## Problem

The weekly-focus card sits at the top of the dashboard every day. It is useful
in the morning, when deciding how to spend the day, and in the way afterwards —
it pushes readiness, the quick log and every metric card down the page.

Removing it is not the answer: the user wants it in the morning. The user wants
to be able to put it away once they have read it, and to have it come back on
its own the next day.

## Behaviour

- The card's header carries a **hide** button.
- Hiding removes the card from the dashboard and shows a compact **badge** in
  the topbar, beside the data-gaps and geo-storm badges: the focus icon plus
  the progress count (`2/5`).
- Clicking the badge restores the card immediately.
- Left alone, the card returns by itself at **05:00 local the next morning**.
  Hiding at 23:40 keeps it away until morning rather than for twenty minutes;
  work past midnight still counts as the same evening.
- The dismissal is stored **per device** in `localStorage`, matching how
  dismissed alerts already work in the notification bell. Hiding on a laptop
  does not hide on a phone, which is acceptable for a layout preference and
  avoids a migration, a profile column and a write per dismissal.

### Deliberately not built

A popover on the badge. The need is "put it out of the way", not "read it in
miniature". The progress is on the badge already, and one click brings the card
back.

## Structure

The card and the badge are **mutually exclusive** — exactly one of them is on
screen at any time. So each loads its own focus data and nothing has to be
lifted into a shared parent. The only shared state is the flag itself.

| Module | Responsibility |
|---|---|
| `lib/focusVisibility.ts` | Pure: when the next morning is, whether the card is hidden now. No DOM, tested in the node project. |
| `hooks/useFocusHidden.ts` | Reads and writes the flag; keeps the two on-screen consumers in sync. |
| `components/dashboard/CoachFocusCard.tsx` | The card, moved out of `Dashboard.tsx`, plus the hide button. |
| `components/dashboard/FocusBadge.tsx` | The topbar badge; renders only while hidden. |

`CoachFocusCard` currently lives inside `Dashboard.tsx`. It moves to its own
file: the card and the badge are two halves of one behaviour, and leaving one
buried in a large unrelated file would hide that. This is a move, not a
rewrite.

### Storage

Key `tonus_focus_hidden_until`, value an ISO timestamp. The card is hidden
while `now < stored`. An absent, unparseable or past value means visible —
the failure mode is showing the card, never losing it.

## Testing

Pure logic, in the node project:

- `nextMorning` at boundaries: 04:00 → 05:00 the same day; 05:00 and 06:00 →
  05:00 tomorrow; 23:40 → 05:00 tomorrow.
- `isHidden`: before the stored time, after it, exactly at it.
- Malformed and absent stored values resolve to visible.

Component behaviour, in jsdom:

- The hide button removes the card.
- The badge renders only while hidden and restores the card when clicked.
