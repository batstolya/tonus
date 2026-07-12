# Tonus README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale Russian README and two laggy screen-recording GIFs with a preserved archive, an English product-first README, a matching Ukrainian README, four focused reproducible demos, and a GitHub-safe architecture SVG.

**Architecture:** Keep README generation separate from application behavior. A small pure media library owns global-palette GIF encoding and validation; a Playwright recorder owns deterministic scenarios against existing demo fixtures; a README validator checks language parity and local assets. The application itself is not changed for documentation capture.

**Tech Stack:** Markdown, SVG, Node.js 24, Playwright, `gifenc`, `pngjs`, Node's built-in test runner, React/Vite demo mode.

## Global Constraints

- `README.md` is canonical English; `README.uk.md` mirrors it in Ukrainian.
- Preserve the current README and all five active media assets under `docs/archive/readme-2026-07-12/` before replacing anything.
- Keep the existing Tonus banner and visual identity.
- Use demo fixtures only; never capture production or private data.
- Produce four 6–8 second GIFs around 960x600 at device scale factor 1 and 8–10 fps.
- Use one global palette per GIF; target roughly 1.5 MB per file and document justified exceptions.
- Do not add an external encoder dependency or require `ffmpeg`, ImageMagick, or `gifsicle`.
- Do not change application behavior solely to make README recording easier.
- Keep football reminders and `claude-monitor` out of the core health feature story.
- Use Node 24 for build, preview, and Playwright commands.

## File map

- Create `docs/archive/readme-2026-07-12/README.md` — exact pre-refresh README.
- Create `docs/archive/readme-2026-07-12/RESTORE.md` — archive provenance and restoration instructions.
- Create `docs/archive/readme-2026-07-12/media/*` — exact pre-refresh media snapshot.
- Create `README.uk.md` — Ukrainian mirror of the new canonical README.
- Modify `README.md` — English product showcase and engineering overview.
- Keep/modify `docs/media/banner.svg` — existing hero asset, only if rendering requires a small fix.
- Create `docs/media/architecture.svg` — language-neutral architecture illustration.
- Replace `docs/media/landing-hero.png` — crisp English landing capture.
- Create `docs/media/daily-signal.gif` — dashboard and streak scenario.
- Create `docs/media/ask-your-data.gif` — deterministic landing AI-chat scenario.
- Create `docs/media/pattern-to-experiment.gif` — correlations-to-experiment scenario.
- Create `docs/media/health-timeline.gif` — Telegram capture scenario.
- Remove active `docs/media/landing-tour.gif` and `docs/media/app-demo.gif` after archiving.
- Create `scripts/readme-media-lib.mjs` — pure palette, GIF encoding, and manifest validation helpers.
- Create `scripts/readme-media-lib.test.mjs` — Node tests for the pure media helpers.
- Modify `scripts/record-readme-media.mjs` — deterministic scenario recorder.
- Create `scripts/validate-readme.mjs` — bilingual heading, local-link, and media-budget validation.
- Modify `package.json` — reproducible recording and validation commands.

---

### Task 1: Preserve the existing README presentation

**Files:**
- Create: `docs/archive/readme-2026-07-12/README.md`
- Create: `docs/archive/readme-2026-07-12/RESTORE.md`
- Create: `docs/archive/readme-2026-07-12/media/banner.svg`
- Create: `docs/archive/readme-2026-07-12/media/landing-tour.gif`
- Create: `docs/archive/readme-2026-07-12/media/app-demo.gif`
- Create: `docs/archive/readme-2026-07-12/media/landing-hero.png`
- Create: `docs/archive/readme-2026-07-12/media/dashboard.png`

**Interfaces:**
- Consumes: repository state at commit `a373516`.
- Produces: a self-contained restoration snapshot that later tasks never modify.

- [ ] **Step 1: Create the archive directory and copy the current files byte-for-byte**

Run:

```bash
mkdir -p docs/archive/readme-2026-07-12/media
cp README.md docs/archive/readme-2026-07-12/README.md
cp docs/media/banner.svg docs/media/landing-tour.gif docs/media/app-demo.gif \
  docs/media/landing-hero.png docs/media/dashboard.png \
  docs/archive/readme-2026-07-12/media/
```

