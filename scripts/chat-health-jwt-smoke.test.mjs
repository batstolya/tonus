import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runChatHealthJwtSmoke } from './edge-function-smoke/chat-health-jwt-boundary.mjs'

const PROJECT_REF = 'mxnmubakfzqoosgsqmhh'
const URL = `https://${PROJECT_REF}.supabase.co`
const USER_ID = '11111111-1111-4111-8111-111111111111'

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

function response(status, json) {
  return new Response(json === undefined ? null : JSON.stringify(json), {
    status,
    headers: json === undefined ? {} : { 'content-type': 'application/json' },
  })
}

test('checks missing, malformed, and signed-user paths and proves synthetic cleanup', async () => {
  const calls = []
  const userToken = jwt({
    role: 'authenticated',
    iss: `${URL}/auth/v1`,
    sub: USER_ID,
    exp: 4_102_444_800,
  })
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? 'GET', headers: options.headers, body: options.body })
    if (String(url).endsWith('/auth/v1/admin/users') && options.method === 'POST') {
      return response(200, { id: USER_ID })
    }
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      return response(200, { access_token: userToken })
    }
    if (String(url).endsWith('/functions/v1/chat-health')) {
      const authorization = options.headers.authorization
      if (!authorization || authorization === 'Bearer malformed') return response(401)
      return response(400)
    }
    if (String(url).endsWith(`/auth/v1/admin/users/${USER_ID}`) && options.method === 'DELETE') {
      return response(200, {})
    }
    if (String(url).endsWith(`/auth/v1/admin/users/${USER_ID}`) && !options.method) {
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
      { id: 'signed-user-reaches-handler', status: 'passed', httpStatus: 400 },
      { id: 'synthetic-user-deleted', status: 'passed', httpStatus: 404 },
    ],
  })
  assert.equal(calls.filter((call) => call.url.includes('/functions/v1/chat-health')).length, 3)
  assert.equal(JSON.stringify(result).includes('access_token'), false)
  assert.equal(JSON.stringify(result).includes(USER_ID), false)
})

test('records a sanitized failed assertion and still attempts cleanup', async () => {
  let cleanupCalls = 0
  const userToken = jwt({
    role: 'authenticated', iss: `${URL}/auth/v1`, sub: USER_ID, exp: 4_102_444_800,
  })
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/admin/users') && options.method === 'POST') {
      return response(200, { id: USER_ID })
    }
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      return response(200, { access_token: userToken })
    }
    if (String(url).endsWith('/functions/v1/chat-health')) return response(500)
    if (String(url).endsWith(`/auth/v1/admin/users/${USER_ID}`) && options.method === 'DELETE') {
      cleanupCalls += 1
      return response(200, {})
    }
    if (String(url).endsWith(`/auth/v1/admin/users/${USER_ID}`)) return response(404)
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

  assert.equal(result.status, 'failed')
  assert.equal(result.assertions.some((item) => item.status === 'failed'), true)
  assert.equal(cleanupCalls, 1)
  assert.doesNotMatch(JSON.stringify(result), /unexpected|token|11111111/)
})

test('recovers an exact synthetic user by email when create response loses its ID', async () => {
  let accountExists = true
  let deleteCalls = 0
  const fixtureId = '22222222-2222-4222-8222-222222222222'
  const exactEmail = `codex-chat-health-smoke-${fixtureId}@example.invalid`
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/admin/users') && options.method === 'POST') {
      return response(200, {})
    }
    if (String(url).includes('/auth/v1/admin/users?page=')) {
      return response(200, {
        users: accountExists ? [{ id: USER_ID, email: exactEmail }] : [],
      })
    }
    if (String(url).endsWith(`/auth/v1/admin/users/${USER_ID}`) && options.method === 'DELETE') {
      deleteCalls += 1
      accountExists = false
      return response(200, {})
    }
    if (String(url).endsWith(`/auth/v1/admin/users/${USER_ID}`)) return response(404)
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
  assert.deepEqual(result.assertions.at(-1), {
    id: 'synthetic-user-deleted', status: 'passed', httpStatus: 404,
  })
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${USER_ID}|${exactEmail}`))
})

test('deletes a known synthetic user even when the admin user list is unavailable', async () => {
  let deleteCalls = 0
  const userToken = jwt({
    role: 'authenticated', iss: `${URL}/auth/v1`, sub: USER_ID, exp: 4_102_444_800,
  })
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/admin/users') && options.method === 'POST') {
      return response(200, { id: USER_ID })
    }
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      return response(200, { access_token: userToken })
    }
    if (String(url).endsWith('/functions/v1/chat-health')) return response(500)
    if (String(url).endsWith(`/auth/v1/admin/users/${USER_ID}`) && options.method === 'DELETE') {
      deleteCalls += 1
      return response(204)
    }
    if (String(url).endsWith(`/auth/v1/admin/users/${USER_ID}`)) return response(404)
    if (String(url).includes('/auth/v1/admin/users?page=')) throw new Error('transient-list-failure')
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
  assert.equal(deleteCalls, 1)
  assert.deepEqual(result.assertions.at(-1), {
    id: 'synthetic-user-deleted', status: 'failed',
  })
  assert.doesNotMatch(JSON.stringify(result), /transient-list-failure|11111111/)
})
