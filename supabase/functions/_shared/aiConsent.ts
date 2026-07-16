import { AI_TIMEOUT_MS, fetchWithTimeout } from './http.ts'

export const AI_CONSENT_PROVIDER = 'google_gemini'
export const AI_CONSENT_PURPOSE = 'health_ai_processing'
export const AI_CONSENT_POLICY_VERSION = '2026-07-16'
export const AI_CONSENT_REQUIRED_CODE = 'AI_CONSENT_REQUIRED'
export const AI_CONSENT_REQUIRED_MESSAGE = 'AI processing consent is required. Open Settings to grant it.'

export class AiConsentRequiredError extends Error {
  readonly code = AI_CONSENT_REQUIRED_CODE

  constructor() {
    super(AI_CONSENT_REQUIRED_CODE)
    this.name = 'AiConsentRequiredError'
  }
}

interface ConsentResult {
  data: { policy_version: string; revoked_at: string | null } | null
  error: unknown
}

interface ConsentQuery {
  eq(column: 'user_id' | 'provider' | 'purpose' | 'policy_version', value: string): ConsentQuery
  is(column: 'revoked_at', value: null): ConsentQuery
  maybeSingle(): PromiseLike<ConsentResult>
}

interface ConsentTable {
  select(columns: 'policy_version, revoked_at'): ConsentQuery
}

export interface AiConsentClient {
  from(table: 'ai_processing_consents'): ConsentTable
}

export async function requireAiConsent(client: AiConsentClient, userId: string): Promise<void> {
  if (!userId) throw new AiConsentRequiredError()

  const { data, error } = await client
    .from('ai_processing_consents')
    .select('policy_version, revoked_at')
    .eq('user_id', userId)
    .eq('provider', AI_CONSENT_PROVIDER)
    .eq('purpose', AI_CONSENT_PURPOSE)
    .eq('policy_version', AI_CONSENT_POLICY_VERSION)
    .is('revoked_at', null)
    .maybeSingle()

  if (error || !data || data.revoked_at !== null || data.policy_version !== AI_CONSENT_POLICY_VERSION) {
    throw new AiConsentRequiredError()
  }
}

export function isAiConsentRequired(error: unknown): boolean {
  return error instanceof AiConsentRequiredError ||
    (error instanceof Error && error.message === AI_CONSENT_REQUIRED_CODE)
}

export function aiConsentRequiredResponse(headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify({
    error: 'ai_consent_required',
    message: AI_CONSENT_REQUIRED_MESSAGE,
  }), {
    status: 403,
    headers: { ...Object.fromEntries(new Headers(headers).entries()), 'Content-Type': 'application/json' },
  })
}

type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export async function fetchGeminiWithConsent(
  client: unknown,
  userId: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  providerFetch: ProviderFetch = fetch,
): Promise<Response> {
  await requireAiConsent(client as AiConsentClient, userId)
  return fetchWithTimeout(input, { ...init, timeoutMs: AI_TIMEOUT_MS, fetchImpl: providerFetch as typeof fetch })
}
