import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  canUpdateTeams,
  mapApiFootballFixture,
  mapEspnScoreboardEvent,
  mapFootballDataMatch,
  mapTheStatsApiFixture,
  type ApiFootballFixture,
  type EspnScoreboardEvent,
  type FootballDataMatch,
  type FootballMatchUpsert,
  type TheStatsApiFixture,
} from '../_shared/football.ts'
import { isValidCronSecret } from '../_shared/auth.ts'

const FOOTBALL_FIXTURES_PROVIDER = (Deno.env.get('FOOTBALL_FIXTURES_PROVIDER') ?? 'espn') as 'api-football' | 'thestatsapi' | 'espn' | 'football-data'
const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY') ?? ''
const FOOTBALL_DATA_TOKEN = Deno.env.get('FOOTBALL_DATA_TOKEN') ?? ''
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('FOOTBALL_INTERNAL_SECRET') ?? ''
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

  if (!isValidCronSecret(req, CRON_SECRET)) {
    return json({ error: 'unauthorized' }, 401)
  }

  if (FOOTBALL_FIXTURES_PROVIDER === 'api-football' && !API_FOOTBALL_KEY) {
    return json({ error: 'missing_api_football_key' }, 500)
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const range = await readRange(req)
    const { provider: usedProvider, rows: allRows } = await fetchAndMapFixtures(range)

    // Never overwrite real pairs with bracket placeholders ("Winner Match 49",
    // "TBD", "1A"). We simply skip those rows entirely.
    const rows = allRows.filter(row => canUpdateTeams(row.home_team_name, row.away_team_name))
    const skipped = allRows.length - rows.length

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
      provider: usedProvider,
      fixtures: rows.length,
      skipped_placeholders: skipped,
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

type Range = { from: string; to: string }

// Resolves fixtures into mapped upsert rows. ESPN is the primary provider
// (free, no key, real WC-2026 pairs). If the configured primary fails or
// returns nothing, we fall back down the chain so `/matches` stays alive.
async function fetchAndMapFixtures(range: Range): Promise<{ provider: string; rows: FootballMatchUpsert[] }> {
  const chain = providerChain()
  const errors: string[] = []

  for (const provider of chain) {
    try {
      const rows = await fetchProvider(provider, range)
      if (rows.length > 0) return { provider, rows }
      errors.push(`${provider}: no fixtures`)
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Every provider failed or was empty — surface the reasons.
  throw new Error(`all providers failed — ${errors.join('; ')}`)
}

function providerChain(): Array<'espn' | 'football-data' | 'api-football' | 'thestatsapi'> {
  switch (FOOTBALL_FIXTURES_PROVIDER) {
    case 'api-football':
      return ['api-football']
    case 'thestatsapi':
      return ['thestatsapi']
    case 'football-data':
      return FOOTBALL_DATA_TOKEN ? ['football-data', 'espn'] : ['espn']
    case 'espn':
    default:
      // ESPN primary, football-data.org as fallback when a token is configured.
      return FOOTBALL_DATA_TOKEN ? ['espn', 'football-data'] : ['espn']
  }
}

async function fetchProvider(
  provider: 'espn' | 'football-data' | 'api-football' | 'thestatsapi',
  range: Range,
): Promise<FootballMatchUpsert[]> {
  const now = new Date().toISOString()
  switch (provider) {
    case 'espn':
      return (await fetchEspn(range)).map(event => mapEspnScoreboardEvent(event, now))
    case 'football-data':
      return (await fetchFootballData()).map(match => mapFootballDataMatch(match, now))
    case 'api-football':
      return (await fetchApiFootball(range)).map(mapApiFootballFixture)
    case 'thestatsapi':
      return (await fetchTheStatsApi()).map(mapTheStatsApiFixture)
  }
}

async function fetchEspn(range: Range): Promise<EspnScoreboardEvent[]> {
  const url = new URL('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard')
  url.searchParams.set('dates', `${range.from.replace(/-/g, '')}-${range.to.replace(/-/g, '')}`)
  url.searchParams.set('limit', '500')

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`ESPN error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json() as { events?: EspnScoreboardEvent[] }
  return data.events ?? []
}

async function fetchFootballData(): Promise<FootballDataMatch[]> {
  if (!FOOTBALL_DATA_TOKEN) throw new Error('missing FOOTBALL_DATA_TOKEN')

  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches?season=2026', {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_TOKEN },
  })
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json() as { matches?: FootballDataMatch[] }
  return data.matches ?? []
}

async function fetchApiFootball(range: Range): Promise<ApiFootballFixture[]> {
  if (!API_FOOTBALL_KEY) throw new Error('missing API_FOOTBALL_KEY')

  const url = new URL('https://v3.football.api-sports.io/fixtures')
  url.searchParams.set('league', '1')
  url.searchParams.set('season', '2026')
  url.searchParams.set('from', range.from)
  url.searchParams.set('to', range.to)

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

async function fetchTheStatsApi(): Promise<TheStatsApiFixture[]> {
  const res = await fetch('https://www.thestatsapi.com/world-cup/data/fixtures.json')
  if (!res.ok) {
    throw new Error(`TheStatsAPI error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json() as { fixtures: TheStatsApiFixture[] }
  return data.fixtures ?? []
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