Expected: six archived files exist and no active file has changed.

- [ ] **Step 2: Add archive provenance**

Create `docs/archive/readme-2026-07-12/RESTORE.md` with exactly:

```markdown
# Tonus README snapshot — 2026-07-12

This directory preserves the README presentation that existed immediately
before the bilingual product-showcase refresh.

- Source commit: `a373516`
- Captured: 2026-07-12
- Scope: README, banner, two legacy GIF tours, and two PNG screenshots

To inspect the old presentation, open `README.md` in this directory. To restore
it, copy this README and the files in `media/` back to the repository root and
`docs/media/`, preserving their original names.
```

- [ ] **Step 3: Verify the snapshot is exact**

Run:

```bash
cmp README.md docs/archive/readme-2026-07-12/README.md
for f in banner.svg landing-tour.gif app-demo.gif landing-hero.png dashboard.png; do
  cmp "docs/media/$f" "docs/archive/readme-2026-07-12/media/$f"
done
git diff --check
```

Expected: all `cmp` commands exit 0 and `git diff --check` prints nothing.

- [ ] **Step 4: Commit the restoration snapshot**

```bash
git add docs/archive/readme-2026-07-12
git commit -m "docs(readme): archive pre-refresh presentation"
```

---

### Task 2: Build a stable global-palette GIF encoder

**Files:**
- Create: `scripts/readme-media-lib.mjs`
- Create: `scripts/readme-media-lib.test.mjs`

**Interfaces:**
- Consumes: Playwright PNG screenshot buffers.
- Produces:
  - `samplePalettePixels(rgbaFrames, maxPixels): Uint8ClampedArray`
  - `encodeGif(pngFrames, outputPath, options): { bytes, width, height, frames, durationMs }`
  - `validateScenarioMeta(meta): string[]`

- [ ] **Step 1: Write failing tests for palette sampling and media limits**

Create `scripts/readme-media-lib.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import {
  samplePalettePixels,
  encodeGif,
  validateScenarioMeta,
} from './readme-media-lib.mjs'

function png(width, height, color) {
  const image = new PNG({ width, height })
  for (let i = 0; i < image.data.length; i += 4) {
    image.data.set([...color, 255], i)
  }
  return PNG.sync.write(image)
}

test('samplePalettePixels returns bounded RGBA samples from every frame', () => {
  const frames = [
    new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]),
    new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 255, 255]),
  ]
  const result = samplePalettePixels(frames, 2)
  assert.equal(result.length, 8)
  assert.deepEqual(new Set([result[0], result[4]]), new Set([255, 0]))
})

test('encodeGif writes one animated GIF with shared dimensions', async () => {
  const out = new URL('../work/readme-media-lib-test.gif', import.meta.url)
  const result = await encodeGif(
    [png(4, 3, [20, 30, 40]), png(4, 3, [80, 90, 100])],
    out,
    { delay: 100, colors: 16, maxPalettePixels: 24 },
  )
  assert.equal(result.width, 4)
  assert.equal(result.height, 3)
  assert.equal(result.frames, 2)
  assert.equal(result.durationMs, 200)
  assert.equal(Buffer.from(result.bytes).subarray(0, 6).toString(), 'GIF89a')
})

test('validateScenarioMeta reports duration, dimensions, fps and size failures', () => {
  assert.deepEqual(validateScenarioMeta({
    name: 'ok', width: 960, height: 600, frames: 60,
    durationMs: 6000, bytes: 1_000_000,
  }), [])
  const errors = validateScenarioMeta({
    name: 'bad', width: 1760, height: 1100, frames: 100,
    durationMs: 5000, bytes: 2_000_000,
  })
  assert.ok(errors.some(e => e.includes('960x600')))
  assert.ok(errors.some(e => e.includes('6–8 seconds')))
  assert.ok(errors.some(e => e.includes('1.5 MB')))
})
```

- [ ] **Step 2: Run the tests and confirm the module is missing**

Run: `node --test scripts/readme-media-lib.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `readme-media-lib.mjs`.

- [ ] **Step 3: Implement bounded sampling, shared-palette encoding, and validation**

Create `scripts/readme-media-lib.mjs` with these rules:

```js
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import gifenc from 'gifenc'
import { PNG } from 'pngjs'

