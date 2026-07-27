// @tonus/shared — cross-platform (web + mobile) code shared across Tonus clients.
// Phase 1 seeds it with the generated Supabase DB types; more pure logic migrates
// here module-by-module as the mobile app needs it (see the mobile monorepo roadmap).
export type {
  Json,
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from './database.types'
export { Constants } from './database.types'
export { APP_NAME } from './appMeta'
export { initEnv, getEnv } from './env'
export type { TonusEnv } from './env'
export {
  initPlatform,
  persistentStorage,
  ephemeralStorage,
  getDeviceLocale,
  createInMemoryStorage,
} from './platform'
export type { KeyValueStorage, PlatformAdapters } from './platform'
export { createTonusClient } from './supabaseFactory'
export type { TonusClientConfig } from './supabaseFactory'
export { isDemoActive, enableDemo, disableDemo } from './demo'
export { buildHaePayload, MOBILE_SOURCE_PREFIX } from './haePayload'
export type {
  HealthReadings,
  DailySumReading,
  DailyAverageReading,
  SleepReading,
  HaeOutboundPayload,
} from './haePayload'
export {
  SUM_QUANTITIES,
  AVERAGE_QUANTITIES,
  SLEEP_CATEGORY,
  HEALTH_READ_TYPES,
} from './healthMetrics'
export type { QuantityMetric } from './healthMetrics'
export { computeDailyScores, avg } from './scores'
export type { DailyScore, ScoreInput } from './scores'
export { loadTodayData, DISPLAY_DAYS, FETCH_DAYS } from './todayData'
export type { TodayData, TrendPoint } from './todayData'
