// Facade: the adapter contract lives in @tonus/shared because the mobile app
// implements it too (MMKV + expo-localization). The web implementation stays
// next door in platform.web.ts — still the only file allowed to touch Web
// Storage and navigator.
export {
  initPlatform,
  persistentStorage,
  ephemeralStorage,
  getDeviceLocale,
  createInMemoryStorage,
} from '@tonus/shared'
export type { KeyValueStorage, PlatformAdapters } from '@tonus/shared'
