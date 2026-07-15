import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runChatHealthJwtSmoke } from './edge-function-smoke/chat-health-jwt-boundary.mjs'

const PROJECT_REF = 'mxnmubakfzqoosgsqmhh'
const URL = `https://${PROJECT_REF}.supabase.co`
const VICTIM_ID = '11111111-1111-4111-8111-111111111111'
const ATTACKER_ID = '22222222-2222-4222-8222-222222222222'
const SESSION_ID = '33333333-3333-4333-8333-333333333333'
const ATTACKER_SESSION_ID = '44444444-4444-4444-8444-444444444444'

function jwt(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`
}

const env = {
  SUPABASE_URL: URL,
  SUPABASE_ANON_KEY: jwt({
    role: 'anon', ref: PROJECT_REF, iss: 'supabase', exp: 4_102_444_800,
  }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({
    role: 'service_role', ref: PROJECT_REF, iss: 'supabase', exp: 4_102_444_800,
  }),
}

function response(status, json, headers = {}) {
  return new Response(json === undefined ? null : JSON.stringify(json), {
    status,
    headers: {
      ...(json === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
  })
}

function syntheticSession(options) {
  const body = JSON.parse(options.body)
  return response(201, [{ id: body.user_id === VICTIM_ID ? SESSION_ID : ATTACKER_SESSION_ID }])
}

function isSyntheticDataRead(url, options = {}) {
  return (options.method ?? 'GET') === 'GET'
    && ['/rest/v1/profiles', '/rest/v1/ai_usage', '/rest/v1/chat_sessions', '/rest/v1/chat_messages']
      .some((path) => String(url).includes(path))
}

test('checks the production header shape, cross-user ownership, and synthetic cleanup', async () => {
  const calls = []
  const userToken = jwt({
    role: 'authenticated',
    iss: `${URL}/auth/v1`,
    sub: ATTACKER_ID,
    exp: 4_102_444_800,
  })
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? 'GET', headers: options.headers, body: options.body })
    if (String(url).endsWith('/auth/v1/admin/users') && options.method === 'POST') {
      const body = JSON.parse(options.body)
      return response(200, {
        id: body.email.includes('-victim-') ? VICTIM_ID : ATTACKER_ID,
      })
    }
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      return response(200, { access_token: userToken })
    }
    if (String(url).endsWith('/functions/v1/chat-health')) {
      if (options.method === 'OPTIONS') {
        return response(200, undefined, {
          'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
        })
      }
      const authorization = options.headers.authorization
      if (!authorization || authorization === 'Bearer malformed') return response(401)
      const body = JSON.parse(options.body)
      if (body.sessionId === SESSION_ID) return response(404)
      if (body.sessionId === ATTACKER_SESSION_ID) return response(413)
      return response(400)
    }
    if (String(url).includes('/rest/v1/profiles') && options.method === 'PATCH') {
      return response(200, [{ ai_budget_usd: 0.01 }])
    }
    if (String(url).endsWith('/rest/v1/ai_usage') && options.method === 'POST') {
      return response(201, [{ tokens_used: 100_000 }])
    }
    if (String(url).endsWith('/rest/v1/chat_sessions') && options.method === 'POST') {
      return syntheticSession(options)
    }
    if (
      ['/rest/v1/profiles', '/rest/v1/ai_usage', '/rest/v1/chat_sessions', '/rest/v1/chat_messages']
        .some((path) => String(url).includes(path))
      && !options.method
    ) {
      return response(200, [])
    }
    if (
      [VICTIM_ID, ATTACKER_ID].some((id) => String(url).endsWith(`/auth/v1/admin/users/${id}`))
      && options.method === 'DELETE'
    ) {
      return response(200, {})
    }
    if (
      [VICTIM_ID, ATTACKER_ID].some((id) => String(url).endsWith(`/auth/v1/admin/users/${id}`))
      && !options.method
    ) {
      return response(404)
    }
    if (String(url).includes('/auth/v1/admin/users?page=')) return response(200, { users: [] })
    throw new Error('unexpected request')
  }

  const result = await runChatHealthJwtSmoke({
    projectRef: PROJECT_REF,
    reviewedSha: 'a'.repeat(40),
    env,
    fetchImpl,
    randomUUID: () => '22222222-2222-4222-8222-222222222222',
  })

  assert.deepEqual(result, {
    status: 'passed',
    assertions: [
      { id: 'missing-auth-denied', status: 'passed', httpStatus: 401 },
      { id: 'malformed-auth-denied', status: 'passed', httpStatus: 401 },
      { id: 'production-caller-reaches-handler', status: 'passed', httpStatus: 400 },
      { id: 'cors-preflight-allowed', status: 'passed', httpStatus: 200 },
      { id: 'foreign-session-denied', status: 'passed', httpStatus: 404 },
      { id: 'owned-session-reaches-safe-stop', status: 'passed', httpStatus: 413 },
      { id: 'synthetic-users-deleted', status: 'passed', httpStatus: 404 },
      { id: 'synthetic-data-deleted', status: 'passed', httpStatus: 200 },
    ],
  })
  assert.equal(calls.filter((call) => call.url.includes('/functions/v1/chat-health')).length, 6)
  const signedCalls = calls.filter((call) => call.headers?.authorization === `Bearer ${userToken}`)
  assert.equal(signedCalls.every((call) => call.headers.apikey === env.SUPABASE_ANON_KEY), true)
  assert.equal(JSON.stringify(result).includes('access_token'), false)
  assert.doesNotMatch(
    JSON.stringify(result),
    new RegExp(`${VICTIM_ID}|${ATTACKER_ID}|${SESSION_ID}|${ATTACKER_SESSION_ID}`),
  )
  for (const table of ['profiles', 'ai_usage', 'chat_sessions', 'chat_messages']) {
    assert.equal(calls.some((call) => call.url.includes(`/rest/v1/${table}?`)), true)
  }
})

test('fails when a foreign session reaches the oversized-input stop instead of ownership denial', async () => {
  const userToken = jwt({
    role: 'authenticated', iss: `${URL}/auth/v1`, sub: ATTACKER_ID, exp: 4_102_444_800,
  })
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/admin/users') && options.method === 'POST') {
      const body = JSON.parse(options.body)
      return response(200, { id: body.email.includes('-victim-') ? VICTIM_ID : ATTACKER_ID })
    }
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      return response(200, { access_token: userToken })
    }
    if (String(url).includes('/rest/v1/profiles') && options.method === 'PATCH') {
      return response(200, [{ ai_budget_usd: 0.01 }])
    }
    if (String(url).endsWith('/rest/v1/ai_usage') && options.method === 'POST') {
      return response(201, [{ tokens_used: 100_000 }])
    }
    if (String(url).endsWith('/rest/v1/chat_sessions') && options.method === 'POST') {
      return syntheticSession(options)
    }
    if (String(url).endsWith('/functions/v1/chat-health')) {
      const authorization = options.headers.authorization
      if (!authorization || authorization === 'Bearer malformed') return response(401)
      const body = JSON.parse(options.body)
      return response(body.sessionId === SESSION_ID || body.sessionId === ATTACKER_SESSION_ID ? 413 : 400)
    }
    if (
      [VICTIM_ID, ATTACKER_ID].some((id) => String(url).endsWith(`/auth/v1/admin/users/${id}`))
      && options.method === 'DELETE'
    ) return response(204)
    if ([VICTIM_ID, ATTACKER_ID].some((id) => String(url).endsWith(`/auth/v1/admin/users/${id}`))) {
      return response(404)
    }
    if (String(url).includes('/auth/v1/admin/users?page=')) return response(200, { users: [] })
    if (isSyntheticDataRead(url, options)) return response(200, [])
    throw new Error('unexpected request')
  }

  const result = await runChatHealthJwtSmoke({
    projectRef: PROJECT_REF,
    reviewedSha: 'a'.repeat(40),
    env,
    fetchImpl,
    randomUUID: () => '44444444-4444-4444-8444-444444444444',
  })

  assert.equal(result.status, 'failed')
  assert.deepEqual(result.assertions.find((item) => item.id === 'foreign-session-denied'), {
    id: 'foreign-session-denied', status: 'failed', httpStatus: 413,
  })
  assert.deepEqual(result.assertions.find((item) => item.id === 'synthetic-users-deleted'), {
    id: 'synthetic-users-deleted', status: 'passed', httpStatus: 404,
  })
  assert.deepEqual(result.assertions.find((item) => item.id === 'synthetic-data-deleted'), {
    id: 'synthetic-data-deleted', status: 'passed', httpStatus: 200,
  })
})

test('records a sanitized failed assertion and still attempts cleanup', async () => {
  let cleanupCalls = 0
  const userToken = jwt({
    role: 'authenticated', iss: `${URL}/auth/v1`, sub: ATTACKER_ID, exp: 4_102_444_800,
  })
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/admin/users') && options.method === 'POST') {
      const body = JSON.parse(options.body)
      return response(200, { id: body.email.includes('-victim-') ? VICTIM_ID : ATTACKER_ID })
    }
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      return response(200, { access_token: userToken })
    }
    if (String(url).includes('/rest/v1/profiles') && options.method === 'PATCH') {
      return response(200, [{ ai_budget_usd: 0.01 }])
    }
    if (String(url).endsWith('/rest/v1/ai_usage') && options.method === 'POST') {
      return response(201, [{ tokens_used: 100_000 }])
    }
    if (String(url).endsWith('/rest/v1/chat_sessions') && options.method === 'POST') {
      return syntheticSession(options)
    }
    if (String(url).endsWith('/functions/v1/chat-health')) return response(500)
    if (
      [VICTIM_ID, ATTACKER_ID].some((id) => String(url).endsWith(`/auth/v1/admin/users/${id}`))
      && options.method === 'DELETE'
    ) {
      cleanupCalls += 1
      return response(200, {})
    }
    if ([VICTIM_ID, ATTACKER_ID].some((id) => String(url).endsWith(`/auth/v1/admin/users/${id}`))) {
      return response(404)
    }
    if (String(url).includes('/auth/v1/admin/users?page=')) return response(200, { users: [] })
    if (isSyntheticDataRead(url, options)) return response(200, [])
    throw new Error('unexpected request')
  }

  const result = await runChatHealthJwtSmoke({
    projectRef: PROJECT_REF,
    reviewedSha: 'a'.repeat(40),
    env,
    fetchImpl,
    randomUUID: () => '22222222-2222-4222-8222-222222222222',
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.assertions.some((item) => item.status === 'failed'), true)
  assert.equal(cleanupCalls, 2)
  assert.doesNotMatch(JSON.stringify(result), /unexpected|token|11111111|22222222|33333333/)
})

test('recovers an exact synthetic user by email when create response loses its ID', async () => {
  let accountExists = true
  let deleteCalls = 0
  const fixtureId = '22222222-2222-4222-8222-222222222222'
  const exactEmail = `codex-chat-health-smoke-victim-${fixtureId}@example.invalid`
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/admin/users') && options.method === 'POST') {
      return response(200, {})
    }
    if (String(url).includes('/auth/v1/admin/users?page=')) {
      return response(200, {
        users: accountExists ? [{ id: VICTIM_ID, email: exactEmail }] : [],
      })
    }
    if (String(url).endsWith(`/auth/v1/admin/users/${VICTIM_ID}`) && options.method === 'DELETE') {
      deleteCalls += 1
      accountExists = false
      return response(200, {})
    }
    if (String(url).endsWith(`/auth/v1/admin/users/${VICTIM_ID}`)) return response(404)
    if (isSyntheticDataRead(url, options)) return response(200, [])
    throw new Error('unexpected request')
  }

  const result = await runChatHealthJwtSmoke({
    projectRef: PROJECT_REF,
    reviewedSha: 'a'.repeat(40),
    env,
    fetchImpl,
    randomUUID: () => fixtureId,
  })

  assert.equal(result.status, 'failed')
  assert.equal(deleteCalls, 1)
  assert.deepEqual(result.assertions.find((item) => item.id === 'synthetic-users-deleted'), {
    id: 'synthetic-users-deleted', status: 'passed', httpStatus: 404,
  })
  assert.deepEqual(result.assertions.find((item) => item.id === 'synthetic-data-deleted'), {
    id: 'synthetic-data-deleted', status: 'passed', httpStatus: 200,
  })
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${VICTIM_ID}|${exactEmail}`))
})

