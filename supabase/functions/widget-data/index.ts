import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Данные для iPhone-виджета (F4, spec: 2026-07-05-smart-tonus-design.md).
// GET ?token=<widget_token> → { readiness, level, date, updatedAt, alert }.
// Авторизация — собственный долгоживущий токен (widget_tokens, выдаёт /widget
// в telegram-bot). verify_jwt=false в config.toml. Только чтение, минимум данных.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-request-id' }
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

function readinessLevel(r: number | null): string {
  if (r == null) return 'unknown'
  if (r >= 80) return 'excellent'
  if (r >= 60) return 'good'
  if (r >= 40) return 'fair'
  return 'low'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const token = new URL(req.url).searchParams.get('token') ?? ''
    if (!token) return new Response(JSON.stringify({ error: 'Missing token' }), { status: 401, headers: JSON_HEADERS })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: tok } = await supabase.from('widget_tokens').select('user_id').eq('token', token).maybeSingle()
    if (!tok) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: JSON_HEADERS })

    const dayAgo48 = new Date(Date.now() - 48 * 3600_000).toISOString()
    const [{ data: score }, { data: alert }] = await Promise.all([
      supabase.from('daily_scores')
        .select('date, readiness, recovery_score, sleep_score, updated_at')
        .eq('user_id', tok.user_id).order('date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('health_alerts')
        .select('level, created_at')
        .eq('user_id', tok.user_id).eq('type', 'anomaly')
        .is('acknowledged_at', null).gte('created_at', dayAgo48)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    return new Response(JSON.stringify({
      readiness: score?.readiness ?? null,
      level: readinessLevel(score?.readiness ?? null),
      recovery: score?.recovery_score ?? null,
      sleep: score?.sleep_score ?? null,
      date: score?.date ?? null,
      updatedAt: score?.updated_at ?? null,
      alert: alert ? { level: alert.level } : null,
    }), { headers: JSON_HEADERS })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: JSON_HEADERS })
  }
})