const { GIFEncoder, quantize, applyPalette } = gifenc

export function samplePalettePixels(rgbaFrames, maxPixels = 750_000) {
  if (!rgbaFrames.length) throw new Error('At least one RGBA frame is required')
  const totalPixels = rgbaFrames.reduce((n, f) => n + f.length / 4, 0)
  const stride = Math.max(1, Math.ceil(totalPixels / maxPixels))
  const sampleCount = Math.ceil(totalPixels / stride)
  const out = new Uint8ClampedArray(sampleCount * 4)
  let seen = 0
  let written = 0
  for (const frame of rgbaFrames) {
    for (let i = 0; i < frame.length; i += 4) {
      if (seen % stride === 0) {
        out.set(frame.subarray(i, i + 4), written * 4)
        written += 1
      }
      seen += 1
    }
  }
  return out.subarray(0, written * 4)
}

export async function encodeGif(pngFrames, outputPath, {
  delay = 100,
  colors = 160,
  maxPalettePixels = 750_000,
} = {}) {
  if (!pngFrames.length) throw new Error('At least one PNG frame is required')
  const decoded = pngFrames.map(buf => PNG.sync.read(buf))
  const { width, height } = decoded[0]
  if (decoded.some(frame => frame.width !== width || frame.height !== height)) {
    throw new Error('All frames must have identical dimensions')
  }
  const rgba = decoded.map(frame => new Uint8ClampedArray(frame.data))
  const palette = quantize(samplePalettePixels(rgba, maxPalettePixels), colors)
  const gif = GIFEncoder()
  rgba.forEach((frame, index) => {
    gif.writeFrame(applyPalette(frame, palette), width, height, {
      palette: index === 0 ? palette : undefined,
      delay,
      repeat: 0,
    })
  })
  gif.finish()
  const bytes = gif.bytes()
  const target = outputPath instanceof URL ? fileURLToPath(outputPath) : path.resolve(outputPath)
  const temp = `${target}.tmp`
  fs.writeFileSync(temp, Buffer.from(bytes))
  fs.renameSync(temp, target)
  return { bytes, width, height, frames: rgba.length, durationMs: rgba.length * delay }
}

export function validateScenarioMeta(meta) {
  const errors = []
  if (meta.width !== 960 || meta.height !== 600) errors.push(`${meta.name}: expected 960x600`)
  if (meta.durationMs < 6000 || meta.durationMs > 8000) errors.push(`${meta.name}: expected 6–8 seconds`)
  const fps = meta.frames / (meta.durationMs / 1000)
  if (fps < 8 || fps > 10) errors.push(`${meta.name}: expected 8–10 fps`)
  if (meta.bytes > 1_500_000) errors.push(`${meta.name}: exceeds the 1.5 MB target`)
  return errors
}
```

- [ ] **Step 4: Run the focused tests**

Run: `node --test scripts/readme-media-lib.test.mjs`

Expected: 3 tests pass. Remove `work/readme-media-lib-test.gif` after the run.

- [ ] **Step 5: Commit the encoder**

```bash
git add scripts/readme-media-lib.mjs scripts/readme-media-lib.test.mjs
git commit -m "docs(media): add stable global-palette GIF encoder"
```

---

### Task 3: Replace the screen recorder with four focused scenarios

**Files:**
- Modify: `scripts/record-readme-media.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `encodeGif` and `validateScenarioMeta` from Task 2, Vite preview at `http://localhost:4173`, existing demo fixtures and landing animations.
- Produces: `landing-hero.png`, `daily-signal.gif`, `ask-your-data.gif`, `pattern-to-experiment.gif`, `health-timeline.gif`.

- [ ] **Step 1: Add a failing package-script check**

Run:

```bash
node -e "const p=require('./package.json'); if(!p.scripts['media:readme']) process.exit(1)"
```

Expected: exit 1 because `media:readme` does not exist.

- [ ] **Step 2: Add the reproducible package commands**

Add to `package.json` scripts:

```json
"media:readme": "node scripts/record-readme-media.mjs",
"test:readme": "node --test scripts/readme-media-lib.test.mjs && node scripts/validate-readme.mjs"
```

