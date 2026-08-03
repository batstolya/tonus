# Icon rollout pass 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the remaining 110 inline emoji across 26 component files with Phosphor duotone icons from the existing registry, so the app stops changing icon vocabulary as you navigate.

**Architecture:** No new mechanism. `apps/web/src/lib/icons.tsx` already maps a semantic name to a Phosphor component plus the emoji it replaces, and `<Icon>` renders one or the other depending on `VITE_ICONS`. Each task adds the registry entries its files need, converts its files, and extends the test's independent name table. The emoji guard picks up touched files automatically.

**Tech Stack:** React 19, TypeScript, Vite, vitest (jsdom for components, node for source-text tests), `@phosphor-icons/react` 2.1.10.

## Global Constraints

- Node 24 for every npm command: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- The root `npm test` is a three-part chain (`npm run -w tonus-web test && npm run -w @tonus/shared test && vitest run`). One segment is not the suite — report per-segment numbers.
- Lint runs with `--max-warnings 0`.
- Everything committed is in English: commit messages, comments, identifiers. UI strings stay Russian in source and keep flowing through `t()`.
- `✓` (U+2713) and `✕` (U+2715) are typographic glyphs, not emoji. They stay everywhere, untouched.
- Do NOT edit `components/landing/**`, `components/auth/**`, `apps/mobile/**`, or `lib/translations/*` — the landing and `TelegramDemo` keep their emoji on purpose, and translation keys belong to a later pass.
- Do NOT touch `components/ui/LoadError.tsx`. Its `⚠️` sits inside a string passed to `t()`, making it an i18n key rather than a JSX node.
- Icons render at `weight="duotone"` (the `Icon` default). Pick `size` to match the surrounding text: 14 inside 11–13px text, 16–18 inside body text, 24+ for a standalone card icon.
- Work on branch `spec/web-icons-rollout`. Do not create branches, do not push.
- End every commit message with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## The conversion, once

Every site follows one of three shapes already established on the dashboard:

```tsx
// 1. standalone node
<span className="x-icon">☕</span>        →  <span className="x-icon"><Icon name="coffee" size={16} /></span>

// 2. prop carrying an emoji
icon="🏆"                                 →  icon={<Icon name="trophy" size={32} />}

// 3. emoji inside a template string  →  the string becomes a JSX fragment
`${t('Сегодня')}: ☕ ${n}`                →  <>{t('Сегодня')}: <Icon name="coffee" size={14} /> {n}</>
```

Where a wrapping element carries `aria-hidden` for the emoji, drop it — `Icon`
sets it on the rendered element. Where the icon is the *only* carrier of meaning
(a status dot, a level marker), pass `title` so it gets `role="img"`, an
accessible name and a tooltip.

## Registry entries

All Phosphor names below were verified present in `@phosphor-icons/react@2.1.10`
before this plan was written. `Lungs` does **not** exist in this version; `Wind`
is used for breathing instead.

Add entries in the shape the file already uses, `name: { icon: Component, emoji: '<the emoji>' }`,
and add the matching row to `expectedComponentName` in `icons.test.tsx` using the
`${Name}Icon` displayName convention.

**Copy the emoji literal from the source file you are converting.** Some emoji
appear with and without a variation selector (`🏋️` vs `🏋`), and the guard
compares exact strings.

