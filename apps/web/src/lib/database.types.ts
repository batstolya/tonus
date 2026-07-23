// Re-export facade. The generated Supabase types now live in the @tonus/shared
// workspace package (mobile monorepo, Phase 1) so the mobile app can consume the
// same DB contract. Web keeps importing from './database.types' unchanged.
// Regenerate with `npm run gen:types` (writes packages/shared/src/database.types.ts).
export type {
  Json,
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from '@tonus/shared/database.types'
export { Constants } from '@tonus/shared/database.types'