Run the check from Step 1 again. Expected: exit 0.

- [ ] **Step 3: Refactor the recorder around fixed capture primitives**

Replace the old per-frame-palette implementation with these constants and
helpers:

```js
const BASE = 'http://localhost:4173'
const OUT = 'docs/media'
const WIDTH = 960
const HEIGHT = 600
const FRAME_MS = 100

async function captureFor(page, frames, durationMs) {
  const count = Math.round(durationMs / FRAME_MS)
  for (let i = 0; i < count; i += 1) {
    frames.push(await page.screenshot({ type: 'png' }))
    await page.waitForTimeout(FRAME_MS)
  }
}

async function setEnglish(page) {
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'en')
    localStorage.setItem('theme', 'light')
  })
}

async function enableDemo(page, hash = 'dashboard') {
  await page.addInitScript(() => localStorage.setItem('tonus_demo', '1'))
  await page.goto(`${BASE}/#${hash}`)
  await page.reload()
  await page.getByText('Daily readiness').waitFor({ timeout: 15_000 })
}
```

Add a fixed synthetic cursor with id `readme-cursor` after each navigation. It
must be an 18px white circle with a 2px dark border, fixed positioning,
`pointer-events:none`, `z-index:2147483647`, a subtle shadow, and a 220ms CSS
transform transition. Provide helpers:

```js
async function installCursor(page)
async function pointAt(page, locator)
async function clickWithCursor(page, locator)
```

`pointAt` uses `locator.boundingBox()` and moves the injected cursor to the
element center. `clickWithCursor` points, waits 250ms, clicks, and waits 350ms.

- [ ] **Step 4: Implement the four exact scenario flows**

Use one fresh page per scenario with viewport `960x600` and device scale factor
1. Record these flows:

```js
const scenarios = [
  {
    name: 'daily-signal',
    durationMs: 6500,
    flow: async (page, frames) => {
      await enableDemo(page, 'dashboard')
      await installCursor(page)
      await captureFor(page, frames, 2200)
      const streak = page.getByRole('button', { name: 'Streak' })
      await clickWithCursor(page, streak)
      await captureFor(page, frames, 3000)
      await clickWithCursor(page, page.getByRole('button', { name: 'Close' }).first())
      await captureFor(page, frames, 1300)
    },
  },
  {
    name: 'ask-your-data',
    durationMs: 7000,
    flow: async (page, frames) => {
      await page.goto(BASE)
      const block = page.locator('.chat-stage')
      await block.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      await installCursor(page)
      await captureFor(page, frames, 7000)
    },
  },
  {
    name: 'pattern-to-experiment',
    durationMs: 7500,
    flow: async (page, frames) => {
      await enableDemo(page, 'insights')
      const correlations = page.getByText('Patterns in your data')
      await correlations.scrollIntoViewIfNeeded()
      await installCursor(page)
      await captureFor(page, frames, 3300)
      const experiments = page.getByRole('button', { name: 'Experiments' })
      await clickWithCursor(page, experiments)
      await page.locator('.expc')
        .filter({ hasText: 'Отказ от кофе после 16:00' })
        .scrollIntoViewIfNeeded()
      await captureFor(page, frames, 4200)
    },
  },
  {
    name: 'health-timeline',
    durationMs: 6500,
    flow: async (page, frames) => {
      await page.goto(BASE)
      const block = page.locator('.tg-grid')
      await block.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      await installCursor(page)
      await captureFor(page, frames, 6500)
    },
  },
]
```

Use translated text verified in the running app. If an accessible English name
differs, use the exact rendered accessible name without adding test-only IDs or
changing application code. The demo experiment hypotheses are fixture content,
not translation keys, so the experiment locator intentionally matches the
Russian fixture string inside the otherwise English UI.

- [ ] **Step 5: Encode each scenario and fail loudly on spec violations**

For each scenario:

```js
const result = await encodeGif(frames, `${OUT}/${scenario.name}.gif`, {
  delay: FRAME_MS,
  colors: 160,
  maxPalettePixels: 750_000,
})
const errors = validateScenarioMeta({
  name: scenario.name,
  ...result,
  bytes: result.bytes.length,
})
if (errors.length) throw new Error(errors.join('\n'))
```

Also capture `landing-hero.png` at 960x600 after fonts are ready. Remove all code
that creates `landing-tour.gif`, `app-demo.gif`, and `dashboard.png`.

- [ ] **Step 6: Run static checks for the recorder**

Run:

```bash
node --check scripts/record-readme-media.mjs
node --test scripts/readme-media-lib.test.mjs
```

Expected: syntax check succeeds and all focused tests pass.

- [ ] **Step 7: Commit the reproducible recorder**

```bash
git add package.json scripts/record-readme-media.mjs
git commit -m "docs(media): script focused README product demos"
```

---

### Task 4: Generate and visually verify the new media set

**Files:**
- Create: `docs/media/daily-signal.gif`
- Create: `docs/media/ask-your-data.gif`
- Create: `docs/media/pattern-to-experiment.gif`
- Create: `docs/media/health-timeline.gif`
- Modify: `docs/media/landing-hero.png`
- Delete: `docs/media/landing-tour.gif`
- Delete: `docs/media/app-demo.gif`
- Delete: `docs/media/dashboard.png`

**Interfaces:**
- Consumes: Task 3 recorder and a production Vite preview.
- Produces: the complete new raster media set referenced by both READMEs.

- [ ] **Step 1: Build with Node 24**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm run build
```

