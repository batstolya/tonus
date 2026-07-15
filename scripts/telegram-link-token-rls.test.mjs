import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runTelegramLinkTokenRlsSmoke } from './security/telegram-link-token-rls-smoke.mjs'

const migration = readFileSync(
  new URL('../supabase/migrations/20260715090000_telegram_link_tokens_rls.sql', import.meta.url),
  'utf8',
)

test('telegram link tokens are owner-scoped and least-privilege', () => {
  assert.match(migration, /alter table public\.telegram_link_tokens enable row level security/i)
  assert.match(migration, /revoke all on table public\.telegram_link_tokens from anon/i)
  assert.match(migration, /revoke all on table public\.telegram_link_tokens from authenticated/i)
  assert.match(migration, /grant select, insert, delete on table public\.telegram_link_tokens to authenticated/i)
  assert.match(migration, /for select[\s\S]*auth\.uid\(\) = user_id/i)
  assert.match(migration, /for insert[\s\S]*auth\.uid\(\) = user_id/i)
  assert.match(migration, /for delete[\s\S]*auth\.uid\(\) = user_id/i)
  assert.doesNotMatch(migration, /disable row level security/i)
})

test('live smoke proves anonymous and cross-user token access is denied', async () => {
  const projectRef = 'mxnmubakfzqoosgsqmhh'
  const url = `https://${projectRef}.supabase.co`
  const victimId = '11111111-1111-4111-8111-111111111111'
  const attackerId = '22222222-2222-4222-8222-222222222222'
  const fixtureId = '33333333-3333-4333-8333-333333333333'
  const victimToken = `victim-${fixtureId}`
  const attackerToken = `attacker-${fixtureId}`
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const jwt = (claims) => `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`
  const anon = jwt({ role: 'anon', ref: projectRef, iss: 'supabase', exp: 4_102_444_800 })
  const service = jwt({ role: 'service_role', ref: projectRef, iss: 'supabase', exp: 4_102_444_800 })
  const userJwt = jwt({ role: 'authenticated', sub: attackerId, exp: 4_102_444_800 })
  const rows = new Map([[victimToken, victimId]])

  const response = (status, body) => new Response(
    body === undefined ? null : JSON.stringify(body),
    { status, headers: body === undefined ? {} : { 'content-type': 'application/json' } },
  )
  const fetchImpl = async (input, options = {}) => {
    const requestUrl = new URL(String(input))
    const auth = options.headers?.authorization
    if (requestUrl.pathname === '/auth/v1/admin/users' && options.method === 'POST') {
      const body = JSON.parse(options.body)
      return response(200, { id: body.email.includes('-victim-') ? victimId : attackerId })
    }
    if (requestUrl.pathname === '/auth/v1/token') return response(200, { access_token: userJwt })
    if (requestUrl.pathname === '/rest/v1/telegram_link_tokens') {
      const token = requestUrl.searchParams.get('token')?.replace(/^eq\./, '')
        ?? JSON.parse(options.body ?? '{}').token
      const userId = JSON.parse(options.body ?? '{}').user_id
      if (auth === `Bearer ${anon}`) return response(401)
      if (auth === `Bearer ${service}`) {
        if (options.method === 'POST') rows.set(token, userId)
        if (options.method === 'DELETE') rows.delete(token)
        return options.method ? response(options.method === 'POST' ? 201 : 204) : response(200,
          rows.has(token) ? [{ token, user_id: rows.get(token) }] : [])
      }
      if (options.method === 'POST') {
        if (userId !== attackerId) return response(403)
        rows.set(token, userId)
        return response(201)
      }
      if (options.method === 'DELETE') {
        if (rows.get(token) === attackerId) rows.delete(token)
        return response(204)
      }
      return response(200, rows.get(token) === attackerId ? [{ token, user_id: attackerId }] : [])
    }
    if (requestUrl.pathname.startsWith('/auth/v1/admin/users/')) {
      return response(options.method === 'DELETE' ? 204 : 404)
    }
    if (requestUrl.pathname === '/rest/v1/profiles') return response(200, [])
    throw new Error(`unexpected request: ${options.method ?? 'GET'} ${requestUrl.pathname}`)
  }

  const result = await runTelegramLinkTokenRlsSmoke({
    projectRef,
    reviewedSha: 'a'.repeat(40),
    env: {
      SUPABASE_URL: url,
      SUPABASE_ANON_KEY: anon,
      SUPABASE_SERVICE_ROLE_KEY: service,
    },
    fetchImpl,
    randomUUID: () => fixtureId,
  })

  assert.equal(result.status, 'passed')
  assert.equal(result.assertions.length, 7)
  assert.equal(result.assertions.every((assertion) => assertion.status === 'passed'), true)
  assert.equal(rows.has(victimToken), false)
  assert.equal(rows.has(attackerToken), false)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${victimId}|${attackerId}|${fixtureId}`))
})
