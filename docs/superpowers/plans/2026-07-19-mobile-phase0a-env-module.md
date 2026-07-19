# Phase 0a — Env Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all `import.meta.env` access in `src/lib` into one initialized-once env module so the lib code becomes portable to React Native (Metro has no `import.meta.env`).

**Architecture:** `src/lib/env.ts` holds a typed store with `initEnv()`/`getEnv()` and fails fast when read uninitialized. `src/lib/env.web.ts` is the only file reading `import.meta.env`; it is imported first in `src/main.tsx`. Tests initialize the store via a shared setup file for both vitest projects. The six consumer files switch to `getEnv()`; all reads become lazy (inside functions) except `supabase.ts`, whose module-load `createClient` is acceptable because both entry paths (web wiring, test setup) initialize the store before lib imports. Spec: `docs/superpowers/specs/2026-07-19-mobile-phase0a-env-module-design.md`.

**Tech Stack:** TypeScript, Vite, vitest (two projects: node + jsdom). Everything runs on Node 24 (`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`).

**Repo rules:** commits/code/comments in English; comment density matches surrounding code (this repo comments the "why", in Russian in legacy files — new files use English). `npm run lint` must pass with zero warnings. Branch off `main`; PR at the end (main is branch-protected; repo ruleset also requires the PR branch to be up to date with main before merge).

---

### Task 1: env module with fail-fast store

**Files:**
- Create: `src/lib/env.ts`
- Test: `src/lib/env.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/env.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The shared vitest setup initializes the env store for all other suites.
// Here we test the uninitialized state, so we need a fresh module instance.
async function freshEnv() {
  vi.resetModules()
  return await import('./env')
}

describe('env module', () => {
  beforeEach(() => { vi.resetModules() })

  it('fails fast when read before initialization', async () => {
    const { getEnv } = await freshEnv()
    expect(() => getEnv()).toThrow(/initEnv/)
  })

  it('returns the initialized values', async () => {
    const { initEnv, getEnv } = await freshEnv()
    initEnv({ supabaseUrl: 'http://x', supabaseAnonKey: 'k', demo: true, googleClientId: undefined })
    expect(getEnv().supabaseUrl).toBe('http://x')
    expect(getEnv().demo).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project node src/lib/env.test.ts`
Expected: FAIL — `Cannot find module './env'` (or equivalent resolution error).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/env.ts
// Single source of runtime configuration for shared-candidate lib code.
// Platform wiring (web: env.web.ts, tests: vitest.env-setup.ts, mobile later)
// must call initEnv() before any lib module is imported; import.meta.env
// must not be read anywhere else in src/lib — Metro (React Native) has no
// import.meta.env, so direct reads break portability.

export interface TonusEnv {
  supabaseUrl: string
  supabaseAnonKey: string
  /** Build-time demo flag (VITE_DEMO=1); the runtime toggle lives in demo.ts. */
  demo: boolean
  googleClientId: string | undefined
}

let current: TonusEnv | null = null

export function initEnv(env: TonusEnv): void {
  current = env
}

export function getEnv(): TonusEnv {
  if (!current) {
    throw new Error('Env is not initialized: call initEnv() from the platform entry before importing lib code')
  }
  return current
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project node src/lib/env.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts src/lib/env.test.ts
git commit -m "feat(lib): add env module with fail-fast initialization

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: platform wiring — web entry and vitest setup

**Files:**
- Create: `src/lib/env.web.ts`
- Create: `vitest.env-setup.ts`
- Modify: `src/main.tsx` (add first import)
- Modify: `vitest.config.ts` (replace `env` injection with the setup file)

- [ ] **Step 1: Create the web wiring**

```ts
// src/lib/env.web.ts
// The ONLY place in src/ that reads import.meta.env. Imported first from
// src/main.tsx so the store is populated before any lib module loads.
import { initEnv } from './env'

initEnv({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  demo: import.meta.env.VITE_DEMO === '1',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
})
```

- [ ] **Step 2: Import it first in `src/main.tsx`**

The current file starts with:

```tsx
import { StrictMode } from 'react'
```

Add ABOVE that line (ES imports evaluate in order, so this runs before App and its lib imports):

```tsx
import './lib/env.web'
```

- [ ] **Step 3: Create the test wiring**

```ts
// vitest.env-setup.ts
// Env for both vitest projects (node + jsdom). Replaces the former
// import.meta.env injection in vitest.config.ts: src/lib reads env only
// through the env module now. demo:false — tests must never run in demo
// mode (the demo stub would replace mocked network calls).
import { initEnv } from './src/lib/env'

initEnv({
  supabaseUrl: 'http://localhost:54321',
  supabaseAnonKey: 'test-anon-key',
  demo: false,
  googleClientId: undefined,
})
```

- [ ] **Step 4: Wire it into `vitest.config.ts`**

Replace the whole config body so the `env` object is gone and both projects get the setup file. Resulting file:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// scripts/*.test.mjs are node:test suites (run via `npm run test:scripts`), not Vitest.
// .claude/** keeps agent worktrees from duplicating the suite when run from the repo root.
const exclude = ['**/node_modules/**', 'e2e/**', 'scripts/**', '.claude/**']

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude,
          setupFiles: ['./vitest.env-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude,
          setupFiles: ['./vitest.env-setup.ts', './vitest.setup.ts'],
        },
      },
    ],
  },
})
```

Note: the old `env` injection kept `VITE_SUPABASE_URL` alive for
`src/lib/supabase.ts`'s module-load `createClient`. That consumer still reads
`import.meta.env` until Task 3, and the injected values are now gone — so
**run the full suite only after Task 3**; at this step run just the env test.

- [ ] **Step 5: Verify the env test still passes**

Run: `npx vitest run --project node src/lib/env.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/env.web.ts vitest.env-setup.ts src/main.tsx vitest.config.ts
git commit -m "feat(lib): wire env module into web entry and vitest setup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: migrate supabase.ts, edgeFunctions.ts, chat.ts

