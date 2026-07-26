import { initEnv } from '@tonus/shared'

// Metro inlines EXPO_PUBLIC_* at bundle time, so these are compile-time
// constants in the shipped app rather than runtime lookups. The anon key
// living inside the binary is expected and safe: RLS is the boundary, exactly
// as it is in the web bundle.
export function initMobileEnv(): void {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Create apps/mobile/.env.local (gitignored) with both values.',
    )
  }
  initEnv({
    supabaseUrl,
    supabaseAnonKey,
    demo: process.env.EXPO_PUBLIC_DEMO === '1',
    // No Google sign-in on mobile: offering third-party social login would
    // oblige us to implement Sign in with Apple too (App Store guideline 4.8).
    googleClientId: undefined,
  })
}
