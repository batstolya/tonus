import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runTelegramChatOwnershipSmoke } from './edge-function-smoke/telegram-chat-ownership.mjs'

const PROJECT_REF = 'mxnmubakfzqoosgsqmhh'
const URL = `https://${PROJECT_REF}.supabase.co`
const VICTIM_ID = '11111111-1111-4111-8111-111111111111'
const ATTACKER_ID = '22222222-2222-4222-8222-222222222222'
const VICTIM_SESSION_ID = '33333333-3333-4333-8333-333333333333'
const OWNED_SESSION_ID = '44444444-4444-4444-8444-444444444444'
const WEBHOOK_SECRET = 'synthetic-webhook-secret-with-enough-entropy'

function jwt(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`
}

const env = {
  SUPABASE_URL: URL,
  SUPABASE_SERVICE_ROLE_KEY: jwt({
    role: 'service_role', ref: PROJECT_REF, iss: 'supabase', exp: 4_102_444_800,
  }),
  TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
}

function response(status, json) {
  return new Response(json === undefined ? null : JSON.stringify(json), {
    status,
    headers: json === undefined ? {} : { 'content-type': 'application/json' },
  })
}

function createHappyFetch() {
  const calls = []
  let linkSessionId = VICTIM_SESSION_ID
  let usersDeleted = false
  const fetchImpl = async (input, options = {}) => {
    const url = new globalThis.URL(String(input))
    calls.push({ url: url.toString(), method: options.method ?? 'GET', headers: options.headers, body: options.body })

    if (url.pathname === '/auth/v1/admin/users' && options.method === 'POST') {
      const body = JSON.parse(options.body)
      return response(200, { id: body.email.includes('-victim-') ? VICTIM_ID : ATTACKER_ID })
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/') && options.method === 'DELETE') {
      usersDeleted = true
      return response(204)
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/')) return response(404)
    if (url.pathname === '/auth/v1/admin/users') return response(200, { users: [] })

    if (url.pathname === '/rest/v1/profiles' && options.method === 'PATCH') {
      return response(200, [{ ai_budget_usd: 0.01 }])
    }
    if (url.pathname === '/rest/v1/ai_usage' && options.method === 'POST') {
      return response(201, [{ id: 'usage-id', tokens_used: 100_000 }])
    }
    if (url.pathname === '/rest/v1/chat_sessions' && options.method === 'POST') {
      return response(201, [{ id: VICTIM_SESSION_ID, user_id: VICTIM_ID }])
    }
    if (url.pathname === '/rest/v1/chat_messages' && options.method === 'POST') {
      return response(201, [{ id: 'message-id' }])
    }
    if (url.pathname === '/rest/v1/telegram_links' && options.method === 'POST') {
      return response(201, [{ id: 'link-id' }])
    }

    if (url.pathname === '/functions/v1/telegram-bot') {
      const supplied = options.headers?.['x-telegram-bot-api-secret-token']
      if (supplied !== WEBHOOK_SECRET) return response(401)
      linkSessionId = OWNED_SESSION_ID
      return response(200)
    }

    if (usersDeleted && url.pathname.startsWith('/rest/v1/')) return response(200, [])
    if (url.pathname === '/rest/v1/telegram_links') {
      return response(200, [{ user_id: ATTACKER_ID, tg_session_id: linkSessionId }])
    }
    if (url.pathname === '/rest/v1/chat_sessions') {
      const requestedId = url.searchParams.get('id')
      if (requestedId === `eq.${OWNED_SESSION_ID}`) {
        return response(200, [{ id: OWNED_SESSION_ID, user_id: ATTACKER_ID }])
      }
      return response(200, [{ id: VICTIM_SESSION_ID, user_id: VICTIM_ID }])
    }
    if (url.pathname === '/rest/v1/chat_messages') {
      if (url.searchParams.get('user_id') === `eq.${ATTACKER_ID}`) return response(200, [])
      return response(200, [{ id: 'message-id', user_id: VICTIM_ID, session_id: VICTIM_SESSION_ID }])
    }
    if (url.pathname === '/rest/v1/ai_usage') {
      return response(200, [])
    }
    throw new Error(`unexpected request: ${url.pathname}`)
  }
  return { calls, fetchImpl }
}

test('proves Telegram replaces a foreign session before the no-egress oversized-input stop', async () => {
  const { calls, fetchImpl } = createHappyFetch()
  const result = await runTelegramChatOwnershipSmoke({
    projectRef: PROJECT_REF,
    reviewedSha: 'a'.repeat(40),
    env,
    fetchImpl,
    randomUUID: () => '55555555-5555-4555-8555-555555555555',
  })

  assert.deepEqual(result, {
    status: 'passed',
    assertions: [
      { id: 'missing-webhook-secret-denied', status: 'passed', httpStatus: 401 },
      { id: 'wrong-webhook-secret-denied', status: 'passed', httpStatus: 401 },
      { id: 'authenticated-smoke-reaches-handler', status: 'passed', httpStatus: 200 },
      { id: 'foreign-session-replaced', status: 'passed', httpStatus: 200 },
      { id: 'replacement-owned-by-attacker', status: 'passed', httpStatus: 200 },
      { id: 'victim-session-untouched', status: 'passed', httpStatus: 200 },
      { id: 'no-chat-or-ai-egress-side-effects', status: 'passed', httpStatus: 200 },
      { id: 'synthetic-users-deleted', status: 'passed', httpStatus: 404 },
      { id: 'synthetic-data-deleted', status: 'passed', httpStatus: 200 },
    ],
  })
  assert.equal(calls.filter((call) => call.url.includes('/functions/v1/telegram-bot')).length, 3)
  assert.doesNotMatch(
    JSON.stringify(result),
    new RegExp(`${VICTIM_ID}|${ATTACKER_ID}|${VICTIM_SESSION_ID}|${OWNED_SESSION_ID}|${WEBHOOK_SECRET}`),
  )
})

test('fails if the authenticated Telegram path leaves the foreign session in place', async () => {
  const { fetchImpl: baseFetch } = createHappyFetch()
  const fetchImpl = async (input, options = {}) => {
    const url = new globalThis.URL(String(input))
    if (
      url.pathname === '/functions/v1/telegram-bot'
      && options.headers?.['x-telegram-bot-api-secret-token'] === WEBHOOK_SECRET
    ) return response(200)
    return baseFetch(input, options)
  }

  const result = await runTelegramChatOwnershipSmoke({
    projectRef: PROJECT_REF,
    reviewedSha: 'a'.repeat(40),
    env,
    fetchImpl,
    randomUUID: () => '55555555-5555-4555-8555-555555555555',
  })

  assert.equal(result.status, 'failed')
  assert.deepEqual(result.assertions.find((item) => item.id === 'foreign-session-replaced'), {
    id: 'foreign-session-replaced', status: 'failed', httpStatus: 200,
  })
  assert.equal(result.assertions.find((item) => item.id === 'synthetic-users-deleted')?.status, 'passed')
})

test('fails when the sentinel path creates chat or additional AI usage rows', async () => {
  const { fetchImpl: baseFetch } = createHappyFetch()
  const fetchImpl = async (input, options = {}) => {
    const url = new globalThis.URL(String(input))
    if (
      (options.method ?? 'GET') === 'GET'
      && url.pathname === '/rest/v1/chat_messages'
      && url.searchParams.get('user_id') === `eq.${ATTACKER_ID}`
    ) return response(200, [{ id: 'unexpected-message' }])
    if (
      (options.method ?? 'GET') === 'GET'
      && url.pathname === '/rest/v1/ai_usage'
      && url.searchParams.get('user_id') === `eq.${ATTACKER_ID}`
    ) {
      return response(200, [
        { id: 'unexpected-provider-call', tokens_used: 1 },
      ])
    }
    return baseFetch(input, options)
  }

  const result = await runTelegramChatOwnershipSmoke({
    projectRef: PROJECT_REF,
    reviewedSha: 'a'.repeat(40),
    env,
    fetchImpl,
    randomUUID: () => '55555555-5555-4555-8555-555555555555',
  })

  assert.equal(result.status, 'failed')
  assert.deepEqual(result.assertions.find((item) => item.id === 'no-chat-or-ai-egress-side-effects'), {
    id: 'no-chat-or-ai-egress-side-effects', status: 'failed', httpStatus: 200,
  })
  assert.equal(result.assertions.find((item) => item.id === 'synthetic-users-deleted')?.status, 'passed')
})