Expected: `tsc -b && vite build` exits 0.

- [ ] **Step 2: Start preview and record media**

Run preview in a persistent terminal:

```bash
npm run preview -- --port 4173 --strictPort
```

In a second command run:

```bash
npm run media:readme
```

Expected: five files are written and every GIF reports 960x600, 6–8 seconds,
8–10 fps, and at most 1.5 MB.

- [ ] **Step 3: Inspect representative frames**

Extract or screenshot the first, middle, and final visible state of every GIF
using the available local image tooling. Check:

- no blank or loading frames;
- no private names, tokens, URLs, or production values;
- English copy is visible and not clipped;
- cursor does not obscure the clicked label;
- the key state change is readable without replaying more than once;
- there is no palette flicker between frames.

If a GIF is too large, first reduce colors from 160 to 128, then shorten idle
holds while keeping total duration at least 6 seconds. Do not reduce text below
legible size.

- [ ] **Step 4: Remove the superseded active media**

Run:

```bash
rm docs/media/landing-tour.gif docs/media/app-demo.gif docs/media/dashboard.png
```

Expected: the files remain available only in the archive from Task 1.

- [ ] **Step 5: Commit the generated media**

```bash
git add docs/media
git commit -m "docs(media): replace long tours with focused product demos"
```

---

### Task 5: Add a GitHub-safe architecture illustration

**Files:**
- Create: `docs/media/architecture.svg`

**Interfaces:**
- Consumes: current architecture from `docs/specs/SPEC-OVERVIEW.md` and the Edge Function tree.
- Produces: one language-neutral SVG shared by both README versions.

- [ ] **Step 1: Write the SVG with explicit semantic groups**

Create an 880x420 SVG with these exact groups and labels:

```text
INPUTS: Apple Health, Manual import, Telegram, Calendars, Environment
APP: React SPA, Vercel, PWA
SUPABASE: Auth, Postgres + RLS, Deno Edge Functions
AI: Gemini 2.5 Flash
```

The data flow is:

```text
Apple Health / Manual import -> Edge Functions -> Postgres + RLS
React SPA <-> Auth / Postgres + RLS / Edge Functions
Telegram <-> Edge Functions
Calendars / Environment -> Edge Functions
Edge Functions <-> Gemini 2.5 Flash
```

Use the banner palette (`#111735`, `#4fd1b5`, `#7c83ff`, `#c879d8`) on a
transparent canvas. Give nodes dark navy fills with light text, colored 1.5px
borders, 14–16px system-font labels, rounded 16px corners, and arrow markers.
Add `<title>Tonus system architecture</title>` and `<desc>` containing the flow
in plain English. Do not embed scripts, external fonts, or raster images.

- [ ] **Step 2: Validate the SVG as XML and inspect it**

Run:

```bash
xmllint --noout docs/media/architecture.svg
```

Expected: exit 0. Render or open the SVG and verify that arrows do not cross
labels and all text remains readable at 880px and 440px display widths.