| Emoji | Registry name | Phosphor |
| --- | --- | --- |
| 🟢 🟡 🔴 🔵 | `dotOk` `dotWarn` `dotBad` `dotInfo` | `Circle` |
| ☕ | `coffee` | `Coffee` |
| 🍷 | `alcohol` | `Wine` |
| 🍽 | `meal` | `ForkKnife` |
| 💧 | `water` | `Drop` |
| 💊 | `meds` | `Pill` |
| 🏋 | `workout` | `Barbell` |
| 🤒 | `illness` | `Virus` |
| 😰 | `stress` | `SmileyNervous` |
| 🧳 | `travel` | `Suitcase` |
| 📝 | `note` | `NotePencil` |
| ✨ | `magic` | `Sparkle` |
| 🏆 | `trophy` | `Trophy` |
| 💡 | `idea` | `Lightbulb` |
| 🔒 | `locked` | `Lock` |
| 📷 📸 | `photo` `snapshot` | `Camera` `ImageSquare` |
| ✏ ✎ | `edit` `editSimple` | `Pencil` `PencilSimple` |
| 🔍 | `search` | `MagnifyingGlass` |
| 🔬 | `microscope` | `Microscope` |
| 🧪 | `lab` | `TestTube` |
| 📊 | `chart` | `ChartBar` |
| 📈 📉 | `trendUp` `trendDown` | `TrendUp` `TrendDown` |
| 🔗 | `link` | `Link` |
| 🧭 | `compass` | `Compass` |
| 🧲 | `magnet` | `Magnet` |
| ☀ | `sun` | `Sun` |
| 🌙 | `moon` | `Moon` |
| 🌡 | `temperature` | `Thermometer` |
| 🌦 | `weather` | `CloudSun` |
| 🌍 | `world` | `Globe` |
| 👟 | `shoes` | `Sneaker` |
| ❤ | `heart` | `Heart` |
| 💓 | `pulse` | `Heartbeat` |
| 🫁 | `breathing` | `Wind` |
| 💤 😴 | `sleepDebt` `sleeping` | `Bed` |
| 🕐 | `clock` | `Clock` |
| 📆 🗓 | `calendarRange` `schedule` | `CalendarDots` `CalendarBlank` |
| 💬 | `chat` | `ChatCircle` |
| 📍 | `location` | `MapPin` |
| 📦 | `archive` | `Package` |
| 🖨 | `print` | `Printer` |
| 📥 | `import` | `DownloadSimple` |

Already in the registry, reuse rather than re-add: `⚠` → `warning`, `🔥` → `streak`,
`📅` → `calendar`, `✅` → `planDone`, `🫀` → `alertHigh`, `🏃` → `exercise`.

**Two names must never share a Phosphor component unless colour distinguishes
them.** Task 1 shipped `alertHigh`/`pulse` both on `Heartbeat` and
`sleepDebt`/`sleeping` both on `Bed`, so two pairs of metrics in
`ExperimentCard.tsx` render identically where 🫀/💓 and 💤/😴 used to differ. The
`dot*` family is the deliberate exception — those share `Circle` and are told
apart by an explicit colour at the call site.

Before adding an entry, check whether its component is already taken. Verified
alternatives for the known collisions: `Pulse`, `Waveform`, `HeartHalf`,
`MoonStars`, `ImageSquare`, `Image`, `CameraPlus`, `Aperture`.

---

### Task 1: Research, experiments and goals

**Files:**
- Modify: `apps/web/src/components/research/ExperimentCard.tsx` — ✨×2 ❤ 🌙 👟 💓 💤 📊 🔥 😴 🫀 🫁
- Modify: `apps/web/src/components/research/ExperimentsScreen.tsx` — ✨×3 🧪
- Modify: `apps/web/src/components/research/ResearchScreen.tsx` — ⚠ 🌍 🔍 🔴 🟡 🟢
- Modify: `apps/web/src/components/goals/GoalsScreen.tsx` — ✨×2 🏆 💡
- Modify: `apps/web/src/lib/icons.tsx`, `apps/web/src/lib/icons.test.tsx`

**Interfaces:**
- Consumes: `Icon`, `IconName` from `../../lib/icons`.
- Produces: registry entries `magic`, `heart`, `moon`, `shoes`, `pulse`, `sleepDebt`, `chart`, `sleeping`, `breathing`, `lab`, `world`, `search`, `dotBad`, `dotWarn`, `dotOk`, `trophy`, `idea`.

- [ ] **Step 1: Add this task's registry entries**

In `apps/web/src/lib/icons.tsx`, add to `ICONS` (imports at the top of the file, alphabetically with the existing ones):

```tsx
  magic:      { icon: Sparkle,        emoji: '✨' },
  heart:      { icon: Heart,          emoji: '❤' },
  moon:       { icon: Moon,           emoji: '🌙' },
  shoes:      { icon: Sneaker,        emoji: '👟' },
  pulse:      { icon: Heartbeat,      emoji: '💓' },
  sleepDebt:  { icon: Bed,            emoji: '💤' },
  sleeping:   { icon: Bed,            emoji: '😴' },
  chart:      { icon: ChartBar,       emoji: '📊' },
  breathing:  { icon: Wind,           emoji: '🫁' },
  lab:        { icon: TestTube,       emoji: '🧪' },
  world:      { icon: Globe,          emoji: '🌍' },
  search:     { icon: MagnifyingGlass, emoji: '🔍' },
  dotBad:     { icon: Circle,         emoji: '🔴' },
  dotWarn:    { icon: Circle,         emoji: '🟡' },
  dotOk:      { icon: Circle,         emoji: '🟢' },
  trophy:     { icon: Trophy,         emoji: '🏆' },
  idea:       { icon: Lightbulb,      emoji: '💡' },
```

