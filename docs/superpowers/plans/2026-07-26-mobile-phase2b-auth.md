# Mobile Phase 2b — Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The mobile app signs a user in against the same Supabase project as the web app, keeps the session across restarts and backgrounding, and can be opened with no backend at all (demo mode).

**Architecture:** Four client-only modules (`env`, `platform`, the Supabase factory, `demo`) move from `apps/web/src/lib` into `packages/shared` behind re-export facades — the migration pattern Phase 1 established — and the mobile app then wires its own platform implementations into them. The Supabase session lives in the iOS Keychain via `expo-secure-store`; app preferences live in MMKV.

**Tech Stack:** Expo SDK 57, supabase-js v2, `expo-secure-store`, `react-native-mmkv`, `expo-linking`, vitest.

**Spec:** `docs/superpowers/specs/2026-07-25-mobile-phase2b-auth-design.md` (approved 2026-07-26)

---

## Environment

Every command needs Node 24:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
```

## Ship this as two PRs

**PR A (Tasks 1–4): the shared migration.** Pure refactor, zero behaviour
change, fully covered by the existing web suite. Land and merge it on its own —
if it breaks anything, it breaks the web app, and you want that isolated from
mobile noise.

**PR B (Tasks 5–12): the mobile auth app.** Nothing in it touches web code.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/shared/src/env.ts` | Moved from web. Runtime config store (`initEnv`/`getEnv`). |
| `packages/shared/src/platform.ts` | Moved from web. Storage/locale adapter interface and lazy facades. |
| `packages/shared/src/supabaseFactory.ts` | Moved from web (`createTonusClient` only). |
| `packages/shared/src/demo.ts` | Moved from web. Demo flag read/write. |
| `apps/web/src/lib/{env,platform,demo}.ts` | Become one-line re-export facades. |
| `apps/web/src/lib/supabase.ts` | Keeps the web singleton Proxy; imports the factory from shared. |
| `apps/web/src/lib/{env.web,platform.web}.ts` | Unchanged — web wiring stays in web. |
| `apps/mobile/src/platform.native.ts` | MMKV implementations of the adapter interface. |
| `apps/mobile/src/env.native.ts` | Reads `EXPO_PUBLIC_*`, calls `initEnv`. |
| `apps/mobile/src/supabase.ts` | The mobile client: SecureStore auth storage, AppState refresh. |
| `apps/mobile/src/useAuth.ts` | Session state hook for the app shell. |
| `apps/mobile/src/screens/AuthScreen.tsx` | Sign in / sign up. |
| `apps/mobile/src/screens/ResetRequestScreen.tsx` | "Send me a reset email". |
| `apps/mobile/src/screens/ResetPasswordScreen.tsx` | New password, reached by deep link. |
| `apps/mobile/App.tsx` | Routes between the screens on auth state. |

---

# PR A — move the shared modules

### Task 1: Move `env` into `@tonus/shared`

**Files:**
- Create: `packages/shared/src/env.ts`
- Modify: `apps/web/src/lib/env.ts` (becomes a facade)
- Modify: `packages/shared/src/index.ts`
- Test: `apps/web/src/lib/env.test.ts` stays where it is and must keep passing unchanged — that is the proof the facade is transparent.

- [ ] **Step 1: Copy the module verbatim**

`git mv apps/web/src/lib/env.ts packages/shared/src/env.ts`, then in the moved file change nothing except the header comment's first line to:

```ts
// Single source of runtime configuration for cross-client code.
// Platform wiring (web: apps/web/src/lib/env.web.ts, mobile:
// apps/mobile/src/env.native.ts, tests: vitest.env-setup.ts) must call
// initEnv() before any consumer is imported; import.meta.env must not be read
// anywhere else — Metro (React Native) has no import.meta.env.
```

- [ ] **Step 2: Export it from the package index**

Add to `packages/shared/src/index.ts`:

```ts
export { initEnv, getEnv } from './env'
export type { TonusEnv } from './env'
```

- [ ] **Step 3: Leave a facade where the web imports it**

Create `apps/web/src/lib/env.ts`:

