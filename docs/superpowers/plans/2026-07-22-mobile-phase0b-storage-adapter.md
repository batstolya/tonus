# Mobile Phase 0b — Storage Adapter and Supabase Client Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove direct Web Storage / `navigator` access from shared-candidate lib modules (`demo.ts`, `privacy.ts`, `translate.ts`) behind a sync platform-adapter module, and turn the supabase singleton into a `createTonusClient(config)` factory with a web singleton facade — no behavior change on web.

**Architecture:** A new `src/lib/platform.ts` mirrors the Phase 0a env module: an `initPlatform()` store populated by platform wiring, plus facades `persistentStorage`, `ephemeralStorage` (sync `{get,set,remove}`) and `getDeviceLocale()`. Web wiring lives in `src/lib/platform.web.ts` (localStorage / sessionStorage / navigator, all exception-swallowing), imported from `src/main.tsx`. `supabase.ts` gains `createTonusClient(config)`; the existing lazy Proxy singleton stays as the web facade and now delegates to the factory.

**Tech Stack:** TypeScript, Vitest (node + jsdom projects), supabase-js, Vite. Node 24 required for all commands.

**Spec:** `docs/superpowers/specs/2026-07-19-mobile-phase0b-storage-adapter-design.md`

## File structure

- Create `src/lib/platform.ts` — adapter interface, fail-fast store, facades, `createInMemoryStorage()` (used by tests now, mobile ephemeral scope later).
- Create `src/lib/platform.web.ts` — the ONLY `src/lib` file touching `localStorage`/`sessionStorage`/`navigator`; calls `initPlatform` at import (same shape as `env.web.ts`).
- Create `src/lib/platform.test.ts` — in-memory adapter tests: demo flag, PIN unlock, language-detection fallbacks.
- Modify `src/lib/demo.ts`, `src/lib/privacy.ts`, `src/lib/translate.ts` — switch to adapter/hooks; comments mentioning localStorage reworded (exit-criterion grep is comment-blind).
- Modify `src/lib/i18n.tsx` — `setLang` writes via `persistentStorage` (same key `detectLang` reads; keeps web behavior, one-line diff).
- Modify `src/lib/supabase.ts` — add `createTonusClient(config)`; lazy singleton delegates to it.
- Modify `src/main.tsx` — import `./lib/platform.web` after `./lib/env.web`.
- Modify `vitest.env-setup.ts` — wire platform for both projects: jsdom keeps real web storage (component tests seed `localStorage` directly); node overrides with in-memory + fixed `'en-GB'` locale (Node 24 ships a real `navigator.language`, which would make node tests machine-locale-dependent).
- Modify `src/lib/supabase.test.ts` — add a factory test.

Decisions locked in:

- **Storage exceptions are swallowed in the implementations** (web wiring), not at call sites — `privacy.ts` drops its per-call try/catch.
- **The singleton stays lazily constructed inside `supabase.ts`** (Proxy on first property access) rather than eagerly in `main.tsx`: eager construction at entry is exactly what broke prod in Phase 0a (Rollup chunk-hoisting, see comment in `supabase.ts` and `supabase.test.ts`). "Constructed in web wiring" is satisfied via the env module the wiring populates.
- **Fail-fast when uninitialized**, mirroring `env.ts`: no storage call happens at module load anywhere in `src/lib`, so wiring order is safe.

### Task 1: Platform module with in-memory adapter tests

