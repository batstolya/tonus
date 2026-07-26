// Facade: the module lives in @tonus/shared because the mobile app needs it
// too. Kept here so the web importers do not churn — same pattern as
// database.types.ts. The web wiring stays next door in env.web.ts.
export { initEnv, getEnv } from '@tonus/shared'
export type { TonusEnv } from '@tonus/shared'
