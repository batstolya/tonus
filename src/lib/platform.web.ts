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
