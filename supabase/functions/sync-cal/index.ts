import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.2'
import { isValidCronSecret } from '../_shared/auth.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }
const CAL_BASE = 'https://cal.beskarstaff.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ENC_KEY_B64 = Deno.env.get('CAL_ENC_KEY') ?? ''
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('CRON_SECRET') ?? ''

// ---- AES-GCM encrypt/decrypt (key only in env, never in DB) ----
async function aesKey() {
  const raw = Uint8Array.from(atob(ENC_KEY_B64), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
async function encrypt(plain: string): Promise<string> {
  const key = await aesKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)))
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length)
  return btoa(String.fromCharCode(...out))
}
async function decrypt(b64: string): Promise<string> {
  const key = await aesKey()
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12))
  return new TextDecoder().decode(pt)
}

// ---- cal.com NextAuth credentials login -> fresh session token ----
async function calLogin(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${CAL_BASE}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  const csrfCookie = csrfRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  const body = new URLSearchParams({ csrfToken, email, password, json: 'true', callbackUrl: CAL_BASE })
  const res = await fetch(`${CAL_BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: csrfCookie },
    body: body.toString(),
    redirect: 'manual',
  })
  const token = res.headers.getSetCookie()
    .map(c => c.match(/__Secure-next-auth\.session-token=([^;]+)/)?.[1])
    .find(Boolean)
  if (!token) throw new Error('Неверный логин или пароль (или включена 2FA)')
  return token
}

// Букинг из tRPC cal.com — внешняя форма, перечислены только используемые поля.
interface CalBooking {
  uid?: string; startTime?: string; endTime?: string
  title?: string | null; description?: string | null; location?: string | null
  eventType?: { title?: string | null } | null
}
// Нормализованная строка calendar_events.
interface CalEventRow {
  user_id: string; uid: string; title: string
  start_ts: string; end_ts: string
  description: string | null; location: string | null; source: string
}

// ---- fetch all past bookings via tRPC (same shape as fetch-cal) ----
async function fetchBookings(sessionToken: string): Promise<CalBooking[]> {
  const all: CalBooking[] = []
  let offset = 0
  const limit = 100
  while (true) {
    const input = encodeURIComponent(JSON.stringify({
      '0': { json: { limit, offset, filters: {
        status: 'past', eventTypeIds: null, teamIds: null, userIds: null,
        attendeeName: null, attendeeEmail: null, bookingUid: null,
        afterStartDate: null, beforeEndDate: null,
      } }, meta: { values: {
        'filters.eventTypeIds': ['undefined'], 'filters.teamIds': ['undefined'],
        'filters.userIds': ['undefined'], 'filters.attendeeName': ['undefined'],
        'filters.attendeeEmail': ['undefined'], 'filters.bookingUid': ['undefined'],
        'filters.afterStartDate': ['undefined'], 'filters.beforeEndDate': ['undefined'],
      } } },
    }))
    const r = await fetch(`${CAL_BASE}/api/trpc/bookings/get?batch=1&input=${input}`, {
      headers: { cookie: `__Secure-next-auth.session-token=${sessionToken}` },
    })
    if (!r.ok) throw new Error(`cal.com tRPC error: ${r.status}`)
    const d = await r.json()
    const bookings = d[0]?.result?.data?.json?.bookings ?? []
    all.push(...bookings)
    if (bookings.length < limit) break
    offset += limit
  }
  return all
}

// ---- normalize (keep in sync with scripts/test-cal-normalize.mjs) ----
function normalizeBookings(bookings: CalBooking[], userId: string): CalEventRow[] {
  const byUid = new Map<string, CalEventRow>()
  for (const b of bookings) {
    if (!b?.uid || !b?.startTime || !b?.endTime) continue
    byUid.set(b.uid, {
      user_id: userId, uid: b.uid,
      title: b.title ?? b.eventType?.title ?? '(без названия)',
      start_ts: new Date(b.startTime).toISOString(),
      end_ts: new Date(b.endTime).toISOString(),
      description: b.description ?? null, location: b.location ?? null, source: 'cal',
    })
  }
  return [...byUid.values()]
}

async function syncOne(admin: SupabaseClient, row: { user_id: string; cal_email: string; cal_password_enc: string }) {
  let status = 'ok'; let count = 0; let outRows: CalEventRow[] = []
  try {
    const password = await decrypt(row.cal_password_enc)
    const token = await calLogin(row.cal_email, password)
    const bookings = await fetchBookings(token)
    const rows = normalizeBookings(bookings, row.user_id)
    count = rows.length
    outRows = rows
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin.from('calendar_events').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,uid' })
      if (error) throw new Error(`calendar_events upsert: ${error.message}`)
    }
  } catch (e) {
    status = (e as Error).message ?? 'Ошибка'
  }
  await admin.from('cal_sync').update({
    last_sync_at: new Date().toISOString(), last_status: status, event_count: count,
  }).eq('user_id', row.user_id)
  return { status, count, rows: outRows }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // ---- CRON path: secret header, sync every enabled user ----
    if (isValidCronSecret(req, CRON_SECRET)) {
      const { data: rows } = await admin.from('cal_sync').select('user_id, cal_email, cal_password_enc').eq('enabled', true)
      const results = []
      for (const row of rows ?? []) results.push(await syncOne(admin, row))
      return new Response(JSON.stringify({ ran: results.length, results }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // ---- UI path: require user JWT ----
    const authHeader = req.headers.get('Authorization') ?? ''
    const { data: { user } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })

    const bodyText = await req.text()
    const body = bodyText ? JSON.parse(bodyText) : {}

    // Optional: save/update credentials (and enabled flag) before syncing.
    if (body.email && body.password) {
      const enc = await encrypt(String(body.password))
      const { error } = await admin.from('cal_sync').upsert({
        user_id: user.id, cal_email: String(body.email), cal_password_enc: enc,
        enabled: body.enabled ?? true, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (error) throw new Error(`cal_sync save: ${error.message}`)
    } else if (typeof body.enabled === 'boolean') {
      // toggle only (no credential change)
      await admin.from('cal_sync').update({ enabled: body.enabled }).eq('user_id', user.id)
      return new Response(JSON.stringify({ enabled: body.enabled }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Load creds and sync now.
    const { data: row } = await admin.from('cal_sync').select('user_id, cal_email, cal_password_enc').eq('user_id', user.id).maybeSingle()
    if (!row) return new Response(JSON.stringify({ error: 'Сначала сохрани логин и пароль cal.com' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })

    const result = await syncOne(admin, row)
    if (result.status !== 'ok') return new Response(JSON.stringify({ error: result.status }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
    // Return events so the client can refresh the stress map without a page reload.
    const events = result.rows.map(r => ({
      uid: r.uid, title: r.title, start: r.start_ts, end: r.end_ts,
      description: r.description, location: r.location, source: r.source,
    }))
    return new Response(JSON.stringify({ count: result.count, events }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
