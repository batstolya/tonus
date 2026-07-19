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
