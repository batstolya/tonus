// The ONLY place in src/ that reads import.meta.env. Imported first from
// src/main.tsx so the store is populated before any lib module loads.
import { initEnv } from './env'

initEnv({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  demo: import.meta.env.VITE_DEMO === '1',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
})