Add the matching rows to `expectedComponentName` in `icons.test.tsx` (`magic: 'SparkleIcon'`, `heart: 'HeartIcon'`, and so on for all seventeen).

- [ ] **Step 2: Run the registry test to verify it fails**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: FAIL — the expected-name table and `ICONS` disagree until both are complete, or a component import is missing.

- [ ] **Step 3: Run the registry test to verify it passes**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: PASS. Every entry renders an `<svg>` and matches its expected component.

- [ ] **Step 4: Convert the four component files**

Apply the three shapes from "The conversion, once". Two real examples from these files:

```tsx
// ResearchScreen.tsx — a legend dot, the only carrier of its meaning
<span>🔴</span>   →   <span><Icon name="dotBad" size={12} title={t('Мало данных')} /></span>

// ExperimentCard.tsx — a metric label
<span className="expc-metric">🌙 {t('Сон')}</span>
  →  <span className="expc-metric"><Icon name="moon" size={14} /> {t('Сон')}</span>
```

The `🔴 🟡 🟢` dots in `ResearchScreen.tsx` are confidence levels and carry meaning by colour alone today — each takes a `title` through `t()`, with `uk`/`en` entries added to the translation file that already holds that screen's strings.

- [ ] **Step 5: Run the guard**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: PASS. The four files enter the derived list automatically because they now import `lib/icons`; if the derived and literal lists disagree, add the paths to `PILOT_FILES`.

- [ ] **Step 6: Run the full gate and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

```bash
git add apps/web/src/lib/icons.tsx apps/web/src/lib/icons.test.tsx apps/web/src/lib/noEmoji.test.ts apps/web/src/components/research apps/web/src/components/goals apps/web/src/lib/translations
git commit -m "feat(web): move research, experiments and goals onto the icon registry"
```

---

### Task 2: Insights, activity, heart rate and stress map

**Files:**
- Modify: `apps/web/src/components/insights/CorrelationsBlock.tsx` — ☀ ☕ 🌙 🌡 🌦 🍷 🏃 👟 📈 📉 🔗×2 🧭 🧲
- Modify: `apps/web/src/components/insights/InsightsScreen.tsx` — ⚠ 🏆 💡 📅 📆 🔥
- Modify: `apps/web/src/components/activity/ActivityScreen.tsx` — 🔴 🔵 🟡 🟢
- Modify: `apps/web/src/components/heart-rate/HeartRateScreen.tsx` — ☕ 🍷
- Modify: `apps/web/src/components/stress-map/StressMapScreen.tsx` — 🏃 📊 🗓
- Modify: `apps/web/src/lib/icons.tsx`, `apps/web/src/lib/icons.test.tsx`

**Interfaces:**
- Consumes: `Icon` from `../../lib/icons`; entries `magic`, `moon`, `shoes`, `chart`, `search`, `dotBad`, `dotWarn`, `dotOk`, `trophy`, `idea` already exist from Task 1.
- Produces: entries `sun`, `coffee`, `alcohol`, `temperature`, `weather`, `link`, `compass`, `magnet`, `trendUp`, `trendDown`, `dotInfo`, `calendarRange`, `schedule`.

- [ ] **Step 1: Add this task's registry entries**

```tsx
  sun:           { icon: Sun,            emoji: '☀' },
  coffee:        { icon: Coffee,         emoji: '☕' },
  alcohol:       { icon: Wine,           emoji: '🍷' },
  temperature:   { icon: Thermometer,    emoji: '🌡' },
  weather:       { icon: CloudSun,       emoji: '🌦' },
  link:          { icon: Link,           emoji: '🔗' },
  compass:       { icon: Compass,        emoji: '🧭' },
  magnet:        { icon: Magnet,         emoji: '🧲' },
  trendUp:       { icon: TrendUp,        emoji: '📈' },
  trendDown:     { icon: TrendDown,      emoji: '📉' },
  dotInfo:       { icon: Circle,         emoji: '🔵' },
  calendarRange: { icon: CalendarDots,   emoji: '📆' },
  schedule:      { icon: CalendarBlank,  emoji: '🗓' },
```

Add the thirteen matching rows to `expectedComponentName`.

