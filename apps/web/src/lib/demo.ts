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