**Files:**
- Create: `src/lib/platform.ts`
- Create: `src/lib/platform.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/platform.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initPlatform, createInMemoryStorage, persistentStorage, ephemeralStorage, getDeviceLocale } from './platform'
import { isDemoActive, enableDemo, disableDemo } from './demo'
import { isUnlocked, lock } from './privacy'
import { detectLang } from './translate'

function initInMemory(locale = 'en-GB') {
  initPlatform({
    persistentStorage: createInMemoryStorage(),
    ephemeralStorage: createInMemoryStorage(),
    getDeviceLocale: () => locale,
  })
}

describe('platform module', () => {
  beforeEach(() => initInMemory())

  it('fails fast when used before initialization', async () => {
    vi.resetModules()
    const fresh = await import('./platform')
    expect(() => fresh.persistentStorage.get('x')).toThrow(/initPlatform/)
    expect(() => fresh.getDeviceLocale()).toThrow(/initPlatform/)
  })

  it('in-memory storage round-trips and scopes are independent', () => {
    persistentStorage.set('k', 'v')
    expect(persistentStorage.get('k')).toBe('v')
    expect(ephemeralStorage.get('k')).toBeNull()
    persistentStorage.remove('k')
    expect(persistentStorage.get('k')).toBeNull()
  })

  it('exposes the injected device locale', () => {
    initInMemory('uk-UA')
    expect(getDeviceLocale()).toBe('uk-UA')
  })
})

describe('demo flag over the adapter', () => {
  beforeEach(() => initInMemory())

  it('toggles via persistent storage', () => {
    expect(isDemoActive()).toBe(false) // env demo=false in vitest.env-setup.ts
    enableDemo()
    expect(isDemoActive()).toBe(true)
    disableDemo()
    expect(isDemoActive()).toBe(false)
  })
})

describe('PIN unlock over the adapter', () => {
  beforeEach(() => initInMemory())

  it('is locked by default and reads the ephemeral scope', () => {
    expect(isUnlocked()).toBe(false)
    ephemeralStorage.set('tonus_privacy_unlocked', '1')
    expect(isUnlocked()).toBe(true)
    lock()
    expect(isUnlocked()).toBe(false)
  })
})

describe('language detection fallbacks', () => {
  it('uses a saved supported language', () => {
    initInMemory('de-DE')
    persistentStorage.set('lang', 'uk')
    expect(detectLang()).toBe('uk')
  })

  it('treats legacy saved ru as English', () => {
    initInMemory('uk-UA')
    persistentStorage.set('lang', 'ru')
    expect(detectLang()).toBe('en')
  })

  it('falls back to the device locale', () => {
    initInMemory('uk-UA')
    expect(detectLang()).toBe('uk')
  })

  it('defaults to English for unsupported locales', () => {
    initInMemory('de-DE')
    expect(detectLang()).toBe('en')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run --project node src/lib/platform.test.ts`
Expected: FAIL — cannot resolve `./platform`.

- [ ] **Step 3: Implement `src/lib/platform.ts`**

```typescript
// Platform hooks for shared-candidate lib code (mobile monorepo Phase 0b).
// Mirrors env.ts: platform wiring (web: platform.web.ts, tests:
// vitest.env-setup.ts, mobile later: mmkv/expo-localization) must call
// initPlatform() before lib code runs. Web Storage and navigator must not
// be touched anywhere else in src/lib — React Native has neither.

/** Synchronous key-value storage; implementations swallow storage errors. */
export interface KeyValueStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export interface PlatformAdapters {
  /** Survives restarts (web: localStorage; mobile later: mmkv). */
  persistentStorage: KeyValueStorage
  /** Lives until the session ends (web: sessionStorage / tab; mobile later: in-memory / app restart). */
  ephemeralStorage: KeyValueStorage
  /** BCP-47 device locale (web: navigator.language; mobile later: expo-localization). */
  getDeviceLocale: () => string
}

let current: PlatformAdapters | null = null

export function initPlatform(adapters: PlatformAdapters): void {
  current = adapters
}

function getPlatform(): PlatformAdapters {
  if (!current) {
    throw new Error('Platform is not initialized: call initPlatform() from the platform entry before using lib code')
  }
  return current
}

// Facades delegate on every call so lib modules can import them at module
// load while wiring happens later (same lazy pattern as supabase.ts).
export const persistentStorage: KeyValueStorage = {
  get: key => getPlatform().persistentStorage.get(key),
  set: (key, value) => { getPlatform().persistentStorage.set(key, value) },
  remove: key => { getPlatform().persistentStorage.remove(key) },
}

export const ephemeralStorage: KeyValueStorage = {
  get: key => getPlatform().ephemeralStorage.get(key),
  set: (key, value) => { getPlatform().ephemeralStorage.set(key, value) },
  remove: key => { getPlatform().ephemeralStorage.remove(key) },
}

export function getDeviceLocale(): string {
  return getPlatform().getDeviceLocale()
}

/** Test wiring today; becomes the mobile ephemeral scope in Phase 2. */
export function createInMemoryStorage(): KeyValueStorage {
  const store = new Map<string, string>()
  return {
    get: key => store.get(key) ?? null,
    set: (key, value) => { store.set(key, value) },
    remove: key => { store.delete(key) },
  }
}
```

