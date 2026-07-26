import { createMMKV, type MMKV } from 'react-native-mmkv'
import { getLocales } from 'expo-localization'
import { initPlatform, type KeyValueStorage } from '@tonus/shared'

// MMKV and not AsyncStorage: the KeyValueStorage contract is synchronous
// (get(key): string | null), because its call sites — demo flag, language,
// PIN state — read during render on the web. AsyncStorage cannot satisfy that.
// v4 is Nitro-based: instances come from createMMKV(), not `new MMKV()`.
const persistent = createMMKV({ id: 'tonus' })

function mmkvStorage(store: MMKV): KeyValueStorage {
  return {
    get: key => store.getString(key) ?? null,
    set: (key, value) => { store.set(key, value) },
    remove: key => { store.remove(key) },
  }
}

// The contract's ephemeral scope must NOT survive the session. MMKV has no
// session scope, so this is an in-memory map: on a phone the process dying is
// the session ending, which is the same guarantee sessionStorage gives a tab.
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
    getDeviceLocale: () => getLocales()[0]?.languageTag ?? 'en',
  })
}
