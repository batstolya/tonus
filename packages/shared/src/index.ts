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
export { buildHaePayload, MOBILE_SOURCE_PREFIX } from './haePayload'
export type {
  HealthReadings,
  DailySumReading,
  DailyAverageReading,
  SleepReading,
  HaeOutboundPayload,
} from './haePayload'