**Files:**
- Modify: `src/lib/supabase.ts`
- Modify: `src/lib/edgeFunctions.ts:23` and the fetch call using `BASE`
- Modify: `src/lib/chat.ts:71-72`

- [ ] **Step 1: `src/lib/supabase.ts`** — replace the two `import.meta.env` lines:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getEnv } from './env'

// Module-load read: both entries (env.web.ts, vitest.env-setup.ts) run
// initEnv() before lib modules load. Becomes a factory in Phase 0b.
const { supabaseUrl, supabaseAnonKey } = getEnv()

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 2: `src/lib/edgeFunctions.ts`** — delete line `const BASE = import.meta.env.VITE_SUPABASE_URL as string`, add `import { getEnv } from './env'` to the imports, and inside `callFunction` change the fetch URL line from `` `${BASE}/functions/v1/${name}` `` to:

```ts
  const res = await fetch(`${getEnv().supabaseUrl}/functions/v1/${name}`, {
```

- [ ] **Step 3: `src/lib/chat.ts`** — add `import { getEnv } from './env'`, replace:

```ts
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
```

with:

```ts
  const { supabaseUrl, supabaseAnonKey } = getEnv()
```

- [ ] **Step 4: Run the full unit suite**

Run: `npm test`
Expected: all green — the setup file now provides what the removed config `env` used to.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts src/lib/edgeFunctions.ts src/lib/chat.ts
git commit -m "refactor(lib): read supabase config via env module

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 4: migrate demo.ts, autosync.ts, googleCalendar.ts

**Files:**
- Modify: `src/lib/demo.ts:6`
- Modify: `src/lib/autosync.ts:35`
- Modify: `src/lib/googleCalendar.ts` (module const → lazy helper, 5 usages)

- [ ] **Step 1: `src/lib/demo.ts`** — add `import { getEnv } from './env'`, change `isDemoActive`:

```ts
export function isDemoActive(): boolean {
  return getEnv().demo || localStorage.getItem(DEMO_KEY) === '1'
}
```

- [ ] **Step 2: `src/lib/autosync.ts`** — add `import { getEnv } from './env'`, change `webhookUrl`:

```ts
export function webhookUrl(token: string): string {
  return `${getEnv().supabaseUrl}/functions/v1/ingest-health?token=${token}`
}
```

- [ ] **Step 3: `src/lib/googleCalendar.ts`** — add `import { getEnv } from './env'`, replace the module-level `const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined` with a lazy helper (module-load reads would race initEnv for web-only files kept out of the entry chain):

```ts
const clientId = () => getEnv().googleClientId
```

Then update the five usages (lines ~10, 26, 32, 52, 62): `!!CLIENT_ID` → `!!clientId()`, `if (!CLIENT_ID)` → `if (!clientId())`, `client_id: CLIENT_ID` → `client_id: clientId()`, `client_id: CLIENT_ID!` → `client_id: clientId()!`.

- [ ] **Step 4: Run suite, lint, build**

Run: `npm test && npm run lint && npm run build`
Expected: all green, zero lint warnings.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo.ts src/lib/autosync.ts src/lib/googleCalendar.ts
git commit -m "refactor(lib): read demo flag, webhook base and Google client id via env module

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 5: exit-criteria verification

- [ ] **Step 1: Spec exit criterion — no `import.meta` left in lib**

Run: `grep -rn 'import\.meta' src/lib --include='*.ts' --include='*.tsx' | grep -v env.web.ts`
Expected: no output. (`src/lib/env.web.ts` is the sanctioned web wiring.)

- [ ] **Step 2: Full local gate**

Run: `npm test && npm run lint && npm run build && npm run check:functions`
(deno needs `export PATH="$HOME/.deno/bin:$PATH"`.)
Expected: everything green.

- [ ] **Step 3: Demo-mode smoke (behavior unchanged)**

Run the dev server (see `running-tonus` skill: temp `.env.local` with dummy Supabase values) and verify the landing renders and «Посмотреть демо» opens the demo dashboard — this exercises `env.web.ts` init order and `isDemoActive()` at runtime.

### Task 6: PR

- [ ] Push the branch, open a PR titled `refactor(lib): centralize env access into env module (mobile phase 0a)`, body referencing `docs/superpowers/specs/2026-07-19-mobile-phase0a-env-module-design.md`, ending with the standard generated-with footer. Wait for CI, merge (squash). If merge is rejected as "not up to date with base", run `gh pr update-branch`, wait for CI again, then merge.
