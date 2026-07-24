# Mobile Phase 2 — Expo Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bare Expo app in `apps/mobile` that renders a value imported from `@tonus/shared`, proving the npm-workspace → Metro → TypeScript chain end to end.

**Architecture:** Expo SDK 57 managed workflow with Continuous Native Generation (`ios/` generated, never committed). Metro is pointed at the monorepo root explicitly so resolution does not depend on workspace-detection heuristics. Two pure, Expo-independent changes land first (a shared constant, and the lint-diff workspace mapping) so the risky install step has clean commits behind it.

**Tech Stack:** Expo ~57.0.8, React Native 0.86.0, React 19.2.6 (hoisted, shared with web), TypeScript ~6.0.2, ESLint 10 flat config, vitest (shared package), node:test (repo scripts).

**Spec:** `docs/superpowers/specs/2026-07-24-mobile-phase2-expo-skeleton-design.md`

---

## Environment

Every command in this plan needs Node 24. Start each shell with:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
```

Run all commands from the repo root (`/Users/anatolii/tonus`) unless a step says otherwise.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/shared/src/appMeta.ts` | Create. Client-only cross-platform constants; `APP_NAME` is its only inhabitant. |
| `packages/shared/src/index.ts` | Modify. Re-export `APP_NAME`. |
| `packages/shared/src/shared.test.ts` | Modify. Cover the new export. |
| `scripts/lint-diff-lib.mjs` | Modify. Gains `groupFilesByEslintCwd` — the pure mapping from repo-relative paths to the workspace that owns the ESLint config. |
| `scripts/lint-diff-lib.test.mjs` | Modify. Tests for that mapping. |
| `scripts/lint-diff.mjs` | Modify. Uses the lib function instead of the hardcoded `apps/web/` prefix. |
| `apps/mobile/package.json` | Create (from template, then edited). Workspace `tonus-mobile`; no `"type": "module"`. |
| `apps/mobile/app.json` | Create (from template, then edited). Expo config: name, slug, bundle identifier. |
| `apps/mobile/metro.config.js` | Create. Monorepo watchFolders + nodeModulesPaths. |
| `apps/mobile/tsconfig.json` | Create (from template). Strict, extends `expo/tsconfig.base`. |
| `apps/mobile/eslint.config.js` | Create. Flat config so the workspace self-lints. |
| `apps/mobile/App.tsx` | Create (from template, then rewritten). The placeholder screen; the only consumer of `APP_NAME`. |
| `package.json` (root) | Modify. `lint` delegates to the mobile workspace. |
| `.github/workflows/ci.yml` | Modify. Mobile typecheck + Metro export smoke. |

---

### Task 1: Shared `APP_NAME` constant

The smoke value the mobile screen will render. Pure, no Expo involved — it lands first so the workspace has something to prove.

**Files:**
- Create: `packages/shared/src/appMeta.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/shared.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/shared.test.ts`:

```ts
describe('@tonus/shared app metadata', () => {
  it('exports the product name for every client to render', () => {
    expect(APP_NAME).toBe('Tonus')
  })
})
```

and extend the existing import at the top of that file:

```ts
import { Constants, APP_NAME } from './index'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run -w @tonus/shared test`
Expected: FAIL — the module has no export named `APP_NAME`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/appMeta.ts`:

```ts
// Cross-client constants with no runtime dependencies. Client-only values are
// born here; logic that also runs inside an edge function stays in
// supabase/functions/_shared and gets a re-export facade instead (see the
// "Shared code boundary" section of the mobile monorepo design).

