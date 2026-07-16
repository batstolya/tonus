import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  captureClientReportedFailure,
  parseClientFailurePayload,
} from '../_shared/observability.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const TONUS_ENVIRONMENT = Deno.env.get('TONUS_ENVIRONMENT') ?? ''
const TONUS_RELEASE_SHA = (Deno.env.get('TONUS_RELEASE_SHA') ?? '').toLowerCase()
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

serve(async (req) => {
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
