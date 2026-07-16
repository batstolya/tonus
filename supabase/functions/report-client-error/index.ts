import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  captureClientReportedFailure,
  parseClientFailurePayload,
} from '../_shared/observability.ts'
import { corsHeadersFor } from '../_shared/cors.ts'
import { consumeRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TONUS_ENVIRONMENT = Deno.env.get('TONUS_ENVIRONMENT') ?? ''
const TONUS_RELEASE_SHA = (Deno.env.get('TONUS_RELEASE_SHA') ?? '').toLowerCase()
const ALLOWED_ORIGINS = Deno.env.get('TONUS_ALLOWED_ORIGINS') ?? ''

serve(async (req) => {
  const CORS = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS })

  const authorization = req.headers.get('authorization') ?? ''
  if (!authorization || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response('unauthorized', { status: 401, headers: CORS })
  }
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) return new Response('unauthorized', { status: 401, headers: CORS })

  // Durable per-user limit (PR 3): a runaway client must not flood observability_events.
  // The RPC is service-role-only, so a dedicated service client makes the call.
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  if (!await consumeRateLimit(serviceClient, { bucket: `client-error:${user.id}`, limit: 120, windowSeconds: 3600 })) {
    return rateLimitedResponse(CORS)
  }

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return new Response('invalid event', { status: 400, headers: CORS })
  }
  const payload = parseClientFailurePayload(input)
  if (!payload) return new Response('invalid event', { status: 400, headers: CORS })
  if (
    (TONUS_ENVIRONMENT !== 'preview' && TONUS_ENVIRONMENT !== 'production') ||
    !/^[0-9a-f]{40}$/.test(TONUS_RELEASE_SHA)
  ) {
    return new Response('reporting not configured', { status: 503, headers: CORS })
  }
  if (payload.environment !== TONUS_ENVIRONMENT || payload.release !== TONUS_RELEASE_SHA) {
    return new Response('release mismatch', { status: 400, headers: CORS })
  }

  const accepted = await captureClientReportedFailure(payload)
  if (!accepted) return new Response('event rejected', { status: 503, headers: CORS })
  return new Response(JSON.stringify({ accepted: true, requestId: payload.requestId }), {
    status: 202,
    headers: { ...CORS, 'Content-Type': 'application/json', 'x-request-id': payload.requestId },
  })
})