test('deletes a known synthetic user even when the admin user list is unavailable', async () => {
  let deleteCalls = 0
  const userToken = jwt({
    role: 'authenticated', iss: `${URL}/auth/v1`, sub: ATTACKER_ID, exp: 4_102_444_800,
  })
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/admin/users') && options.method === 'POST') {
      const body = JSON.parse(options.body)
      return response(200, { id: body.email.includes('-victim-') ? VICTIM_ID : ATTACKER_ID })
    }
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      return response(200, { access_token: userToken })
    }
    if (String(url).includes('/rest/v1/profiles') && options.method === 'PATCH') {
      return response(200, [{ ai_budget_usd: 0.01 }])
    }
    if (String(url).endsWith('/rest/v1/ai_usage') && options.method === 'POST') {
      return response(201, [{ tokens_used: 100_000 }])
    }
    if (String(url).endsWith('/rest/v1/chat_sessions') && options.method === 'POST') {
      return syntheticSession(options)
    }
    if (String(url).endsWith('/functions/v1/chat-health')) return response(500)
    if (
      [VICTIM_ID, ATTACKER_ID].some((id) => String(url).endsWith(`/auth/v1/admin/users/${id}`))
      && options.method === 'DELETE'
    ) {
      deleteCalls += 1
      return response(204)
    }
    if ([VICTIM_ID, ATTACKER_ID].some((id) => String(url).endsWith(`/auth/v1/admin/users/${id}`))) {
      return response(404)
    }
    if (String(url).includes('/auth/v1/admin/users?page=')) throw new Error('transient-list-failure')
    if (isSyntheticDataRead(url, options)) return response(200, [])
    throw new Error('unexpected request')
  }

  const result = await runChatHealthJwtSmoke({
    projectRef: PROJECT_REF,
    reviewedSha: 'a'.repeat(40),
    env,
    fetchImpl,
    randomUUID: () => '22222222-2222-4222-8222-222222222222',
  })

  assert.equal(result.status, 'failed')
  assert.equal(deleteCalls, 2)
  assert.deepEqual(result.assertions.find((item) => item.id === 'synthetic-users-deleted'), {
    id: 'synthetic-users-deleted', status: 'failed',
  })
  assert.deepEqual(result.assertions.find((item) => item.id === 'synthetic-data-deleted'), {
    id: 'synthetic-data-deleted', status: 'passed', httpStatus: 200,
  })
  assert.doesNotMatch(JSON.stringify(result), /transient-list-failure|11111111/)
})
