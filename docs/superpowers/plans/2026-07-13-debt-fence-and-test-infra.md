# Debt Fence + Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the tech-debt from growing (lint ratchet + new-`any` gate on changed lines) and stand up a jsdom test harness that renders real React components, proven on one component.

**Architecture:** Two committed CI gates backed by small pure, unit-tested helper libs in `scripts/` (mirrors the repo's existing `node --test` script-lib pattern). Vitest is split into two projects — the existing `node` project for pure-logic `.test.ts`, and a new `jsdom` project for `.test.tsx` component-behavior tests via Testing Library. Product source is untouched.

**Tech Stack:** Node 24, ESLint 10 (flat config), Vitest 3 (`test.projects`), @testing-library/react + jest-dom, jsdom, Node's built-in `node --test` for script libs.

**Scope boundary:** This plan delivers the *fence* (Spec Section 1) and the *test infrastructure + one proof test* (Spec Workstream B foundation). Behavior tests for the remaining top-5 components (Dashboard, SettingsScreen, …) are a follow-on plan built on this harness.

**Source spec:** `docs/superpowers/specs/2026-07-13-tech-debt-reduction-design.md`

---

## Preconditions

- Node 24 active: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` (verify `node -v` → `v24.16.0`).
- Work on a feature branch, not `main`: `git checkout -b debt-fence-and-test-infra`.
- Current exact lint error count is **292** (248 of them `@typescript-eslint/no-explicit-any`). This is the starting ceiling.

## File Structure

- Create: `.lint-ceiling` — single integer, the committed lint-error ceiling (source of truth, replaces the CI env var).
- Create: `scripts/lint-ceiling-lib.mjs` — pure `decideCeiling(count, ceiling)` decision logic.
- Create: `scripts/lint-ceiling-lib.test.mjs` — `node --test` unit tests for it.
- Create: `scripts/lint-ceiling.mjs` — glue: run eslint, read `.lint-ceiling`, exit per decision.
- Create: `scripts/lint-diff-lib.mjs` — pure `parseAddedLines(diff)` + `offendingMessages(results, addedLines)`.
- Create: `scripts/lint-diff-lib.test.mjs` — `node --test` unit tests for it.
- Create: `scripts/lint-diff.mjs` — glue: git diff vs base, eslint changed files, fail on new errors on added lines.
- Create: `vitest.setup.ts` — jest-dom matchers for the jsdom project.
- Create: `src/components/ui/EmptyState.test.tsx` — first real render/behavior test.
- Delete: `src/components/ui/EmptyState.test.ts` — superseded export-only test.
- Modify: `vitest.config.ts` — split into `node` + `jsdom` projects, add react plugin.
- Modify: `package.json` — add `lint:ceiling`, `lint:diff`, `test:scripts` scripts.
- Modify: `.github/workflows/ci.yml` — `fetch-depth: 0`, run script tests, replace inline lint ceiling with `npm run lint:ceiling`, add PR-only `npm run lint:diff`.

> Confirm the workflow filename first: `ls .github/workflows/`. Use that exact path wherever this plan says `ci.yml`.

---

## Task 1: Lint ceiling ratchet

Replace the inline CI ceiling with a committed `.lint-ceiling` file guarded by a script that fails both when errors **rise above** and when they **drop below** the ceiling (a true ratchet — improvements must be locked in by lowering the number).

**Files:**
- Create: `scripts/lint-ceiling-lib.mjs`
- Create: `scripts/lint-ceiling-lib.test.mjs`
- Create: `scripts/lint-ceiling.mjs`
- Create: `.lint-ceiling`

- [ ] **Step 1: Write the failing test**

Create `scripts/lint-ceiling-lib.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideCeiling } from './lint-ceiling-lib.mjs'

test('fails when count exceeds ceiling', () => {
  const r = decideCeiling(293, 292)
  assert.equal(r.ok, false)
  assert.match(r.message, /293/)
})

test('fails when count is below ceiling and names the new floor', () => {
  const r = decideCeiling(290, 292)
  assert.equal(r.ok, false)
  assert.match(r.message, /290/)
})

