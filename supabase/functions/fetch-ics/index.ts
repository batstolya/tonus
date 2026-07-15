import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.110.2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
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

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Tonus Health App' },
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
