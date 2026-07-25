# Mobile Phase 2b — Authentication (draft)

**Date:** 2026-07-25
**Status:** **Approved** 2026-07-26 — the user accepted all three
recommendations below. Grounded in what the web app actually does today.
**Parent:** `2026-07-18-mobile-monorepo-design.md` (Phase 2b)
**Depends on:** Phase 2 (#139, merged) — the Expo scaffold and the workspace chain.

## Goal

The mobile app signs a real user in against the same Supabase project as the
web app, keeps the session across restarts and backgrounding, and can be
opened without a backend at all (demo mode) for screen work. This is the phase
that turns the scaffold into something that can hold a real screen — and the
prerequisite for Phase 3, since HealthKit sync needs an authenticated user to
attribute samples to.

## What the web does today (the contract to match)

From `apps/web/src/components/auth/AuthScreen.tsx` and `hooks/useAuth.ts`:

| Flow | Web implementation |
| --- | --- |
| Email + password sign-in | `supabase.auth.signInWithPassword({ email, password })` |
| Sign-up | `supabase.auth.signUp({ email, password })` |
| Google | `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })` |
| Password reset request | `resetPasswordForEmail(email, { redirectTo: '<origin>?reset=1' })` |
| Password reset completion | `updateUser({ password })` after the `PASSWORD_RECOVERY` event |
| Session | `getSession()` + `onAuthStateChange`, session persisted by supabase-js defaults (Web Storage) |
| Demo | `isDemoActive()` short-circuits everything with a fake user id |

Two of these lean on the browser: `window.location.origin` as a redirect
target, and supabase-js's default `detectSessionInUrl` behaviour, which reads
tokens out of the URL fragment after a redirect. Neither exists on RN.

## Proposal

### Session and storage

Two different storages, and conflating them would be a mistake:

- **Supabase auth token → `expo-secure-store`** (iOS Keychain). It is the only
  credential in the app; it belongs behind the OS keystore, not in a plain
  key-value file. SecureStore is async, which supabase-js accepts for its
  `auth.storage` option.
- **App preferences (language, demo flag, PIN state) → MMKV**, wired into the
  Phase 0b `platform.ts` adapters. Those call sites are synchronous
  (`get(key): string | null`), which is why MMKV and not AsyncStorage — see the
  parent design's "Mobile platform decisions".

The mobile entry constructs the client through the existing Phase 0b factory:

```ts
createTonusClient({
  url, anonKey,
  options: {
    auth: {
      storage: secureStoreAdapter,
      detectSessionInUrl: false,   // no URL fragment on RN
      persistSession: true,
      autoRefreshToken: true,
    },
  },
})
```

`autoRefreshToken` alone is not enough: supabase-js's refresh timer does not
survive backgrounding on iOS. The entry must also drive it from `AppState` —
`startAutoRefresh()` when the app becomes active, `stopAutoRefresh()` when it
backgrounds. Without this the token silently goes stale and the first request
after a long background fails; it is the single most common RN + Supabase bug
and it must be in the plan as its own task with an explicit test.

### Deep links

`app.json` already declares `"scheme": "tonus"` (set in Phase 2 precisely so
this phase would not need a re-prebuild). Password reset becomes:

- `resetPasswordForEmail(email, { redirectTo: 'tonus://reset' })`
- the app handles the incoming URL via `Linking`, extracts the tokens, calls
  `setSession`, and routes to the password screen on `PASSWORD_RECOVERY`.

**User action required:** `tonus://reset` (and `tonus://auth` if OAuth lands)
must be added to the Supabase project's redirect-URL allowlist, or the email
link will refuse to redirect. This is a dashboard setting, not code.

### Screens

Three, all on RN primitives, no design system yet:

1. `AuthScreen` — email, password, sign in / sign up toggle, error text.
2. `ResetRequestScreen` — email field, "письмо отправлено" state.
3. `ResetPasswordScreen` — new password, reached only via the deep link.

Strings stay hardcoded Russian in this phase. i18n extraction into
`@tonus/shared` is its own phase; inventing a second i18n mechanism here would
be work thrown away.

### Demo mode

Port `isDemoActive()` behind the platform adapter and add a "Посмотреть демо"
button on the auth screen, exactly like the landing page. Cheap, and it gives
the Today screen (Phase 4) a backend-free workbench — the parent design already
counts on this.

### Env

`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, read by the
mobile entry and pushed into the Phase 0a `env` module before anything else
runs. Values live in `apps/mobile/.env.local` (gitignored by the template's
`.env*.local` rule). The anon key in a shipped binary is expected and safe —
RLS is the boundary, exactly as on the web.

## Verification

- Sign in on a device/simulator against the real project; kill and relaunch the
  app; the session is still there.
- Background the app for longer than the token TTL, foreground it, and make a
  request — it succeeds (this is the AppState wiring; it is the one thing a
  quick manual test misses).
- Password reset end to end: request → email → tap link → app opens on the
  reset screen → new password works.
- Demo mode opens the app with no network.
- Repo gate stays green: typecheck, lint, tests, Metro export smoke.

## Decisions (approved 2026-07-26)

1. **Email + password only in v1. No Google sign-in.** This drops
   `expo-auth-session` and the OAuth redirect handling, and it keeps App Store
   guideline 4.8 out of the picture — offering third-party social login would
   oblige us to also implement Sign in with Apple before submission. The web
   keeps its Google button; the accounts are the same either way, so a user who
   signed up with Google on the web will need a password set before they can
   use the phone. **Worth surfacing in the sign-in screen's error copy** rather
   than letting it read as "wrong password".
2. **No PIN-protected private concerns on mobile in v1** — it guards a screen
   v1 does not ship.
3. **No biometric unlock in v1** — there is no local sensitive data until real
   screens exist, and the Keychain already protects the token.

## Out of scope

HealthKit, the Today screen, tab navigation, i18n extraction, push
notifications, account deletion UI, Telegram linking.