- [ ] **Step 2: Run the registry test to verify it fails**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: FAIL until entries and expected names are both present.

- [ ] **Step 3: Run the registry test to verify it passes**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: PASS.

- [ ] **Step 4: Convert the five component files**

`CorrelationsBlock.tsx` carries the densest set — fourteen sites, mostly factor labels beside short text. Example:

```tsx
{ key: 'weather', emoji: '🌦', label: 'Погода' }
  →  { key: 'weather', icon: 'weather' as IconName, label: 'Погода' }
```

If a file holds emoji in a local data array like that, change the field to an
`IconName` and render `<Icon name={row.icon} size={14} />` at the usage site
rather than leaving a string that only looks like an icon.

`ActivityScreen.tsx`'s four dots are a legend — each takes a `title` through `t()`.

- [ ] **Step 5: Run the guard**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: PASS, with the five new files in the derived list.

- [ ] **Step 6: Run the full gate and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

```bash
git add apps/web/src/lib apps/web/src/components/insights apps/web/src/components/activity apps/web/src/components/heart-rate apps/web/src/components/stress-map
git commit -m "feat(web): move insights and the metric screens onto the icon registry"
```

---

### Task 3: Supplements, treatment and concerns

**Files:**
- Modify: `apps/web/src/components/supplements/AdherenceBlock.tsx` — 📈 🔥
- Modify: `apps/web/src/components/supplements/SupplementSchedule.tsx` — ⚠ ✨ 🕐×2
- Modify: `apps/web/src/components/supplements/SupplementsScreen.tsx` — ⚠×3 🔬 🕐
- Modify: `apps/web/src/components/supplements/TreatmentTracker.tsx` — 🔬×2
- Modify: `apps/web/src/components/concerns/ConcernsScreen.tsx` — 📷 🔒×5
- Modify: `apps/web/src/lib/icons.tsx`, `apps/web/src/lib/icons.test.tsx`

**Interfaces:**
- Consumes: `Icon` from `../../lib/icons`; `warning`, `streak`, `trendUp`, `magic` already exist.
- Produces: entries `clock`, `microscope`, `photo`, `locked`.

- [ ] **Step 1: Add this task's registry entries**

```tsx
  clock:      { icon: Clock,      emoji: '🕐' },
  microscope: { icon: Microscope, emoji: '🔬' },
  photo:      { icon: Camera,     emoji: '📷' },
  locked:     { icon: Lock,       emoji: '🔒' },
```

Add the four matching rows to `expectedComponentName`.

- [ ] **Step 2: Run the registry test to verify it fails**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: FAIL.

- [ ] **Step 3: Run the registry test to verify it passes**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: PASS.

- [ ] **Step 4: Convert the five component files**

`ConcernsScreen.tsx`'s five `🔒` mark private entries hidden behind a PIN — they carry meaning alone, so each takes `title` through `t()`. Example:

```tsx
<span>🔒</span>  →  <span><Icon name="locked" size={14} title={t('Скрытая проблема')} /></span>
```

- [ ] **Step 5: Run the guard**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: PASS.

- [ ] **Step 6: Run the full gate and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

```bash
git add apps/web/src/lib apps/web/src/components/supplements apps/web/src/components/concerns
git commit -m "feat(web): move supplements, treatment and concerns onto the icon registry"
```

---

### Task 4: Intake and nutrition

The intake types are the densest icon set in the app and the one users see most.

**Files:**
- Modify: `apps/web/src/components/intake/QuickLog.tsx` — ☕×2 🍷 🍽 🏋 💊 💧 📅 📝 😰 🤒 🧳
- Modify: `apps/web/src/components/nutrition/MealLogger.tsx` — ✏ 🍽 📷 📸 🔍
- Modify: `apps/web/src/components/nutrition/NutritionScreen.tsx` — ✎ 🍽
- Modify: `apps/web/src/lib/icons.tsx`, `apps/web/src/lib/icons.test.tsx`

**Interfaces:**
- Consumes: `Icon`, `IconName` from `../../lib/icons`; `coffee`, `alcohol`, `calendar`, `search`, `photo` already exist.
- Produces: entries `meal`, `water`, `meds`, `workout`, `illness`, `stress`, `travel`, `note`, `edit`, `editSimple`, `snapshot`.

- [ ] **Step 1: Add this task's registry entries**