```ts
// Facade: the module lives in @tonus/shared (mobile needs it too). Kept so the
// 7 web importers do not churn — same pattern as database.types.ts.
export { initEnv, getEnv } from '@tonus/shared'
export type { TonusEnv } from '@tonus/shared'
```

- [ ] **Step 4: Run the web and shared suites**

Run: `npm run -w tonus-web test && npm run -w @tonus/shared test`
Expected: PASS, unchanged counts. `env.test.ts` exercises the facade now.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/env.ts packages/shared/src/index.ts apps/web/src/lib/env.ts
git commit -m "refactor(shared): move the env module into @tonus/shared"
```

### Task 2: Move `platform` into `@tonus/shared`

Note the split: the **interface and facades** move; `platform.web.ts` (the only
file allowed to touch Web Storage) stays in the web app.

**Files:**
- Create: `packages/shared/src/platform.ts`
- Modify: `apps/web/src/lib/platform.ts` (facade), `apps/web/src/lib/platform.web.ts` (import path), `packages/shared/src/index.ts`
- Test: `apps/web/src/lib/platform.test.ts` must keep passing unchanged.

- [ ] **Step 1: Move the file**

`git mv apps/web/src/lib/platform.ts packages/shared/src/platform.ts` — contents unchanged.

- [ ] **Step 2: Export from the index**

```ts
export {
  initPlatform,
  persistentStorage,
  ephemeralStorage,
  getDeviceLocale,
  createInMemoryStorage,
} from './platform'
export type { KeyValueStorage, PlatformAdapters } from './platform'
```

- [ ] **Step 3: Facade in the web app**

Create `apps/web/src/lib/platform.ts`:

```ts
// Facade: the adapter contract lives in @tonus/shared; the web implementation
// stays next door in platform.web.ts.
export {
  initPlatform,
  persistentStorage,
  ephemeralStorage,
  getDeviceLocale,
  createInMemoryStorage,
} from '@tonus/shared'
export type { KeyValueStorage, PlatformAdapters } from '@tonus/shared'
```

- [ ] **Step 4: Run the suites**

Run: `npm run -w tonus-web test && npm run -w @tonus/shared test`
Expected: PASS. If `platform.test.ts` fails on identity (it asserts facade
behaviour, not object identity), read the failure before changing the test —
the facade must be behaviourally identical.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/platform.ts packages/shared/src/index.ts apps/web/src/lib/platform.ts
git commit -m "refactor(shared): move the platform adapter contract into @tonus/shared"
```

### Task 3: Move the Supabase factory into `@tonus/shared`

Only `createTonusClient` moves. The lazy singleton Proxy is web wiring and stays.

**Files:**
- Create: `packages/shared/src/supabaseFactory.ts`
- Modify: `apps/web/src/lib/supabase.ts`, `packages/shared/src/index.ts`, `packages/shared/package.json`
- Test: `apps/web/src/lib/supabase.test.ts` must keep passing.

- [ ] **Step 1: Give shared the supabase dependency**

In `packages/shared/package.json`, add:

```json
  "dependencies": {
    "@supabase/supabase-js": "^2.78.0"
  },
```

Run `npm install` from the repo root afterwards.

- [ ] **Step 2: Create the factory module**

`packages/shared/src/supabaseFactory.ts`:

```ts
import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js'
import type { Database } from './database.types'

export interface TonusClientConfig {
  url: string
  anonKey: string
  /** supabase-js options (auth storage, detectSessionInUrl, …) — each platform injects its own. */
  options?: SupabaseClientOptions<'public'>
}

/** Platform-agnostic client factory; web wraps it in a lazy singleton, mobile builds its own. */
export function createTonusClient(config: TonusClientConfig): SupabaseClient<Database> {
  return createClient<Database>(config.url, config.anonKey, config.options)
}
```

Export from `packages/shared/src/index.ts`:

```ts
export { createTonusClient } from './supabaseFactory'
export type { TonusClientConfig } from './supabaseFactory'
```

- [ ] **Step 3: Point the web singleton at shared**

In `apps/web/src/lib/supabase.ts`, delete the local `TonusClientConfig`
interface and `createTonusClient` function, and replace the top imports with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTonusClient } from '@tonus/shared'
import type { Database } from './database.types'
import { getEnv } from './env'