- [ ] **Step 4: Tests still fail only on call sites** — demo/privacy/translate still use Web Storage directly, so the demo/PIN/language tests fail under node (Task 2 fixes them). The `platform module` describe block must pass now.

- [ ] **Step 5: Commit**

```bash
git add src/lib/platform.ts src/lib/platform.test.ts
git commit -m "feat(lib): add platform adapter module with in-memory storage"
```

### Task 2: Switch demo, privacy, translate, i18n to the adapter

**Files:**
- Modify: `src/lib/demo.ts`, `src/lib/privacy.ts`, `src/lib/translate.ts`, `src/lib/i18n.tsx`
- Create: `src/lib/platform.web.ts`
- Modify: `src/main.tsx`, `vitest.env-setup.ts`

- [ ] **Step 1: `src/lib/platform.web.ts`**

```typescript
// Web wiring: the ONLY src/lib file allowed to touch Web Storage and
// navigator. Imported for its side effect from src/main.tsx (after
// env.web.ts) and from vitest.env-setup.ts.
import { initPlatform, type KeyValueStorage } from './platform'

// Swallow storage errors (private browsing, storage disabled, non-browser
// runtimes) — reads degrade to null, writes to no-ops.
function webStorage(getStore: () => Storage): KeyValueStorage {
  return {
    get(key) { try { return getStore().getItem(key) } catch { return null } },
    set(key, value) { try { getStore().setItem(key, value) } catch { /* ignore */ } },
    remove(key) { try { getStore().removeItem(key) } catch { /* ignore */ } },
  }
}

initPlatform({
  persistentStorage: webStorage(() => localStorage),
  ephemeralStorage: webStorage(() => sessionStorage),
  getDeviceLocale: () => { try { return navigator.language } catch { return 'en' } },
})
```

- [ ] **Step 2: `src/main.tsx`** — add `import './lib/platform.web'` directly after `import './lib/env.web'`.

- [ ] **Step 3: `vitest.env-setup.ts`** — append after `initEnv(...)` (the `platform.web` import is hoisted; the node override runs after and wins):

```typescript
import './src/lib/platform.web'
import { initPlatform, createInMemoryStorage } from './src/lib/platform'

// jsdom keeps the real web wiring so component tests can seed localStorage
// directly. The node project has no Web Storage, and Node 24 ships a real
// navigator.language — pin an in-memory/en-GB platform for determinism.
if (typeof localStorage === 'undefined') {
  initPlatform({
    persistentStorage: createInMemoryStorage(),
    ephemeralStorage: createInMemoryStorage(),
    getDeviceLocale: () => 'en-GB',
  })
}
```

- [ ] **Step 4: `src/lib/demo.ts`** — full new content:

```typescript
// Demo mode: the app on generated data, no signup and no Supabase.
// Enabled by the landing "Посмотреть демо" button (persistent storage) or
// VITE_DEMO=1 for development.
import { getEnv } from './env'
import { persistentStorage } from './platform'

const DEMO_KEY = 'tonus_demo'

export function isDemoActive(): boolean {
  return getEnv().demo || persistentStorage.get(DEMO_KEY) === '1'
}

export function enableDemo() {
  persistentStorage.set(DEMO_KEY, '1')
}

export function disableDemo() {
  persistentStorage.remove(DEMO_KEY)
}
```

- [ ] **Step 5: `src/lib/privacy.ts`** — replace the sessionStorage call sites (storage errors are swallowed by the adapter implementations now, so the per-call try/catch goes away):

```typescript
import { ephemeralStorage } from './platform'
```

```typescript
// Unlock lives until the platform session ends (web: sessionStorage / tab close)
export function isUnlocked(): boolean {
  return ephemeralStorage.get(UNLOCK_KEY) === '1'
}

export function lock(): void {
  ephemeralStorage.remove(UNLOCK_KEY)
}
```

and in `unlock()` / `setPin()`: `ephemeralStorage.set(UNLOCK_KEY, '1')` (no try/catch). Update the stale `privacy.test.ts` describe name `isUnlocked / isMasked (node: sessionStorage недоступен)` → `isUnlocked / isMasked (in-memory platform)` and the first test name → `locked until unlocked`.