```tsx
  meal:       { icon: ForkKnife,     emoji: '🍽' },
  water:      { icon: Drop,          emoji: '💧' },
  meds:       { icon: Pill,          emoji: '💊' },
  workout:    { icon: Barbell,       emoji: '🏋' },
  illness:    { icon: Virus,         emoji: '🤒' },
  stress:     { icon: SmileyNervous, emoji: '😰' },
  travel:     { icon: Suitcase,      emoji: '🧳' },
  note:       { icon: NotePencil,    emoji: '📝' },
  edit:       { icon: Pencil,        emoji: '✏' },
  editSimple: { icon: PencilSimple,  emoji: '✎' },
  snapshot:   { icon: Camera,        emoji: '📸' },
```

Note `workout`'s emoji is `🏋` **without** a variation selector, which is what
`QuickLog.tsx` contains — distinct from the registry's existing `sportGym`
(`🏋️`, with one). Copy the literal from the file rather than typing it.

Add the eleven matching rows to `expectedComponentName`.

- [ ] **Step 2: Run the registry test to verify it fails**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: FAIL.

- [ ] **Step 3: Run the registry test to verify it passes**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: PASS.

- [ ] **Step 4: Convert the three component files**

`QuickLog.tsx` holds its emoji in the `INTAKE_TYPES` array as part of each
`label`, e.g. `{ type: 'coffee', label: '☕ Кофе', … }`. **Do not change the
labels** — they are translation keys, and rewriting them belongs to the later
i18n pass. Convert only the emoji this file renders as standalone JSX nodes,
and leave the array's label strings exactly as they are.

If that leaves the file with emoji still present in the label strings, the guard
will fail on it. In that case add `QuickLog.tsx` to the guard's documented
exemption list with a comment saying its remaining emoji are translation keys
awaiting the i18n pass — the same narrow-exemption pattern already used for
`ActivityCalendar.tsx`'s pagination arrow. Say so in your report.

- [ ] **Step 5: Run the guard**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: PASS, with the exemption in place if `QuickLog.tsx` needs one.

- [ ] **Step 6: Run the full gate and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

```bash
git add apps/web/src/lib apps/web/src/components/intake apps/web/src/components/nutrition
git commit -m "feat(web): move intake and nutrition onto the icon registry"
```

---

### Task 5: Settings, upload and the onboarding guide

**Files:**
- Modify: `apps/web/src/components/settings/DoctorReport.tsx` — ⚠×3
- Modify: `apps/web/src/components/settings/sections/AiBudgetSection.tsx` — 💬 🔍 🔬
- Modify: `apps/web/src/components/settings/sections/EnvironmentSection.tsx` — ✅×3 📍
- Modify: `apps/web/src/components/settings/sections/ExportSection.tsx` — 📊 📦 🖨
- Modify: `apps/web/src/components/settings/sections/ImportSection.tsx` — 📥
- Modify: `apps/web/src/components/settings/sections/TelegramSection.tsx` — 🌙
- Modify: `apps/web/src/components/upload/UploadScreen.tsx` — ⚠
- Modify: `apps/web/src/components/onboarding/guide/StepSchedule.tsx` — ✅
- Modify: `apps/web/src/lib/icons.tsx`, `apps/web/src/lib/icons.test.tsx`

**Interfaces:**
- Consumes: `Icon` from `../../lib/icons` (depth varies — `sections/` files are one level deeper); `warning`, `planDone`, `search`, `microscope`, `chart`, `moon` already exist.
- Produces: entries `chat`, `location`, `archive`, `print`, `import`.

- [ ] **Step 1: Add this task's registry entries**

```tsx
  chat:     { icon: ChatCircle,     emoji: '💬' },
  location: { icon: MapPin,         emoji: '📍' },
  archive:  { icon: Package,        emoji: '📦' },
  print:    { icon: Printer,        emoji: '🖨' },
  import:   { icon: DownloadSimple, emoji: '📥' },
```

Add the five matching rows to `expectedComponentName`.

- [ ] **Step 2: Run the registry test to verify it fails**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: FAIL.

- [ ] **Step 3: Run the registry test to verify it passes**

Run: `npm test -w tonus-web -- --project jsdom icons`
Expected: PASS.

- [ ] **Step 4: Convert the eight component files**

`AiBudgetSection.tsx`'s three emoji (`💬 Чат`, `🔍 Анализ данных`, `🔬 OCR анализов`)
appear both as JSX and inside translation keys. Convert only the JSX
occurrences; leave any string that is passed to `t()` untouched, and note in
your report whether the file needs a guard exemption for the remainder.