export { createTonusClient }
export type { TonusClientConfig } from '@tonus/shared'
```

Everything from `let client: SupabaseClient<Database> | null = null` downwards
stays exactly as it is.

- [ ] **Step 4: Run the suites**

Run: `npm run -w tonus-web test && npm run -w @tonus/shared test`
Expected: PASS, including the regression test that the client is constructed
lazily (see the comment in `supabase.ts` — an eager `getEnv()` here once blanked
production).

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/web/src/lib/supabase.ts package-lock.json
git commit -m "refactor(shared): move the supabase client factory into @tonus/shared"
```

### Task 4: Move `demo` into `@tonus/shared`, then verify PR A end to end

**Files:**
- Create: `packages/shared/src/demo.ts`
- Modify: `apps/web/src/lib/demo.ts` (facade), `packages/shared/src/index.ts`

- [ ] **Step 1: Move and re-point imports**

`git mv apps/web/src/lib/demo.ts packages/shared/src/demo.ts`, then inside the
moved file change its two imports to relative shared paths:

```ts
import { getEnv } from './env'
import { persistentStorage } from './platform'
```

- [ ] **Step 2: Export and facade**

Index:

```ts
export { isDemoActive, enableDemo, disableDemo } from './demo'
```

`apps/web/src/lib/demo.ts`:

```ts
// Facade: demo mode is cross-client (the mobile app gets the same workbench).
export { isDemoActive, enableDemo, disableDemo } from '@tonus/shared'
```

- [ ] **Step 3: Full repo gate**

```bash
npm test && npm run lint && VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=test-anon-key npm run build
```

Expected: all green, test counts unchanged from `main`.

- [ ] **Step 4: Prove the web app still boots**

Run: `npm run test:e2e`
Expected: the Playwright smoke passes. These four modules run at app startup;
a broken init order would blank the app, and e2e is what caught exactly that
during Phase 0a.

- [ ] **Step 5: Commit and open PR A**

```bash
git add packages/shared apps/web/src/lib/demo.ts
git commit -m "refactor(shared): move demo mode into @tonus/shared"
git push -u origin refactor/shared-client-modules
```

---

# PR B — the mobile auth app

### Task 5: Mobile dependencies

**Files:**
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Add the runtime dependencies**

Add to `dependencies` in `apps/mobile/package.json`:

```json
    "@supabase/supabase-js": "^2.78.0",
    "expo-linking": "~57.0.1",
    "expo-secure-store": "~57.0.1",
    "react-native-mmkv": "^3.3.3"
```

Then, from `apps/mobile`, let Expo correct the versions it owns:

```bash
npx expo install --check
```

Accept its suggestions for the `expo-*` packages only. It will also complain
about `react` and `typescript` deviating from the SDK pins — that drift is
deliberate (single hoisted copies shared with the web app); do not "fix" it.

- [ ] **Step 2: Install and confirm the native modules are seen**

```bash
cd /Users/anatolii/tonus && npm install && cd apps/mobile && npx expo prebuild --platform ios --clean
```

Expected: prebuild completes and the pod install step lists `MMKV` and
`ExpoSecureStore`. This is the moment Expo Go stops being an option — MMKV is a
third-party native module. That was already the plan; it is just now real.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json package-lock.json
git commit -m "feat(mobile): add supabase, secure-store, mmkv and linking deps"
```

### Task 6: Platform adapters on MMKV

**Files:**
- Create: `apps/mobile/src/platform.native.ts`

- [ ] **Step 1: Write the adapters**

```ts
import { MMKV } from 'react-native-mmkv'
import * as Localization from 'expo-localization'
import { initPlatform, type KeyValueStorage } from '@tonus/shared'

// Two stores, because the contract distinguishes them: `persistent` survives
// restarts, `ephemeral` must not. MMKV has no session scope, so the ephemeral
// store is a plain in-memory map — on a phone the process dying is the session
// ending, which is the same guarantee sessionStorage gives a tab.
const persistent = new MMKV({ id: 'tonus' })

