import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { isDemoActive } from './demo'

// The table is introduced by the same release. Generated Database types are
// synchronized immediately after the post-merge migration is applied.
const consentDb = supabase as unknown as SupabaseClient

export const AI_CONSENT_PROVIDER = 'google_gemini'
export const AI_CONSENT_PURPOSE = 'health_ai_processing'
export const AI_CONSENT_POLICY_VERSION = '2026-07-16'

export interface AiConsentStatus {
  granted: boolean
  grantedAt: string | null
}

export async function loadAiConsent(userId: string): Promise<AiConsentStatus> {
  // Demo mode has no Supabase and never sends anything to Gemini
  // (demoFunctionResponse short-circuits AI calls), so consent is implicit.
  if (isDemoActive()) return { granted: true, grantedAt: null }
  const { data, error } = await consentDb
    .from('ai_processing_consents')
    .select('policy_version, granted_at, revoked_at')
    .eq('user_id', userId)
    .eq('provider', AI_CONSENT_PROVIDER)
    .eq('purpose', AI_CONSENT_PURPOSE)
    .eq('policy_version', AI_CONSENT_POLICY_VERSION)
    .maybeSingle()

  if (error) throw new Error('Failed to load AI consent')
  const granted = data?.policy_version === AI_CONSENT_POLICY_VERSION && data.revoked_at === null
  return { granted, grantedAt: granted ? data.granted_at : null }
}

export async function grantAiConsent(userId: string): Promise<void> {
  if (isDemoActive()) return
  const now = new Date().toISOString()
  const { error } = await consentDb.from('ai_processing_consents').upsert({
    user_id: userId,
    provider: AI_CONSENT_PROVIDER,
    purpose: AI_CONSENT_PURPOSE,
    policy_version: AI_CONSENT_POLICY_VERSION,
    granted_at: now,
    revoked_at: null,
  }, { onConflict: 'user_id,provider,purpose,policy_version' })
  if (error) throw new Error('Failed to grant AI consent')
}

export async function revokeAiConsent(userId: string): Promise<void> {
  if (isDemoActive()) return
  const { error } = await consentDb
    .from('ai_processing_consents')
    .update({ revoked_at: new Date().toISOString() })
    .match({
      user_id: userId,
      provider: AI_CONSENT_PROVIDER,
      purpose: AI_CONSENT_PURPOSE,
      policy_version: AI_CONSENT_POLICY_VERSION,
    })
  if (error) throw new Error('Failed to revoke AI consent')
}

export function isAiConsentRequiredError(error: unknown): boolean {
  return error instanceof Error && (
    error.message === 'ai_consent_required' ||
    ('code' in error && error.code === 'ai_consent_required')
  )
}
