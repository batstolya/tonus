// Platform hooks for shared-candidate lib code (mobile monorepo Phase 0b).
// Mirrors env.ts: platform wiring (web: platform.web.ts, tests:
// vitest.env-setup.ts, mobile later: mmkv/expo-localization) must call
// initPlatform() before lib code runs. Web Storage and browser locale APIs
// must not be touched anywhere else in src/lib — React Native has neither.

/** Synchronous key-value storage; implementations swallow storage errors. */
export interface KeyValueStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export interface PlatformAdapters {
  /** Survives restarts (web: local Web Storage; mobile later: mmkv). */
  persistentStorage: KeyValueStorage
  /** Lives until the session ends (web: session Web Storage / tab close; mobile later: in-memory / app restart). */
  ephemeralStorage: KeyValueStorage
  /** BCP-47 device locale (web: the browser language; mobile later: expo-localization). */
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