function mmkvStorage(store: MMKV): KeyValueStorage {
  return {
    get: key => store.getString(key) ?? null,
    set: (key, value) => { store.set(key, value) },
    remove: key => { store.delete(key) },
  }
}

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    get: key => map.get(key) ?? null,
    set: (key, value) => { map.set(key, value) },
    remove: key => { map.delete(key) },
  }
}

export function initMobilePlatform(): void {
  initPlatform({
    persistentStorage: mmkvStorage(persistent),
    ephemeralStorage: memoryStorage(),
    getDeviceLocale: () => Localization.getLocales()[0]?.languageTag ?? 'en',
  })
}
```

Add `expo-localization` to the dependencies the same way as Task 5 if
`expo install --check` did not already pull it.

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/platform.native.ts apps/mobile/package.json
git commit -m "feat(mobile): implement the platform adapters on MMKV"
```

### Task 7: Env wiring

**Files:**
- Create: `apps/mobile/src/env.native.ts`, `apps/mobile/.env.local` (gitignored — do NOT commit)

- [ ] **Step 1: Write the wiring**

```ts
import { initEnv } from '@tonus/shared'

// Metro inlines EXPO_PUBLIC_* at bundle time. The anon key shipping inside the
// binary is expected: RLS is the boundary, exactly as on the web.
export function initMobileEnv(): void {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — see apps/mobile/.env.local')
  }
  initEnv({
    supabaseUrl,
    supabaseAnonKey,
    demo: process.env.EXPO_PUBLIC_DEMO === '1',
    googleClientId: undefined, // no Google sign-in on mobile (spec decision 1)
  })
}
```

- [ ] **Step 2: Create the local env file**

`apps/mobile/.env.local` (the template's `.gitignore` already covers
`.env*.local` — verify with `git status` that it is not staged):

```
EXPO_PUBLIC_SUPABASE_URL=https://mxnmubakfzqoosgsqmhh.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon key from the Vercel project env>
```

- [ ] **Step 3: Commit (the source file only)**

```bash
git add apps/mobile/src/env.native.ts
git commit -m "feat(mobile): populate the env module from EXPO_PUBLIC vars"
```

### Task 8: The Supabase client, with the refresh wiring that matters

**Files:**
- Create: `apps/mobile/src/supabase.ts`

- [ ] **Step 1: Write the client**

```ts
import { AppState } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { createTonusClient, getEnv } from '@tonus/shared'

// The session token is the only credential in the app, so it lives in the
// Keychain — not in MMKV next to the language preference.
const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

const { supabaseUrl, supabaseAnonKey } = getEnv()

export const supabase = createTonusClient({
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  options: {
    auth: {
      storage: secureStorage,
      persistSession: true,
      autoRefreshToken: true,
      // There is no URL fragment to read tokens from on a phone.
      detectSessionInUrl: false,
    },
  },
})

// supabase-js's refresh timer does not survive iOS backgrounding: without this
// the token silently goes stale and the first request after a long background
// fails. Tie it to AppState instead.
export function startSessionRefreshLifecycle(): () => void {
  const sub = AppState.addEventListener('change', state => {
    if (state === 'active') void supabase.auth.startAutoRefresh()
    else void supabase.auth.stopAutoRefresh()
  })
  if (AppState.currentState === 'active') void supabase.auth.startAutoRefresh()
  return () => { sub.remove() }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/supabase.ts
git commit -m "feat(mobile): create the supabase client with Keychain storage and AppState refresh"
```

### Task 9: The auth state hook

**Files:**
- Create: `apps/mobile/src/useAuth.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isDemoActive } from '@tonus/shared'
import { supabase, startSessionRefreshLifecycle } from './supabase'

const DEMO_USER = { id: '00000000-0000-0000-0000-000000000000', email: 'demo@tonus.app' } as User

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => (isDemoActive() ? DEMO_USER : null))
  const [loading, setLoading] = useState(() => !isDemoActive())
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    if (isDemoActive()) return
    const stopRefresh = startSessionRefreshLifecycle()

    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })

    return () => { subscription.unsubscribe(); stopRefresh() }
  }, [])

  return { user, loading, passwordRecovery, setPasswordRecovery }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/useAuth.ts
git commit -m "feat(mobile): track auth state and drive the refresh lifecycle"
```