test('passes when count equals ceiling', () => {
  const r = decideCeiling(292, 292)
  assert.equal(r.ok, true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lint-ceiling-lib.test.mjs`
Expected: FAIL — `Cannot find module './lint-ceiling-lib.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lint-ceiling-lib.mjs`:

```js
// Pure decision for the lint ratchet. `.lint-ceiling` is the single source of truth
// for how many legacy lint errors are tolerated; it may only move down over time.
export function decideCeiling(count, ceiling) {
  if (count > ceiling) {
    return { ok: false, message: `lint errors ${count} exceed ceiling ${ceiling}; run 'npm run lint' and fix the new ones` }
  }
  if (count < ceiling) {
    return { ok: false, message: `lint errors dropped to ${count} (ceiling ${ceiling}); lower .lint-ceiling to ${count} to lock in the win` }
  }
  return { ok: true, message: `lint errors ${count} == ceiling ${ceiling}` }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lint-ceiling-lib.test.mjs`
Expected: PASS — 3 tests.

- [ ] **Step 5: Create the ceiling file and glue script**

Create `.lint-ceiling`:

```
292
```

Create `scripts/lint-ceiling.mjs`:

```js
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { decideCeiling } from './lint-ceiling-lib.mjs'

const ceiling = Number(readFileSync(new URL('../.lint-ceiling', import.meta.url), 'utf8').trim())

// eslint exits non-zero when it reports errors, so capture stdout from the throw.
let out
try {
  out = execSync('npx eslint . -f json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
} catch (e) {
  out = e.stdout
}
const count = JSON.parse(out).reduce((sum, r) => sum + r.errorCount, 0)

const { ok, message } = decideCeiling(count, ceiling)
if (!ok) {
  console.error(`::error::${message}`)
  process.exit(1)
}
console.log(message)
```

- [ ] **Step 6: Verify the glue script passes at the current count**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && node scripts/lint-ceiling.mjs`
Expected: prints `lint errors 292 == ceiling 292`, exit 0.
(If it prints a different number, set `.lint-ceiling` to that number and re-run — it must equal reality.)

- [ ] **Step 7: Commit**

```bash
git add scripts/lint-ceiling-lib.mjs scripts/lint-ceiling-lib.test.mjs scripts/lint-ceiling.mjs .lint-ceiling
git commit -m "feat(ci): lint ceiling ratchet backed by .lint-ceiling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: New-`any` / new-error gate on changed lines

A PR that fixes one legacy error and adds one new `any` keeps the total at 292 and slips past the ceiling. This gate runs eslint on changed files and fails on any error located on an **added line** relative to the PR base.

**Files:**
- Create: `scripts/lint-diff-lib.mjs`
- Create: `scripts/lint-diff-lib.test.mjs`
- Create: `scripts/lint-diff.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/lint-diff-lib.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAddedLines, offendingMessages } from './lint-diff-lib.mjs'

const DIFF = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -10,0 +11,2 @@
+const a: any = 1
+const b = 2
`

test('parseAddedLines maps added lines in new-file numbering', () => {
  const m = parseAddedLines(DIFF)
  assert.deepEqual([...m.get('src/x.ts')], [11, 12])
})

test('offendingMessages keeps only error-severity messages on added lines', () => {
  const added = parseAddedLines(DIFF)
  const results = [{
    filePath: '/repo/src/x.ts',
    messages: [
      { severity: 2, line: 11, ruleId: '@typescript-eslint/no-explicit-any', message: 'no any' }, // added line
      { severity: 2, line: 5, ruleId: 'x', message: 'legacy' },                                     // untouched line
      { severity: 1, line: 12, ruleId: 'y', message: 'warn' },                                       // warning, not error
    ],
  }]
  const off = offendingMessages(results, added)
  assert.equal(off.length, 1)
  assert.equal(off[0].line, 11)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lint-diff-lib.test.mjs`
Expected: FAIL — `Cannot find module './lint-diff-lib.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lint-diff-lib.mjs`:

```js
// Parse `git diff --unified=0` into file -> Set of added line numbers (new-file numbering).
export function parseAddedLines(diff) {
  const files = new Map()
  let current = null
  let nextLine = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).replace(/^b\//, '')
      if (path === '/dev/null') {
        current = null
      } else {
        files.set(path, new Set())
        current = files.get(path)
      }
      continue
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      nextLine = Number(hunk[1])
      continue
    }
    if (current && line.startsWith('+') && !line.startsWith('+++')) {
      current.add(nextLine)
      nextLine++
    }
  }
  return files
}

// From eslint JSON results, keep error-severity (2) messages that land on an added line.
export function offendingMessages(eslintResults, addedLines) {
  const out = []
  for (const result of eslintResults) {
    for (const [file, lines] of addedLines) {
      if (!result.filePath.endsWith(file)) continue
      for (const m of result.messages) {
        if (m.severity === 2 && m.line != null && lines.has(m.line)) {
          out.push({ file, line: m.line, ruleId: m.ruleId, message: m.message })
        }
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lint-diff-lib.test.mjs`
Expected: PASS — 2 tests.

- [ ] **Step 5: Write the glue script**

Create `scripts/lint-diff.mjs`:

```js
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { parseAddedLines, offendingMessages } from './lint-diff-lib.mjs'

// Base ref: the PR target on CI, else CLI arg, else local `main`.
const base = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : (process.argv[2] || 'main')

const diff = execSync(`git diff --unified=0 ${base}...HEAD -- '*.ts' '*.tsx'`, {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
const added = parseAddedLines(diff)
const files = [...added.keys()].filter((f) => existsSync(f))

if (files.length === 0) {
  console.log('lint:diff — no changed .ts/.tsx lines')
  process.exit(0)
}

let out
try {
  out = execSync(`npx eslint ${files.map((f) => `'${f}'`).join(' ')} -f json`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
} catch (e) {
  out = e.stdout
}

const offending = offendingMessages(JSON.parse(out), added)
if (offending.length) {
  for (const o of offending) {
    console.error(`::error file=${o.file},line=${o.line}::${o.ruleId}: ${o.message}`)
  }
  console.error(`\n${offending.length} new lint error(s) on changed lines. Fix before merge.`)
  process.exit(1)
}
console.log('lint:diff — no new lint errors on changed lines')
```

- [ ] **Step 6: Smoke-test the glue locally**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && node scripts/lint-diff.mjs main`
Expected: exit 0 with `no new lint errors on changed lines` (this branch so far only added `.mjs` script + config files with no eslint errors). A non-zero exit here means a real new error was introduced — fix it.

- [ ] **Step 7: Commit**

```bash
git add scripts/lint-diff-lib.mjs scripts/lint-diff-lib.test.mjs scripts/lint-diff.mjs
git commit -m "feat(ci): fail on new lint errors on changed lines

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: jsdom test project + Testing Library

Split Vitest into a `node` project (existing pure-logic `.test.ts`) and a `jsdom` project (`.test.tsx` component tests), so pure-logic tests keep running under node exactly as before.

**Files:**
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Create: `vitest.setup.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm i -D @testing-library/react @testing-library/jest-dom jsdom
```
Expected: adds the three packages (React 19 pulls @testing-library/react v16+). `npm test` still green afterward.

- [ ] **Step 2: Create the jsdom setup file**

Create `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Rewrite vitest.config.ts as two projects**

Replace the entire contents of `vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// dummy env: src/lib/supabase.ts calls createClient(url, key) at module load;
// empty values make it throw "supabaseUrl is required".
const env = {
  VITE_SUPABASE_URL: 'http://localhost:54321',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
}
// scripts/*.test.mjs are node:test suites (run via `npm run test:scripts`), not Vitest.
const exclude = ['**/node_modules/**', 'e2e/**', 'scripts/**']

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['**/*.test.ts'], exclude, env },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude,
          env,
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
})
```

- [ ] **Step 4: Add package.json scripts**

In `package.json`, add to `"scripts"` (keep existing entries):

```json
"lint:ceiling": "node scripts/lint-ceiling.mjs",
"lint:diff": "node scripts/lint-diff.mjs",
"test:scripts": "node --test scripts"
```

- [ ] **Step 5: Verify both projects run and node tests still pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test`
Expected: Vitest reports both projects; the `node` project runs the existing 66 files / 446 tests and passes; the `jsdom` project reports 0 test files (no `.test.tsx` yet) — that is fine.

- [ ] **Step 6: Verify script unit tests run via the new npm script**

Run: `npm run test:scripts`
Expected: PASS — includes the Task 1 and Task 2 lib tests (and the pre-existing readme-media lib test).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts vitest.setup.ts package.json package-lock.json
git commit -m "test: add jsdom vitest project and Testing Library

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Prove the harness with a real EmptyState behavior test

`src/components/ui/EmptyState.tsx` renders a title, optional text, and an optional CTA button — simple props, no context providers — so it proves render + interaction end-to-end.

**Files:**
- Create: `src/components/ui/EmptyState.test.tsx`
- Delete: `src/components/ui/EmptyState.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/EmptyState.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders the title and optional text', () => {
    render(<EmptyState icon="🎯" title="No data yet" text="Add your first entry" />)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
    expect(screen.getByText('Add your first entry')).toBeInTheDocument()
  })

  it('fires the cta onClick when the button is pressed', () => {
    const onClick = vi.fn()
    render(<EmptyState icon="🔒" title="Locked" cta={{ label: 'Unlock', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the jsdom project to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run --project jsdom`
Expected: PASS — 2 tests in `EmptyState.test.tsx`. (This proves render, query, and event firing all work in the jsdom project.)

- [ ] **Step 3: Delete the superseded export-only test**

Run: `git rm src/components/ui/EmptyState.test.ts`
(The new `.test.tsx` covers everything the export-only `.test.ts` did and more.)

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: both projects green; total test count reflects EmptyState moving from node to jsdom.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/EmptyState.test.tsx
git commit -m "test(ui): real behavior test for EmptyState proving jsdom harness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire the gates into CI

**Files:**
- Modify: `.github/workflows/ci.yml` (use the actual filename from `ls .github/workflows/`)

- [ ] **Step 1: Give checkout full history for diffing**

In the `ci` job, change the checkout step to fetch full history (needed for `git diff <base>...HEAD`):

```yaml
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
```

- [ ] **Step 2: Add a script-lib unit-test step**

After the existing `Test` step, add:

```yaml
      - name: Script unit tests
        run: npm run test:scripts
```

- [ ] **Step 3: Replace the inline lint ceiling with the ratchet script**

Replace the whole existing `Lint ceiling` step (the inline `jq`/`MAX_LINT_ERRORS` block) with:

```yaml
      - name: Lint ceiling (ratchet)
        run: npm run lint:ceiling
```

- [ ] **Step 4: Add the changed-lines gate for pull requests**

After the ceiling step, add:

```yaml
      - name: New lint errors on changed lines
        if: github.event_name == 'pull_request'
        run: npm run lint:diff
```

- [ ] **Step 5: Sanity-check the workflow YAML**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && node -e "console.log('yaml lines:', require('fs').readFileSync('.github/workflows/ci.yml','utf8').split('\n').length)"`
Then read the file and confirm: `fetch-depth: 0` present, `MAX_LINT_ERRORS` no longer referenced, all four steps (`Script unit tests`, `Lint ceiling (ratchet)`, `New lint errors on changed lines`) present and correctly indented.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run script tests, use lint ratchet, gate new errors on PRs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the whole local gate as CI will:
  ```bash
  export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
  npm test && npm run test:scripts && npm run build && npm run lint:ceiling && npm run lint:diff main
  ```
  Expected: every command exits 0. `lint:ceiling` prints `292 == ceiling 292`; `lint:diff` prints no new errors.
- [ ] `git log --oneline` shows the five task commits on branch `debt-fence-and-test-infra`.
- [ ] Open a PR (do not merge without user go-ahead) so the `pull_request`-only `lint:diff` step actually exercises on CI.

## Notes for the next plan (out of scope here)

- Expand Workstream B: behavior tests for the top-5 complex components (Dashboard, SettingsScreen, …). Those need light provider/mock scaffolding (i18n, supabase) — design that in the follow-on plan.
- Workstream A (typing `any` → real types on DB/network boundaries) can begin once the fence is live, lowering `.lint-ceiling` with each batch.
