# Icon rollout, pass 1: the remaining screens

**Date:** 2026-08-02
**Status:** Design approved, pending spec review

## Problem

`2026-07-31-web-emoji-to-icons-design.md` replaced the dashboard's emoji with
Phosphor duotone icons behind a semantic registry, and shipped. It deliberately
stopped at the dashboard. The rest of the app still uses emoji as interface
icons: **111 occurrences across 30 component files**, on every screen a user
visits after the dashboard.

The result today is an app that changes vocabulary as you navigate — icons on
the dashboard, emoji everywhere else.

## Scope of this pass

The rollout splits in two, because the two halves carry different risk:

- **This pass — inline JSX emoji in components.** Mechanical, identical to the
  three conversion passes already shipped. 110 sites.
- **A later pass — emoji baked into i18n keys.** 21 keys in the translation
  dictionaries, three different mechanisms, and a failure mode nothing
  currently guards. Recorded at the end of this document, not designed here.

### What is in

110 replacements across 30 files, grouped by feature area:

| Area | Sites |
| --- | --- |
| Research and experiments | 22 |
| Insights | 20 |
| Settings (incl. `DoctorReport`, upload, onboarding guide) | 17 |
| Supplements and treatment | 13 |
| Intake and nutrition | 19 |
| Concerns | 6 |
| Goals | 4 |
| Activity, heart rate, stress map | 9 |

The batching below regroups these areas into five tasks of comparable size; the
totals are the same 110.

`DoctorReport.tsx` is included, against the precedent set by the palette spec
which excluded it as a printable document. It carries a single `⚠`, that
exclusion was about styling rather than iconography, and SVG prints correctly.

### What is out

- **`✓` (U+2713) and `✕` (U+2715)** — 29 occurrences. Typographic glyphs inside
  button text, not emoji. `Dashboard.tsx` and `ActivityCalendar.tsx` appear in
  the file survey only because of these, and are therefore already complete.
- **`LoadError.tsx`'s `⚠️`** — it sits *inside* a string passed to `t()`, which
  makes it an i18n key, not a JSX node. It belongs to the later pass.
- **The landing page and `TelegramDemo`** — emoji there depict the content of
  real Telegram messages. Verified during this survey: every prose emoji inside
  a `t()` call in the whole component tree belongs to `TelegramDemo`, except the
  one `LoadError` case above.
- **`lib/chartEvents.ts` and the concern severity scale** — data-layer colour and
  marker palettes, still on Tailwind defaults. A separate decision, already
  raised with the project owner and not taken.

## Design

### The registry grows fourfold

From 22 entries to roughly 80. The component tree uses **73 distinct emoji**, and
40 of them appear exactly once.

The registry stays a single file. Its value is that one table shows every
symbol the product uses; splitting it by domain would trade that away for
nothing. It gains comment-grouped sections — metrics, actions, states,
sections — so an 80-row table stays navigable.

Each conversion task adds the entries it needs rather than the whole set being
guessed upfront. Task diffs stay self-contained, and no task inherits a pile of
unused entries from an earlier one.

**Accepted cost:** the independently written `expectedComponentName` table in
`icons.test.tsx` doubles alongside the registry. It is the only assertion that
catches a name↔component transposition without being circular, so it earns its
place, but extending it is manual work.

### The guard is already automatic

`noEmoji.test.ts` derives its list of guarded files by scanning the component
tree for imports of `lib/icons`, then asserts the derived set equals its literal
list. Adding an icon to a file therefore pulls that file under the guard whether
or not anyone remembers to register it — forgetting fails the test rather than
silently skipping the file.

That property is what makes a 30-file sweep safe to do in batches: no batch can
quietly leave emoji behind in a file it touched.

### Batching

Five conversion tasks, drawn along feature boundaries so each can be reviewed
and reverted on its own:

1. Research and experiments, goals — 26 sites
2. Insights, activity, heart rate, stress map — 29 sites
3. Supplements and treatment, concerns — 19 sites
4. Intake and nutrition — 19 sites
5. Settings, upload, onboarding guide — 17 sites

Each task: add its registry entries, convert its sites, extend the expected-name
table, run the guard and the full gate, commit.

## Verification

- The emoji guard covers every touched file automatically.
- The registry test renders every entry and asserts each maps to the component
  the spec assigns it.
- `npm test`, `npm run lint`, `npm run build` on Node 24.
- Screenshots of the converted screens, from a production build opened over
  `file://` — the preview harness spawns its dev server in the session's
  original checkout, so it cannot be trusted to show a branch's own code.
- **One run with `VITE_ICONS=0`**, confirming the escape hatch still restores
  emoji across all 30 files and not just the dashboard. An escape hatch that
  was only ever verified on one screen is not verified.

## The later pass, recorded

21 translation keys carry emoji, in three shapes that need three different
treatments:

- **Noun with an icon** (14 keys — `☕ Кофе`, `🧴 Кожа`, `💊 Лекарства` …). The data
  structures that feed them need an icon field beside the label, and the
  dictionary keys lose their emoji.
- **AI feature labels** (3 keys — `💬 Чат`, `🔍 Анализ данных`, `🔬 OCR анализов`).
  Same shape.
- **Error prefixes** (3 keys — `⚠️ Не удалось загрузить данные…`, plus
  `LoadError.tsx`). Here the emoji should not move to an icon at the same
  position: a severity marker belongs to the component that renders the error,
  not to the message text.

**The risk that pass must design against:** `translate()` falls back to the
Russian source when a key is missing (`lib/translate.ts:32`). Renaming a
dictionary key without updating its call site therefore does not fail — uk and
en users silently see Russian. There is no global completeness guard today, only
per-screen `KEYS` lists in six test files. Across 21 keys and two languages that
is 42 chances to break invisibly, and closing it is that pass's central problem.