- [ ] **Step 3: Commit the architecture asset**

```bash
git add docs/media/architecture.svg
git commit -m "docs(readme): add stable architecture illustration"
```

---

### Task 6: Write the English and Ukrainian product stories

**Files:**
- Modify: `README.md`
- Create: `README.uk.md`
- Create: `scripts/validate-readme.mjs`

**Interfaces:**
- Consumes: the five new media files and architecture SVG.
- Produces: two structurally identical README files and a deterministic validator.

- [ ] **Step 1: Write a failing bilingual README validator**

Create `scripts/validate-readme.mjs` that:

1. reads `README.md` and `README.uk.md`;
2. extracts level-2 headings and compares them with the exact English and
   Ukrainian heading arrays specified in Steps 2 and 3;
3. extracts every local image/link target from Markdown and HTML `src=`;
4. requires each local target to exist relative to its README;
5. rejects Markdown images or HTML `<img>` tags with empty alternative text;
6. rejects references to `landing-tour.gif`, `app-demo.gif`, or `dashboard.png`;
7. requires `landing-hero.png`, all four new GIF names, and `architecture.svg` in both files;
8. checks every GIF file size and prints a warning above 1.5 MB, but fails above
   2.0 MB;
9. exits non-zero with all collected errors, not only the first.

Before creating `README.uk.md`, run `node scripts/validate-readme.mjs`.

Expected: FAIL because the Ukrainian README and new media references are absent.

- [ ] **Step 2: Replace `README.md` with the English structure and copy**

Use these exact level-2 headings in order:

```markdown
## See Tonus in action
## What Tonus connects
## What Tonus can do
## How it works
## Privacy and safety
## Engineering
## Run locally
## Repository map
## Documentation
## Personal extensions
```

The hero keeps `banner.svg`, the CI/TypeScript/React/Supabase/Gemini badges, and
removes the brittle exact test-count badge. Add the language line:

```markdown
**English** · [Українська](README.uk.md)
```

Use this product promise:

```markdown
**Connect Apple Watch, log habits and labs, and let Tonus find the patterns that
actually affect how you feel.**
```

Under `See Tonus in action`, use a two-column HTML table. Each cell contains one
GIF at width 430, a bold scenario name, and a one-sentence outcome caption:

Start the section with `landing-hero.png` at width 880 and alt text describing
the interactive landing dashboard; this is the crisp static representation of
the landing page required by the design.

- Daily signal — “See readiness, recovery context, streaks and warnings at a glance.”
- Ask your data — “Ask a question in plain language; the answer is grounded in your own history.”
- From pattern to experiment — “Turn an observed relationship into a measured n=1 change.”
- One health timeline — “Log coffee, meals, medication and workouts without opening the app.”

Under `What Tonus connects`, describe one timeline fed by Apple Health automatic
sync, browser-side ZIP import, Telegram natural-language logging, calendars, and
Open-Meteo environmental context.

Under `What Tonus can do`, use a four-column table with these groups:

- **Understand today:** readiness against a 30-day baseline, sleep/HRV/heart/activity, activity streaks, workout plan, health and geomagnetic warnings.
- **Find patterns:** lag correlations, environmental factors, AI health chat with server-side tools, trends/records/anomalies, doctor report.
- **Change behavior:** n=1 experiments, AI suggestions, automatic verdicts, goals, caffeine model, medication adherence and reminders.
- **Keep a complete record:** labs OCR, meal photo analysis, supplements, concerns behind a PIN, hair tracking, daily notes, full export.

Under `How it works`, embed `architecture.svg` at width 880 and state:

```markdown
- **Frontend:** React 19, Vite 8 and strict TypeScript; deployed as a PWA on Vercel.
- **Backend:** Supabase Postgres with RLS and 20+ Deno Edge Functions.
- **AI:** Gemini 2.5 Flash for grounded chat, explanations, OCR and vision.
- **Automation:** pg_cron drives reminders, reports, environment sync and coaching workflows.
```

Under `Privacy and safety`, state that user rows are protected by RLS, Gemini keys
stay server-side, sensitive concerns can be PIN-gated, export is available, and
Tonus reports observations rather than diagnoses.

