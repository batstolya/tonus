import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mapApiFootballFixture, type ApiFootballFixture } from '../_shared/football.ts'

const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY') ?? ''
const FOOTBALL_INTERNAL_SECRET = Deno.env.get('FOOTBALL_INTERNAL_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret',
}

interface ApiFootballResponse<T> {
  response?: T[]
  errors?: unknown
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (FOOTBALL_INTERNAL_SECRET && req.headers.get('x-cron-secret') !== FOOTBALL_INTERNAL_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }

  if (!API_FOOTBALL_KEY) {
    return json({ error: 'missing_api_football_key' }, 500)
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const range = await readRange(req)
    const fixtures = await fetchWorldCupFixtures(range)
    const rows = fixtures.map(fixture => mapApiFootballFixture(fixture))

    if (rows.length > 0) {
      const { error } = await supabase
        .from('football_matches')
        .upsert(rows, { onConflict: 'provider_fixture_id' })

      if (error) throw error
    }

    const cancelledIds = rows
      .filter(row => ['PST', 'CANC', 'ABD'].includes(row.status_short))
      .map(row => row.provider_fixture_id)

    if (cancelledIds.length > 0) {
      const { data: cancelledMatches, error: matchErr } = await supabase
        .from('football_matches')
        .select('id')
        .in('provider_fixture_id', cancelledIds)
      if (matchErr) throw matchErr

      const matchIds = (cancelledMatches ?? []).map(match => match.id)
      if (matchIds.length > 0) {
        const { error } = await supabase
          .from('football_match_reminders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .in('match_id', matchIds)
          .in('status', ['pending', 'processing'])
        if (error) throw error
      }
    }

    const { data: generated, error: generateErr } = await supabase.rpc('generate_football_reminders')
    if (generateErr) throw generateErr

    return json({
      ok: true,
      fixtures: rows.length,
      cancelled: cancelledIds.length,
      reminders_changed: generated ?? 0,
      from: range.from,
      to: range.to,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

async function readRange(req: Request): Promise<{ from: string; to: string }> {
  const url = new URL(req.url)
  const queryFrom = url.searchParams.get('from')
  const queryTo = url.searchParams.get('to')
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}

  return {
    from: queryFrom ?? body.from ?? dateOffset(0),
    to: queryTo ?? body.to ?? dateOffset(30),
  }
}

async function fetchWorldCupFixtures(params: { from: string; to: string }): Promise<ApiFootballFixture[]> {
  const url = new URL('https://v3.football.api-sports.io/fixtures')
  url.searchParams.set('league', '1')
  url.searchParams.set('season', '2026')
  url.searchParams.set('from', params.from)
  url.searchParams.set('to', params.to)

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': API_FOOTBALL_KEY },
  })

  if (!res.ok) {
    throw new Error(`API-Football error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json() as ApiFootballResponse<ApiFootballFixture>
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    throw new Error(`API-Football errors: ${JSON.stringify(data.errors)}`)
  }

  return data.response ?? []
}

function dateOffset(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