/** Product name as rendered by every client. */
export const APP_NAME = 'Tonus'
```

Add to `packages/shared/src/index.ts`, after the existing `Constants` export:

```ts
export { APP_NAME } from './appMeta'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run -w @tonus/shared test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/appMeta.ts packages/shared/src/index.ts packages/shared/src/shared.test.ts
git commit -m "feat(shared): add APP_NAME constant for cross-client rendering"
```

---

### Task 2: Teach lint-diff about every apps/* workspace

`scripts/lint-diff.mjs:28` hardcodes `apps/web/`. Files under `apps/mobile/` would be linted from the repo root, where `eslint.config.js` ignores `apps/**` — the PR gate would silently pass on unlinted mobile code.

**Files:**
- Modify: `scripts/lint-diff-lib.mjs`
- Modify: `scripts/lint-diff.mjs:26-33`
- Test: `scripts/lint-diff-lib.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `scripts/lint-diff-lib.test.mjs`:

```js
test('groupFilesByEslintCwd routes each app file to its own workspace', () => {
  const groups = groupFilesByEslintCwd([
    'apps/web/src/App.tsx',
    'apps/mobile/App.tsx',
    'packages/shared/src/index.ts',
    'scripts/x.ts',
  ])
  assert.deepEqual([...groups.keys()], ['apps/web', 'apps/mobile', '.'])
  assert.deepEqual(groups.get('apps/web'), ['src/App.tsx'])
  assert.deepEqual(groups.get('apps/mobile'), ['App.tsx'])
  assert.deepEqual(groups.get('.'), ['packages/shared/src/index.ts', 'scripts/x.ts'])
})

test('groupFilesByEslintCwd keeps a bare apps/ path at the root', () => {
  const groups = groupFilesByEslintCwd(['apps/README.ts'])
  assert.deepEqual(groups.get('.'), ['apps/README.ts'])
})
```

and extend the import at the top of that file:

```js
import { parseAddedLines, offendingMessages, groupFilesByEslintCwd } from './lint-diff-lib.mjs'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lint-diff-lib.test.mjs`
Expected: FAIL — `groupFilesByEslintCwd is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `scripts/lint-diff-lib.mjs`:

```js
// Each app in apps/* ships its own flat ESLint config and the root config
// ignores apps/**, so a changed file must be linted from the directory that
// owns its config — otherwise ESLint silently reports nothing for it.
// Returns Map<cwd, files relative to that cwd>, insertion-ordered.
export function groupFilesByEslintCwd(files) {
  const groups = new Map()
  for (const file of files) {
    const match = file.match(/^(apps\/[^/]+)\//)
    const cwd = match ? match[1] : '.'
    const rel = match ? file.slice(cwd.length + 1) : file
    if (!groups.has(cwd)) groups.set(cwd, [])
    groups.get(cwd).push(rel)
  }
  return groups
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lint-diff-lib.test.mjs`
Expected: PASS, all tests.

- [ ] **Step 5: Use the function in the script**

In `scripts/lint-diff.mjs`, change the import line:

```js
import { parseAddedLines, offendingMessages, groupFilesByEslintCwd } from './lint-diff-lib.mjs'
```

and replace the whole comment block plus grouping loop (lines 23–33, from `// Each workspace ships its own flat ESLint config.` through the closing `}` of the `for` loop) with:

```js
// Each workspace ships its own flat ESLint config, and ESLint resolves the
// config from its cwd — see groupFilesByEslintCwd.
const groups = groupFilesByEslintCwd(files)
```

- [ ] **Step 6: Verify the script still works end to end**

Run: `npm run lint:diff -- main`
Expected: exits 0 with `lint:diff — no new lint errors on changed lines` (Task 1 added no lint errors).

- [ ] **Step 7: Commit**

```bash
git add scripts/lint-diff-lib.mjs scripts/lint-diff-lib.test.mjs scripts/lint-diff.mjs
git commit -m "fix(scripts): route lint:diff files to any apps/* workspace config"
```

---

### Task 3: Scaffold the Expo app

**Files:**
- Create: `apps/mobile/**` (from the Expo template)
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Scaffold from the SDK 57 blank-typescript template**

```bash
cd /Users/anatolii/tonus/apps && npx --yes create-expo-app@latest mobile --template blank-typescript --no-install
```

`--no-install` matters: dependencies are installed once from the repo root so npm hoists them into the workspace.

Expected: `apps/mobile/` containing `App.tsx`, `app.json`, `index.ts`, `package.json`, `tsconfig.json`, `.gitignore`.

- [ ] **Step 2: Check what the template actually produced**

Run: `cat apps/mobile/package.json apps/mobile/app.json apps/mobile/.gitignore`

Confirm three things and note any deviation before continuing:
1. `package.json` has **no** `"type": "module"` key. If the template added one, delete it — `metro.config.js` is CommonJS and ESM mode breaks it.
2. `.gitignore` covers `ios/`, `android/`, `.expo/`, `dist/`. Add whichever is missing.
3. Dependency versions match the spec's table (`expo ~57.0.8`, `react 19.2.3`, `react-native 0.86.0`). If the template has moved on, keep the template's versions and update the spec instead of forcing stale pins.

- [ ] **Step 3: Rewrite package.json for the workspace**

Replace `apps/mobile/package.json` with (keeping any dependency the template added that is not listed here):

```json
{
  "name": "tonus-mobile",
  "private": true,
  "version": "0.0.0",
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0"
  },
  "dependencies": {
    "@tonus/shared": "*",
    "expo": "~57.0.8",
    "expo-dev-client": "~57.0.9",
    "expo-status-bar": "~57.0.1",
    "react": "^19.2.6",
    "react-native": "0.86.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.14",
    "eslint": "^10.3.0",
    "eslint-config-expo": "^57.0.0",
    "typescript": "~6.0.2"
  }
}
```

`react` and `typescript` deliberately match the web app rather than the SDK's exact pins so npm hoists one copy of each. `expo-doctor` will warn about that; it is expected — do not "fix" it with `expo install --fix`.

- [ ] **Step 4: Install from the repo root**

```bash
cd /Users/anatolii/tonus && npm install
```

Expected: completes without `ERESOLVE`. Takes several minutes on a cold cache.

- [ ] **Step 5: Verify the workspace chain resolved**

```bash
ls -l node_modules/tonus-mobile apps/mobile/node_modules/@tonus/shared 2>&1
node -p "require.resolve('react-native/package.json')"
```

Expected: both paths are symlinks into the repo; react-native resolves inside the root `node_modules` (hoisted).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile package.json package-lock.json
git commit -m "feat(mobile): scaffold Expo SDK 57 app in apps/mobile"
```

---

### Task 4: Point Metro at the monorepo

**Files:**
- Create: `apps/mobile/metro.config.js`

- [ ] **Step 1: Write the config**

Create `apps/mobile/metro.config.js`:

```js
// Monorepo wiring (https://docs.expo.dev/guides/monorepos/). Recent Expo SDKs
// detect npm workspaces on their own; this is explicit so resolution does not
// depend on that heuristic.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the whole repo: @tonus/shared ships raw TypeScript from packages/shared.
config.watchFolders = [monorepoRoot]
// npm hoists react-native and expo to the root; look there as well as locally.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

module.exports = config
```

- [ ] **Step 2: Verify Metro starts and resolves**

```bash
cd /Users/anatolii/tonus/apps/mobile && npx expo export --platform ios --output-dir /tmp/expo-export-check
```

Expected: exits 0 and writes a bundle. If it fails on an unresolved module, the paths above are wrong — fix them before moving on; this is the exact failure this phase exists to catch.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/metro.config.js
git commit -m "feat(mobile): configure Metro for the npm workspace layout"
```

---

### Task 5: The placeholder screen

**Files:**
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Write the screen**

Replace `apps/mobile/App.tsx` with:

```tsx
import { StatusBar } from 'expo-status-bar'
import { StyleSheet, Text, View } from 'react-native'
import { APP_NAME } from '@tonus/shared'

// Phase 2 scaffold: the only job of this screen is to render a value that
// came from the shared workspace package, proving Metro resolves it at
// runtime and not just at type level.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{APP_NAME}</Text>
      <Text style={styles.subtitle}>mobile skeleton</Text>
      <StatusBar style="auto" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
  },
})
```

- [ ] **Step 2: Set the app identity**

In `apps/mobile/app.json`, set these keys inside `expo` (leave everything else the template wrote):

```json
{
  "name": "Tonus",
  "slug": "tonus",
  "scheme": "tonus",
  "ios": {
    "bundleIdentifier": "com.tonus.app",
    "supportsTablet": false
  }
}
```

`scheme` is set now because changing it later forces another prebuild, and the auth phase will need it for deep links.

- [ ] **Step 3: Verify the shared value reaches the bundle**

```bash
cd /Users/anatolii/tonus/apps/mobile && npx expo export --platform ios --output-dir /tmp/expo-export-app
grep -rl "mobile skeleton" /tmp/expo-export-app
```

Expected: export exits 0 and grep prints at least one bundle path. An unresolved `@tonus/shared` would have failed the export outright.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/App.tsx apps/mobile/app.json
git commit -m "feat(mobile): render the shared APP_NAME on the placeholder screen"
```

---

### Task 6: Make the workspace lint

**Files:**
- Create: `apps/mobile/eslint.config.js`
- Modify: `package.json` (root, `lint` script)

- [ ] **Step 1: Write the flat config**

Create `apps/mobile/eslint.config.js` (CommonJS — this workspace is not ESM):

```js
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'ios/*', 'android/*', '.expo/*'] },
])
```

- [ ] **Step 2: Run it**

Run: `npm run -w tonus-mobile lint`
Expected: exits 0 with no output.

If `eslint-config-expo` turns out to be incompatible with ESLint 10 (it declares `eslint >=8.10`, which is open-ended and therefore untested against 10), do not fight it: replace the file with a minimal config mirroring `apps/web/eslint.config.js` — `js.configs.recommended` + `tseslint.configs.recommended` + `reactHooks.configs.flat.recommended`, same `no-unused-vars` options, `globalIgnores(['dist', 'ios', 'android', '.expo'])` — written as ESM only if you also add `"type": "module"` to the mobile package.json, which you must not. Keep it CommonJS. Record whichever path you took in the PR body.

- [ ] **Step 3: Delegate from the root lint script**

In root `package.json`, change the `lint` script to:

```json
"lint": "npm run -w tonus-web lint && npm run -w tonus-mobile lint && eslint . --max-warnings 0",
```

- [ ] **Step 4: Verify the whole repo still lints clean**

Run: `npm run lint`
Expected: exits 0. Zero warnings tolerated — this repo runs `--max-warnings 0` everywhere.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/eslint.config.js package.json
git commit -m "chore(mobile): self-lint the workspace and wire it into root lint"
```

---

### Task 7: CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the two steps**

In `.github/workflows/ci.yml`, insert directly after the `Build (tsc + vite)` step and before `E2E smoke (playwright)`:

```yaml
      # Mobile has no native build in CI (needs macOS runners, buys nothing for
      # a scaffold). These two steps cover what actually breaks: types, and
      # Metro's ability to resolve @tonus/shared through the workspace symlink.
      - name: Mobile typecheck
        run: npm run -w tonus-mobile typecheck

      - name: Mobile Metro export smoke
        working-directory: apps/mobile
        run: npx expo export --platform ios --output-dir "$RUNNER_TEMP/expo-export"
```

- [ ] **Step 2: Verify the typecheck command locally**

Run: `npm run -w tonus-mobile typecheck`
Expected: exits 0.

If it fails complaining about missing ambient types (`expo-env.d.ts`), generate it with `npx expo customize tsconfig.json` from `apps/mobile`, then decide: either commit `expo-env.d.ts` (removing it from `.gitignore`) or add its generation to the CI step. Prefer committing it — CI should not need a codegen step to typecheck.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck the mobile workspace and smoke-test the Metro export"
```

---

### Task 8: Full verification and PR

**Files:** none — this task only runs things.

- [ ] **Step 1: Run the whole repo gate**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test && npm run test:scripts && npm run lint && npm run build
```

Expected: all green. `npm run build` needs the dummy env the CI uses:

```bash
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=test-anon-key npm run build
```

- [ ] **Step 2: Confirm nothing web-facing moved**

Run: `git diff --stat main -- apps/web`
Expected: empty. Phase 2 must not touch the web app; the only shared change is the additive `APP_NAME` export.

- [ ] **Step 3: Native run — only if Xcode is installed**

Check first: `xcode-select -p` must print a path inside `/Applications/Xcode.app`, and `xcrun simctl list devices available` must list at least one iPhone.

If it does:

```bash
cd /Users/anatolii/tonus/apps/mobile && npx expo run:ios
```

Expected: prebuild + pod install + native build, then the app launches in the Simulator showing "Tonus / mobile skeleton". Capture a screenshot for the PR.

If Xcode is absent, skip this step and say so explicitly in the PR body — the export smoke from Task 5 is the substitute, and the simulator run moves to the next phase. Do not mark the phase as delivering a simulator run that never happened.

- [ ] **Step 4: Confirm the native directory stayed out of git**

Run: `git status --porcelain apps/mobile`
Expected: no `ios/` or `.expo/` entries. If they appear, fix `apps/mobile/.gitignore` before pushing.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin <branch>
```

PR body must state: what was verified, what was not (the simulator run, if Xcode was missing), and which ESLint config path Task 6 took.

---

## Self-review notes

- Spec coverage: shared smoke contract (Task 1), lint-diff and root lint corrections (Tasks 2, 6), scaffold with the `"type": "module"` and `.gitignore` gotchas (Task 3), Metro monorepo config (Task 4), CNG/`scheme` (Task 5), CI typecheck + export smoke (Task 7), Xcode precondition and the no-Xcode fallback (Task 8).
- Not covered on purpose: the Vercel `installCommand` mitigation stays unapplied until the PR's preview deploy shows it is needed, per the spec's risk section.
