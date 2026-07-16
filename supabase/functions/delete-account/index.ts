import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeadersFor } from '../_shared/cors.ts'
import { consumeRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts'
import { deleteAccount, isValidDeletionConfirmation } from '../_shared/accountDeletion.ts'

// Complete account deletion (beta-safety PR 6, spec §4).
// Requires the current user JWT (gateway verify_jwt=true) PLUS a fresh
// server-side password check and the literal confirmation word. Deletes
// Storage objects, every user-owned row (delete_user_data RPC, guarded by
// scripts/delete-user-data-coverage.test.mjs), then the auth account itself.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ALLOWED_ORIGINS = Deno.env.get('TONUS_ALLOWED_ORIGINS') ?? ''

const BUCKET = 'health-photos'

serve(async (req) => {
  const CORS = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS)
  const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const authHeader = req.headers.get('Authorization') ?? ''
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user?.email) return new Response('Unauthorized', { status: 401, headers: CORS })

    // Brute-force guard for the password field below; also caps repeats.
    if (!await consumeRateLimit(supabase, { bucket: `delete-account:${user.id}`, limit: 5, windowSeconds: 3600 })) {
      return rateLimitedResponse(JSON_HEADERS)
    }

    const body = await req.json().catch(() => null) as { password?: unknown; confirm?: unknown } | null
    if (!isValidDeletionConfirmation(body?.confirm)) {
      return new Response(JSON.stringify({ error: 'confirmation_required' }), { status: 400, headers: JSON_HEADERS })
    }
    if (typeof body?.password !== 'string' || !body.password) {
      return new Response(JSON.stringify({ error: 'reauth_failed' }), { status: 403, headers: JSON_HEADERS })
    }

    // Recent re-authentication: the password must verify right now.
    const reauthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error: reauthErr } = await reauthClient.auth.signInWithPassword({ email: user.email, password: body.password })
    if (reauthErr) {
      return new Response(JSON.stringify({ error: 'reauth_failed' }), { status: 403, headers: JSON_HEADERS })
    }

    const result = await deleteAccount({
      listUserObjects: async () => {
        const paths: string[] = []
        const queue = [user.id]
        while (queue.length > 0) {
          const prefix = queue.shift() as string
          const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
          if (error) return { paths: [], error }
          for (const entry of data ?? []) {
            const full = `${prefix}/${entry.name}`
            // Storage folders come back without an object id.
            if (entry.id) paths.push(full)
            else queue.push(full)
          }
        }
        return { paths, error: null }
      },
      removeObjects: async (paths) => {
        const { error } = await supabase.storage.from(BUCKET).remove(paths)
        return { error }
      },
      deleteUserRows: async () => {
        const { data, error } = await supabase.rpc('delete_user_data', { p_user_id: user.id })
        return { data: (data ?? null) as Record<string, number> | null, error }
      },
      deleteAuthUser: async () => {
        const { error } = await supabase.auth.admin.deleteUser(user.id)
        return { error }
      },
    }, user.id)

    if (!result.ok) {
      return new Response(JSON.stringify({ error: 'deletion_failed', stage: result.stage }), { status: 500, headers: JSON_HEADERS })
    }
    return new Response(JSON.stringify({ deleted: true }), { headers: JSON_HEADERS })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: JSON_HEADERS })
  }
})
