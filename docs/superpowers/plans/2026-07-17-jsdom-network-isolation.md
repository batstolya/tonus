# jsdom Network Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The vitest jsdom project can never touch the network — an inert Supabase client mock plus a global fetch stub in `vitest.setup.ts` kill the teardown-race flake class (#93) for every current and future component test.

**Architecture:** `vitest.setup.ts` (loaded only by the jsdom project) registers a `vi.mock` for `src/lib/supabase` whose client is a chainable thenable (every method returns the chain, `await` resolves `{ data: null, error: null, count: null }`) with special-cased `auth`/`channel` surfaces, and stubs `globalThis.fetch` with an inert 200 response. A guard test locks the contract. Per-test `vi.mock('…/lib/api/<feature>')` calls continue to work on top.

**Tech Stack:** vitest 3 (projects: node + jsdom), @testing-library/react, TypeScript strict, eslint `--max-warnings 0`.

Spec: `docs/superpowers/specs/2026-07-17-jsdom-network-isolation-design.md`.

**Environment:** Node 24 required — `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`. Run tests with `VITE_DEMO=` prefix if `.env.local` sets demo mode.

---

### Task 1: Guard test (RED)

**Files:**
- Create: `src/test/network-isolation.test.tsx`

- [ ] **Step 1: Write the failing guard test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'

// Contract for the jsdom-only network isolation layer in vitest.setup.ts.
// Component tests must never reach the network; this test locks that in.

type ChainResult = { data: unknown; error: unknown; count: unknown }
type Chain = PromiseLike<ChainResult> & { [method: string]: (...args: unknown[]) => Chain }
const sb = supabase as unknown as {
  from(table: string): Chain
  rpc(fn: string): Chain
  auth: { getSession(): Promise<{ data: { session: unknown }; error: unknown }> }
}

describe('jsdom network isolation', () => {
  it('stubs global fetch with an inert mock', async () => {
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true)
    const res = await fetch('http://example.invalid/anything')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('resolves any supabase query chain to the inert shape', async () => {
    const result = await sb.from('anything').select('*').eq('user_id', 'x').order('day')
    expect(result).toEqual({ data: null, error: null, count: null })
  })

  it('resolves rpc calls to the inert shape', async () => {
    expect(await sb.rpc('whatever')).toEqual({ data: null, error: null, count: null })
  })

  it('resolves a null session without throwing', async () => {
    const { data } = await sb.auth.getSession()
    expect(data.session).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `VITE_DEMO= npx vitest run --project jsdom src/test/network-isolation.test.tsx`
Expected: FAIL — first test fails on `vi.isMockFunction(globalThis.fetch)` being `false` (real client, real fetch). Assertion order matters: the fetch-mock check runs first so the RED run never actually awaits a real network call from `from()` before failing.

### Task 2: Isolation layer in vitest.setup.ts (GREEN)

**Files:**
- Modify: `vitest.setup.ts` (append after the existing `vi.mock('motion/react', …)` block)

- [ ] **Step 1: Append the supabase mock and fetch stub**

```ts
// ---------------------------------------------------------------------------
// Network isolation: the jsdom project never touches the network. Real
// requests from mount effects used to resolve after jsdom teardown and fail
// unrelated tests (#93). Tests that need data still vi.mock their api module;
// this is the inert safety net underneath.
// ---------------------------------------------------------------------------

const inertResult = { data: null, error: null, count: null }

// Chainable thenable: every method returns the chain, `await` resolves inert.
function chain(): unknown {
  const proxy: unknown = new Proxy(() => proxy, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => Promise.resolve(inertResult).then(resolve)
      }
      return () => proxy
    },
    apply: () => proxy,
  })
  return proxy
}

vi.mock('./src/lib/supabase', () => ({
  supabase: {
    from: () => chain(),
    rpc: () => chain(),
    storage: { from: () => chain() },
    functions: { invoke: async () => inertResult },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      signOut: async () => ({ error: null }),
    },
    channel: () => chain(),
    removeChannel: () => {},
  },
}))

// Direct fetch sites (geocoding, food search, callFunction) get an inert 200.
vi.stubGlobal('fetch', vi.fn(async () =>
  new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
))
```

Note: the `vi.mock` specifier is `./src/lib/supabase` because vitest resolves it relative to this setup file (repo root); it registers the mock for the whole jsdom project, so every importer of `src/lib/supabase` gets the inert client.

- [ ] **Step 2: Run the guard test to verify it passes**

Run: `VITE_DEMO= npx vitest run --project jsdom src/test/network-isolation.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add src/test/network-isolation.test.tsx vitest.setup.ts
git commit -m "test: isolate jsdom project from the network

Inert chainable Supabase client mock + global fetch stub in
vitest.setup.ts; guard test locks the contract. Kills the
teardown-race flake class (#93) for all component tests."
```

### Task 3: Full jsdom suite — absorb fallout

The inert mock resolves immediately (microtask), so components without local api
mocks now reach their empty/error states faster than the old hanging request.
Tests asserting loading spinners, or components whose `callFunction` now throws
a deterministic `EdgeFunctionError(401)`, may newly fail.

- [ ] **Step 1: Run the whole jsdom project**

Run: `VITE_DEMO= npx vitest run --project jsdom`
Expected: all pass. If a test fails:
- Failure shape "cannot read … of null" or wrong rendered state → the component
  under test needs its api module mocked locally in that test file, same pattern
  as `src/components/dashboard/StreakMenu.test.tsx` (see #93):
  `vi.mock('../../lib/api/<feature>', () => ({ loadX: vi.fn().mockResolvedValue([]) }))`.
- Unhandled `EdgeFunctionError` → the mounting test must mock
  `src/lib/edgeFunctions` (`callFunction: vi.fn().mockResolvedValue({})`).
Fix only test files; do not change components.

- [ ] **Step 2: Run the node project untouched-check**

Run: `VITE_DEMO= npx vitest run --project node`
Expected: all pass unchanged (setup file is jsdom-only; `src/lib/api/*.test.ts`
recording-chain mocks are unaffected).

- [ ] **Step 3: Commit any test fixes**

```bash
git add -A src
git commit -m "test: local api mocks for tests newly surfaced by network isolation"
```

(Skip if Step 1 was green with no changes.)

### Task 4: Full gate, PR, merge

- [ ] **Step 1: Full gate**

Run: `VITE_DEMO= npm test && npm run build && npm run lint`
Expected: all suites pass, tsc+vite build clean, eslint zero errors/warnings.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin jsdom-network-isolation
gh pr create --title "test(infra): jsdom network isolation — inert supabase mock + fetch stub" --body "..."
```

PR body: problem (per-test mocking is forgettable, #93 flake class), decision
(infrastructure-level isolation per spec `docs/superpowers/specs/2026-07-17-jsdom-network-isolation-design.md`),
proof (guard test + full green gate). End with the standard generated-with footer.

- [ ] **Step 3: Watch CI and merge**

Run: `sleep 45 && gh pr checks --watch` then `gh pr merge --squash --delete-branch`
Expected: CI green (tests, build, e2e, deno ceiling), squash-merged; main CI
triggers the Vercel hook (frontend-only change, no edge fn redeploy needed —
`vitest.setup.ts` and `src/test/` don't ship to prod at all).