`DoctorReport.tsx` renders a printable document. Verify the icons appear in
print output, not just on screen — `<svg>` prints, but check no rule hides it.

- [ ] **Step 5: Run the guard**

Run: `npm test -w tonus-web -- --project node noEmoji`
Expected: PASS.

- [ ] **Step 6: Run the full gate and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

```bash
git add apps/web/src/lib apps/web/src/components/settings apps/web/src/components/upload apps/web/src/components/onboarding
git commit -m "feat(web): move settings, upload and the onboarding guide onto the icon registry"
```

---

### Task 6: Verification and the PR

No new code. This task proves the sweep and measures what it cost.

**Files:**
- Modify: none expected. If verification surfaces a defect, fix it here and note it in the commit.

- [ ] **Step 1: Measure the bundle**

Build this branch, then build `main` in a throwaway worktree so this branch's tree is never touched:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm run build -w tonus-web && ls -l apps/web/dist/assets/*.js | awk '{print $5, $9}' | sort -rn | head -4
git worktree add --detach /tmp/tonus-baseline main
(cd /tmp/tonus-baseline && npm install --no-audit --no-fund && npm run build -w tonus-web \
  && ls -l apps/web/dist/assets/*.js | awk '{print $5, $9}' | sort -rn | head -4)
git worktree remove /tmp/tonus-baseline --force
```

Report the gzipped delta. The dashboard pilot cost +5.7 kB gzipped for 18 icons; roughly 45 more icons should land well under 20 kB, and Phosphor tree-shakes per icon. If the delta exceeds that materially, say so rather than shrugging.

- [ ] **Step 2: Screenshot the converted screens**

`apps/web/.env.local` is gitignored and absent. Create it with `VITE_SUPABASE_URL=http://localhost:54321`, `VITE_SUPABASE_ANON_KEY=test-anon-key`, `VITE_DEMO=1`, then:

```bash
npm run build -w tonus-web -- --base=./
```

Open `apps/web/dist/index.html` as a `file://` URL and walk the converted screens: research, insights, supplements, intake, nutrition, settings. **Do not use the dev server** — the preview harness spawns it in the session's original checkout, so it serves a different branch's code while looking like it works.

Check that icons inherit the role-token colours rather than rendering black, and that 14px icons read at their size beside 11–13px text.

- [ ] **Step 3: Prove the escape hatch still works app-wide**

Add `VITE_ICONS=0` to `apps/web/.env.local`, rebuild with the same command, reload, and walk the same screens. Expected: emoji back in every position, on all converted screens — not just the dashboard. Delete `apps/web/.env.local` afterwards.

- [ ] **Step 4: Run the full gate**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run lint && npm run build
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin spec/web-icons-rollout
```

Open a PR to `main` titled `feat(web): roll the icon registry out to the remaining screens`. The body states: how many sites moved and across how many files; the registry's growth and that each task added only what it needed; the bundle delta from Step 1; which files kept emoji and why (translation keys awaiting the i18n pass, plus `LoadError.tsx`); that `✓`/`✕` are glyphs; and that `VITE_ICONS=0` was verified across all converted screens rather than only the dashboard.

---

## Self-Review

**Spec coverage.** 110 sites across 26 files → Tasks 1-5, each file listed with its exact emoji inventory. Registry growth 22 → ~71 → the mapping table plus per-task entry blocks. `DoctorReport` included → Task 5. `LoadError` excluded → Global Constraints. `✓`/`✕` kept → Global Constraints. Automatic guard → Step 5 of each task. Bundle measured → Task 6 Step 1. `VITE_ICONS=0` verified app-wide → Task 6 Step 3. The later i18n pass appears in no task, correctly.

**Placeholder scan:** no TBD/TODO. Every registry entry carries its verified Phosphor component; every task lists its files and their emoji.

**Type consistency:** `Icon`, `IconName`, `ICONS`, `expectedComponentName`, `PILOT_FILES` keep one name throughout. No task introduces an entry a later task redefines; `coffee`, `search`, `photo`, `moon`, `chart` are each added once and reused by name afterwards.

**One risk carried into the plan:** Tasks 4 and 5 touch files whose emoji are partly JSX and partly translation keys. Both tasks say to convert only the JSX and to add a documented guard exemption for the remainder rather than reaching into `lib/translations`. If an implementer instead edits a translation key, the guard passes and uk/en users silently see Russian — the exact failure the later pass exists to design against.
