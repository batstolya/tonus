import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeadersFor } from '../_shared/cors.ts'
import { fetchWithTimeout } from '../_shared/http.ts'

const ALLOWED_ORIGINS = Deno.env.get('TONUS_ALLOWED_ORIGINS') ?? ''

serve(async (req) => {
  const CORS = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

    const { url } = await req.json()
    if (!url || typeof url !== 'string') return new Response('Missing url', { status: 400, headers: CORS })

    // Only allow ics feeds
    if (!url.startsWith('https://')) return new Response('Only HTTPS urls allowed', { status: 400, headers: CORS })

    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Tonus Health App' },
      retryOn5xx: true,
    })
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)

    const text = await res.text()
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Not a valid ICS feed')

    // Save the feed URL for this user
    await supabase.from('profiles').upsert({ id: user.id, cal_ics_url: url })

    return new Response(JSON.stringify({ ics: text }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response((e as Error).message ?? 'Error', { status: 500, headers: CORS })
  }
})