### Task 10: Sign in / sign up screen

**Files:**
- Create: `apps/mobile/src/screens/AuthScreen.tsx`

- [ ] **Step 1: Write the screen**

```tsx
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { enableDemo } from '@tonus/shared'
import { supabase } from '../supabase'

export function AuthScreen({ onDemo, onForgotPassword }: { onDemo: () => void; onForgotPassword: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true); setError(null)
    const { error } = mode === 'signup'
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    // A web user who signed up with Google has no password, so the server's
    // "Invalid login credentials" is misleading here (spec decision 1).
    if (error) setError(
      error.message.includes('Invalid login')
        ? 'Неверная почта или пароль. Если вы регистрировались через Google, задайте пароль в веб-версии.'
        : error.message,
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tonus</Text>
      <TextInput
        style={styles.input}
        placeholder="Почта"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextInput
        style={styles.input}
        placeholder="Пароль"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.primary} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.primaryText}>{mode === 'signup' ? 'Зарегистрироваться' : 'Войти'}</Text>
        )}
      </Pressable>
      <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}>
        <Text style={styles.link}>{mode === 'signin' ? 'Создать аккаунт' : 'У меня уже есть аккаунт'}</Text>
      </Pressable>
      <Pressable onPress={onForgotPassword}><Text style={styles.link}>Забыли пароль?</Text></Pressable>
      <Pressable onPress={() => { enableDemo(); onDemo() }}>
        <Text style={styles.link}>Посмотреть демо</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#d8d8d8', borderRadius: 10, padding: 14, fontSize: 16 },
  primary: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#555', paddingVertical: 6 },
  error: { color: '#c0362c' },
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/AuthScreen.tsx
git commit -m "feat(mobile): sign in and sign up screen"
```

### Task 11: Password reset over the deep link

**Files:**
- Create: `apps/mobile/src/screens/ResetRequestScreen.tsx`, `apps/mobile/src/screens/ResetPasswordScreen.tsx`
- Create: `apps/mobile/src/useResetDeepLink.ts`

- [ ] **Step 1: Request screen**

```tsx
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { supabase } from '../supabase'

export function ResetRequestScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: 'tonus://reset' })
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Сброс пароля</Text>
      {sent ? (
        <Text style={styles.hint}>Письмо отправлено. Откройте ссылку из него на этом телефоне.</Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Почта"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.primary} onPress={submit}>
            <Text style={styles.primaryText}>Отправить письмо</Text>
          </Pressable>
        </>
      )}
      <Pressable onPress={onBack}><Text style={styles.link}>Назад</Text></Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '600', textAlign: 'center' },
  hint: { textAlign: 'center', color: '#333', fontSize: 16 },
  input: { borderWidth: 1, borderColor: '#d8d8d8', borderRadius: 10, padding: 14, fontSize: 16 },
  primary: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#555', paddingVertical: 6 },
  error: { color: '#c0362c' },
})
```

- [ ] **Step 2: Deep link handler**

`apps/mobile/src/useResetDeepLink.ts`:

```ts
import { useEffect } from 'react'
import * as Linking from 'expo-linking'
import { supabase } from './supabase'

// Supabase sends the recovery tokens in the URL fragment (#access_token=…).
// detectSessionInUrl is off on RN, so the app extracts them itself and hands
// them to setSession, which then emits PASSWORD_RECOVERY through useAuth.
function tokensFrom(url: string): { access_token: string; refresh_token: string } | null {
  const fragment = url.split('#')[1]
  if (!fragment) return null
  const params = new URLSearchParams(fragment)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  return access_token && refresh_token ? { access_token, refresh_token } : null
}

export function useResetDeepLink(): void {
  useEffect(() => {
    function handle(url: string | null) {
      const tokens = url ? tokensFrom(url) : null
      if (tokens) void supabase.auth.setSession(tokens)
    }
    void Linking.getInitialURL().then(handle)      // cold start from the email
    const sub = Linking.addEventListener('url', e => handle(e.url))  // app already open
    return () => { sub.remove() }
  }, [])
}
```

- [ ] **Step 3: New-password screen**