- [ ] **Step 6: `src/lib/translate.ts`** — `detectLang` and the `translateStandalone` comment:

```typescript
import { persistentStorage, getDeviceLocale } from './platform'
```

```typescript
export function detectLang(): Lang {
  const saved = persistentStorage.get('lang') as Lang | null
  // 'ru' is no longer selectable — a legacy saved value is treated as English.
  if (saved === 'uk' || saved === 'en') return saved
  const nav = getDeviceLocale().slice(0, 2)
  if (nav === 'uk') return 'uk'
  return 'en'
}
```

```typescript
// Translation outside React: the language comes from the same persistent
// storage the provider writes, so the two never diverge.
```

- [ ] **Step 7: `src/lib/i18n.tsx`** — `setLang` writes through the adapter (same key `detectLang` reads):

```typescript
import { persistentStorage } from './platform'
```

```typescript
const setLang = useCallback((l: Lang) => {
  persistentStorage.set('lang', l)
  setLangState(l)
}, [])
```

- [ ] **Step 8: Run the full suite**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test`
Expected: PASS, both projects (platform.test.ts now fully green; jsdom component tests still green on real localStorage).

- [ ] **Step 9: Commit**

```bash
git add src/lib/platform.web.ts src/lib/demo.ts src/lib/privacy.ts src/lib/privacy.test.ts src/lib/translate.ts src/lib/i18n.tsx src/main.tsx vitest.env-setup.ts
git commit -m "refactor(lib): route storage and locale access through platform adapter"
```

### Task 3: Supabase client factory

**Files:**
- Modify: `src/lib/supabase.ts`, `src/lib/supabase.test.ts`

- [ ] **Step 1: Add a failing factory test** to `src/lib/supabase.test.ts`:

```typescript
it('createTonusClient builds an independent client from explicit config', async () => {
  vi.resetModules()
  const { createTonusClient } = await import('./supabase')
  const client = createTonusClient({ url: 'http://localhost:54321', anonKey: 'test-anon-key' })
  expect(client.auth).toBeDefined()
})
```

Run: `npx vitest run --project node src/lib/supabase.test.ts` — Expected: FAIL (`createTonusClient` not exported).

- [ ] **Step 2: Implement in `src/lib/supabase.ts`** (singleton construction now delegates to the factory; the lazy Proxy stays — see the chunk-order regression comment):

```typescript
import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getEnv } from './env'

export interface TonusClientConfig {
  url: string
  anonKey: string
  /** supabase-js options (auth storage, detectSessionInUrl, ...) — the mobile app injects its own. */
  options?: SupabaseClientOptions<'public'>
}

/** Platform-agnostic factory (mobile Phase 0b). The web singleton below uses it with env config. */
export function createTonusClient(config: TonusClientConfig): SupabaseClient<Database> {
  return createClient<Database>(config.url, config.anonKey, config.options)
}

let client: SupabaseClient<Database> | null = null

function instance(): SupabaseClient<Database> {
  if (!client) {
    const { supabaseUrl, supabaseAnonKey } = getEnv()
    client = createTonusClient({ url: supabaseUrl, anonKey: supabaseAnonKey })
  }
  return client
}
```

(The existing Proxy export and its comments stay unchanged; the module comment's "Becomes an explicit factory in mobile Phase 0b" sentence is dropped.)

- [ ] **Step 3: Run** `npx vitest run --project node src/lib/supabase.test.ts` — Expected: PASS (all 3).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts src/lib/supabase.test.ts
git commit -m "refactor(lib): extract createTonusClient factory behind the web singleton"
```

### Task 4: Exit-criteria verification

- [ ] **Step 1: Grep** — `grep -rnE '\b(localStorage|sessionStorage|navigator)\b' src/lib --include='*.ts' | grep -v test | grep -v translations/` → only `src/lib/platform.web.ts` lines.
- [ ] **Step 2:** `npm test` → both projects green.
- [ ] **Step 3:** `npm run build` → green.
- [ ] **Step 4:** `npm run lint` → green (zero warnings).
- [ ] **Step 5:** `export PATH="$HOME/.deno/bin:$PATH" && npm run check:functions` → green.
- [ ] **Step 6: Commit the plan doc** and squash-view the branch history; final commit message follows conventional commits.
