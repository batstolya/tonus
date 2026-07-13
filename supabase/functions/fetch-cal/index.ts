import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }
const CAL_BASE = 'https://cal.beskarstaff.com'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

    const { sessionToken } = await req.json()
    if (!sessionToken) return new Response('Missing sessionToken', { status: 400, headers: CORS })

    // Букинг из tRPC cal.com — внешняя форма, перечислены только используемые поля.
    interface CalBooking {
      uid?: string; startTime?: string; endTime?: string
      title?: string | null; description?: string | null; location?: string | null
      eventType?: { title?: string | null } | null
    }

    // Fetch all bookings via tRPC
    const all: CalBooking[] = []
    let offset = 0
    const limit = 100

    while (true) {
      const input = encodeURIComponent(JSON.stringify({
        '0': {
          json: {
            limit, offset,
            filters: {
              status: 'past',
              eventTypeIds: null, teamIds: null, userIds: null,
              attendeeName: null, attendeeEmail: null, bookingUid: null,
              afterStartDate: null, beforeEndDate: null,
            },
          },
          meta: {
            values: {
              'filters.eventTypeIds': ['undefined'], 'filters.teamIds': ['undefined'],
              'filters.userIds': ['undefined'], 'filters.attendeeName': ['undefined'],
              'filters.attendeeEmail': ['undefined'], 'filters.bookingUid': ['undefined'],
              'filters.afterStartDate': ['undefined'], 'filters.beforeEndDate': ['undefined'],
            },
          },
        },
      }))

      const r = await fetch(`${CAL_BASE}/api/trpc/bookings/get?batch=1&input=${input}`, {
        headers: { cookie: `__Secure-next-auth.session-token=${sessionToken}` },
      })
      if (!r.ok) throw new Error(`cal.com API error: ${r.status}`)
      const d = await r.json()
      const bookings = d[0]?.result?.data?.json?.bookings ?? []
      all.push(...bookings)
      if (bookings.length < limit) break
      offset += limit
    }

    // Normalize to CalendarEvent format
    const events = all.map(b => ({
      uid: b.uid,
      title: b.title ?? b.eventType?.title ?? '(без названия)',
      start: b.startTime,
      end: b.endTime,
      description: b.description ?? undefined,
      location: b.location ?? undefined,
      source: 'cal',
    }))

    // Save session token for user
    await supabase.from('profiles').upsert({ id: user.id, cal_session_token: sessionToken })

    return new Response(JSON.stringify({ events, count: events.length }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response((e as Error).message ?? 'Error', { status: 500, headers: CORS })
  }
})