Under `Engineering`, mention strict TypeScript, client/server mirrored score
formulas with golden/parity tests, deterministic demo fixtures, authenticated
webhook/cron boundaries, retryable reminder delivery, lazy-loaded feature
screens, and green-CI-only deployment. Do not claim an exact test count unless
the final verification command provides it and the count is deliberately added.

Under `Run locally`, retain the Node 24 warning, dummy `.env.local` values,
`npm install`, `npm run dev`, `npm test`, `npm run test:e2e`, and `npm run build`.
Mention that demo mode needs no backend.

Under `Repository map` and `Documentation`, retain links to `src/`, `supabase/`,
`scripts/`, `docs/specs/`, `docs/guides/`, `.claude/skills/`, and `CLAUDE.md`.

Under `Personal extensions`, use one sentence: football reminders and the local
Claude limit monitor are personal automations built on the same notification
infrastructure, not core Tonus health features.

- [ ] **Step 3: Create the Ukrainian mirror**

Use the same media order, tables, code blocks, paths, and section count. Translate
the level-2 headings in this exact order:

```markdown
## Подивіться Tonus у дії
## Що об’єднує Tonus
## Що вміє Tonus
## Як це працює
## Приватність і безпека
## Інженерна частина
## Локальний запуск
## Структура репозиторію
## Документація
## Особисті розширення
```

The language line is:

```markdown
[English](README.md) · **Українська**
```

Use natural Ukrainian product copy, not literal word-by-word translation. Preserve
technical identifiers, commands, technology names, filenames, and disclaimer
meaning exactly.

- [ ] **Step 4: Run bilingual and link validation**

Run:

```bash
node scripts/validate-readme.mjs
```

Expected: PASS summary listing 10 sections per language, all local targets found,
and four GIF sizes. Warnings are allowed only for GIFs between 1.5 and 2.0 MB.

- [ ] **Step 5: Visually inspect GitHub-like layouts**

Render both READMEs or preview their HTML-equivalent layout at approximately
1280px and 480px widths. Verify:

- the language switch is visible without scrolling;
- the hero retains the current visual quality;
- the two-column demo table stacks or remains readable on narrow width;
- captions never overflow their cells;
- the architecture diagram is readable and has no Mermaid controls;
- code blocks and local links render correctly;
- English and Ukrainian pages feel equally complete.

- [ ] **Step 6: Commit both READMEs and the validator**

```bash
git add README.md README.uk.md scripts/validate-readme.mjs
git commit -m "docs(readme): publish English and Ukrainian product showcase"
```

---

### Task 7: Full verification and handoff

**Files:**
- Verify all files from Tasks 1–6.

**Interfaces:**
- Consumes: completed README refresh.
- Produces: evidence that docs, media, tests, and build are release-ready.

- [ ] **Step 1: Run documentation-specific checks**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm run test:readme
xmllint --noout docs/media/banner.svg docs/media/architecture.svg
git diff --check
```

Expected: all commands exit 0; no whitespace errors.

- [ ] **Step 2: Run the project verification suite**

```bash
npm test
npm run build
npm run test:e2e
```

Expected: Vitest, TypeScript/Vite build, and Playwright e2e all exit 0. If the
repository has a known pre-existing lint ceiling, run `npm run lint` and confirm
the change does not add errors; report the existing count separately.

- [ ] **Step 3: Audit the final diff**

Run:

```bash
git status --short
git diff --stat a373516..HEAD
git diff --name-status a373516..HEAD
```

Expected changes are limited to the archive, both READMEs, README media, package
scripts, recording/validation helpers, design spec, and this plan. No `.env`,
runtime state, browser profile, production data, or unrelated application file
may appear.

- [ ] **Step 4: Record any justified media-budget exception**

If every GIF is at or below 1.5 MB, no action is needed. If one is between 1.5
and 2.0 MB and reducing it harms readability, add a short comment to
`scripts/record-readme-media.mjs` beside that scenario explaining the measured
size and reason. No GIF above 2.0 MB is accepted.

- [ ] **Step 5: Final commit if verification required fixes**

```bash
git add README.md README.uk.md docs scripts package.json
git commit -m "docs(readme): finalize verified showcase refresh"
```

Skip this commit when the working tree is already clean.