```tsx
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { supabase } from '../supabase'

export function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Новый пароль</Text>
      <TextInput style={styles.input} placeholder="Новый пароль" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.primary} onPress={submit}>
        <Text style={styles.primaryText}>Сохранить</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '600', textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#d8d8d8', borderRadius: 10, padding: 14, fontSize: 16 },
  primary: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#c0362c' },
})
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens apps/mobile/src/useResetDeepLink.ts
git commit -m "feat(mobile): password reset over the tonus:// deep link"
```

### Task 12: Wire the shell and verify

**Files:**
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 1: Compose the app**

```tsx
import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { APP_NAME } from '@tonus/shared'
import { initMobileEnv } from './src/env.native'
import { initMobilePlatform } from './src/platform.native'

// Wiring first, at module load and before anything reads config — but note the
// Phase 0a lesson: never read env at module load in the modules themselves,
// only initialise it here.
initMobileEnv()
initMobilePlatform()

// Imported after init on purpose: these modules construct the client.
const { useAuth } = require('./src/useAuth') as typeof import('./src/useAuth')
const { useResetDeepLink } = require('./src/useResetDeepLink') as typeof import('./src/useResetDeepLink')
const { AuthScreen } = require('./src/screens/AuthScreen') as typeof import('./src/screens/AuthScreen')
const { ResetRequestScreen } = require('./src/screens/ResetRequestScreen') as typeof import('./src/screens/ResetRequestScreen')
const { ResetPasswordScreen } = require('./src/screens/ResetPasswordScreen') as typeof import('./src/screens/ResetPasswordScreen')

export default function App() {
  const { user, loading, passwordRecovery, setPasswordRecovery } = useAuth()
  const [screen, setScreen] = useState<'auth' | 'reset-request'>('auth')
  useResetDeepLink()

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>
  if (passwordRecovery) return <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />
  if (!user) {
    return screen === 'reset-request'
      ? <ResetRequestScreen onBack={() => setScreen('auth')} />
      : <AuthScreen onDemo={() => setScreen('auth')} onForgotPassword={() => setScreen('reset-request')} />
  }
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{APP_NAME}</Text>
      <Text style={styles.subtitle}>{user.email}</Text>
      <StatusBar style="auto" />
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '600' },
  subtitle: { fontSize: 16, opacity: 0.6 },
})
```

If the `require` dance offends (it exists only to keep init ahead of client
construction), the clean alternative is to move the wiring into `index.ts`
before `registerRootComponent` and use plain imports here. Do that if it works
— verify by launching, not by reasoning.

- [ ] **Step 2: Static gates**

```bash
npm run -w tonus-mobile typecheck && npm run -w tonus-mobile lint && npm test
```

Expected: all green.

- [ ] **Step 3: Metro export smoke**

Run: `cd apps/mobile && npx expo export --platform ios`
Expected: exits 0. Native modules are not exercised here, but a broken import
graph is.

- [ ] **Step 4: The real verification — the simulator**

Push the branch and let the `Mobile iOS` workflow build and launch it; download
the screenshot artifact and confirm the **auth screen renders** (email, password,
buttons), not a red error box.

What CI cannot prove, and must be checked by hand on a device before this phase
is called done:
1. Signing in with a real account succeeds.
2. Killing and relaunching the app keeps the user signed in (Keychain).
3. Backgrounding past the token TTL and returning still makes authorised
   requests (the AppState wiring).
4. The reset email's link opens the app on the new-password screen.

**User action, required before (4) can work:** `tonus://reset` must be added to
the Supabase project's Authentication → URL Configuration → Redirect URLs.

- [ ] **Step 5: Open PR B**

The PR body must state which of the four manual checks were actually performed
and on what — device or simulator — and which are still owed.

---

## Self-review notes

- Spec coverage: SecureStore for the token and MMKV for preferences (Tasks 6–8),
  AppState refresh (Task 8), deep links (Task 11), three screens (Tasks 10–11),
  demo mode (Tasks 10, 4), env (Task 7), hardcoded Russian strings as decided.
- The spec's "storage split" is honoured literally: no code path puts the auth
  token into the MMKV store.
- Not covered on purpose: i18n extraction, PIN, biometrics, tab navigation —
  all explicitly out of scope in the spec.
