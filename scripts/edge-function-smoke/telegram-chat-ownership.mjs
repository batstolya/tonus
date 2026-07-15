#!/usr/bin/env node

import { randomUUID as nodeRandomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/

function check(condition, code) {
  if (!condition) throw new Error(code)
}

function decodeClaims(token) {
  const parts = String(token).split('.')
  check(parts.length === 3 && parts.every(Boolean), 'invalid-jwt')
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    throw new Error('invalid-jwt')
  }
}

function validateServiceCredential(token, projectRef) {
  const claims = decodeClaims(token)
  check(claims.role === 'service_role', 'unexpected-jwt-role')
  check(claims.ref === projectRef && claims.iss === 'supabase', 'unexpected-jwt-project')
  check(Number.isFinite(claims.exp) && claims.exp > Math.floor(Date.now() / 1000), 'expired-jwt')
}

function adminHeaders(service, json = false) {
  return {
    apikey: service,
    authorization: `Bearer ${service}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  }
}

async function jsonRequest(fetchImpl, url, options, acceptedStatuses) {
  const response = await fetchImpl(url, {
    ...options,
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  check(acceptedStatuses.includes(response.status), 'unexpected-http-status')
  if (!text) return { status: response.status, json: null }
  try {
    return { status: response.status, json: JSON.parse(text) }
  } catch {
    throw new Error('invalid-json')
  }
}

async function invokeWebhook(fetchImpl, url, body, secret) {
  const headers = { 'content-type': 'application/json' }
  if (secret !== null) headers['x-telegram-bot-api-secret-token'] = secret
  const response = await fetchImpl(`${url}/functions/v1/telegram-bot`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  await response.arrayBuffer()
  return response.status
}

function statusAssertion(id, actual, expected) {
  return { id, status: actual === expected ? 'passed' : 'failed', httpStatus: actual }
}

async function restRows(fetchImpl, url, service, table, query = {}) {
  const endpoint = new URL(`${url}/rest/v1/${table}`)
  for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, value)
  const result = await jsonRequest(fetchImpl, endpoint, { headers: adminHeaders(service) }, [200])
  check(Array.isArray(result.json), 'invalid-rest-response')
  return result.json
}

async function findExactUserIds(fetchImpl, url, service, email) {
  const ids = new Set()
  const perPage = 100
  for (let page = 1; page <= 100; page += 1) {
    const endpoint = new URL(`${url}/auth/v1/admin/users`)
    endpoint.searchParams.set('page', String(page))
    endpoint.searchParams.set('per_page', String(perPage))
    const result = await jsonRequest(fetchImpl, endpoint, { headers: adminHeaders(service) }, [200])
    check(Array.isArray(result.json?.users), 'invalid-admin-user-list')
    for (const user of result.json.users) {
      if (user?.email === email && typeof user.id === 'string') ids.add(user.id)
    }
    if (result.json.users.length < perPage) return ids
  }
  throw new Error('admin-user-page-limit')
}

async function deleteAndVerifyUser(fetchImpl, url, service, id) {
  const deleted = await fetchImpl(`${url}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(service, true),
    body: JSON.stringify({ should_soft_delete: false }),
    signal: AbortSignal.timeout(30_000),
  })
  await deleted.arrayBuffer()
  check([200, 204].includes(deleted.status), 'synthetic-user-delete-failed')
  const verified = await fetchImpl(`${url}/auth/v1/admin/users/${id}`, {
    headers: adminHeaders(service),
    signal: AbortSignal.timeout(30_000),
  })
  await verified.arrayBuffer()
  check(verified.status === 404, 'synthetic-user-still-present')
}

async function verifyNoSyntheticRows(fetchImpl, url, service, userIds) {
  const surfaces = [
    { table: 'profiles', ownerColumn: 'id' },
    { table: 'ai_usage', ownerColumn: 'user_id' },
    { table: 'chat_sessions', ownerColumn: 'user_id' },
    { table: 'chat_messages', ownerColumn: 'user_id' },
    { table: 'telegram_links', ownerColumn: 'user_id' },
  ]
  for (const { table, ownerColumn } of surfaces) {
    for (const userId of userIds) {
      const rows = await restRows(fetchImpl, url, service, table, {
        select: 'id',
        [ownerColumn]: `eq.${userId}`,
        limit: '1',
      })
      check(rows.length === 0, 'synthetic-data-still-present')
    }
  }
}

function booleanAssertion(id, passed) {
  return { id, status: passed ? 'passed' : 'failed', httpStatus: 200 }
}

export async function runTelegramChatOwnershipSmoke({
  projectRef,
  reviewedSha,
  env = process.env,
  fetchImpl = fetch,
  randomUUID = nodeRandomUUID,
}) {
  const assertions = []
  const fixtures = []
  const fixtureEmails = []
  const knownFixtureIds = new Set()
  let baseUrl = null
  let serviceKey = null
  let cleanupAttempted = false

  try {
    check(PROJECT_REF_PATTERN.test(projectRef), 'invalid-project-ref')
    check(SHA_PATTERN.test(reviewedSha), 'invalid-reviewed-sha')
    const url = env.SUPABASE_URL
    const service = env.SUPABASE_SERVICE_ROLE_KEY
    const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET
    check(url === `https://${projectRef}.supabase.co`, 'unexpected-supabase-url')
    check(typeof webhookSecret === 'string' && webhookSecret.length >= 24, 'missing-webhook-secret')
    validateServiceCredential(service, projectRef)
    baseUrl = url
    serviceKey = service

    const fixtureId = randomUUID()
    const syntheticChatId = `codex-smoke-${fixtureId}`
    for (const role of ['victim', 'attacker']) {
      const email = `codex-telegram-smoke-${role}-${fixtureId}@example.invalid`
      fixtureEmails.push(email)
      const created = await jsonRequest(
        fetchImpl,
        `${url}/auth/v1/admin/users`,
        {
          method: 'POST',
          headers: adminHeaders(service, true),
          body: JSON.stringify({
            email,
            password: `Tn!${randomUUID()}aA9`,
            email_confirm: true,
            user_metadata: { purpose: `telegram-chat-ownership-smoke-${role}` },
          }),
        },
        [200],
      )
      const id = created.json?.id ?? created.json?.user?.id
      check(typeof id === 'string' && id.length > 0, 'synthetic-user-id-missing')
      knownFixtureIds.add(id)
      fixtures.push({ role, id })
    }

    const victim = fixtures.find((fixture) => fixture.role === 'victim')
    const attacker = fixtures.find((fixture) => fixture.role === 'attacker')
    check(Boolean(victim && attacker), 'synthetic-user-role-missing')

    const sessionCreated = await jsonRequest(
      fetchImpl,
      `${url}/rest/v1/chat_sessions`,
      {
        method: 'POST',
        headers: { ...adminHeaders(service, true), prefer: 'return=representation' },
        body: JSON.stringify({ user_id: victim.id }),
      },
      [201],
    )
    const victimSessionId = sessionCreated.json?.[0]?.id
    check(typeof victimSessionId === 'string' && victimSessionId.length > 0, 'synthetic-session-id-missing')
    const markerCreated = await jsonRequest(
      fetchImpl,
      `${url}/rest/v1/chat_messages`,
      {
        method: 'POST',
        headers: { ...adminHeaders(service, true), prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: victim.id,
          session_id: victimSessionId,
          role: 'user',
          content: 'synthetic ownership marker',
        }),
      },
      [201],
    )
    check(Array.isArray(markerCreated.json) && markerCreated.json.length === 1, 'synthetic-marker-missing')
    const linkCreated = await jsonRequest(
      fetchImpl,
      `${url}/rest/v1/telegram_links`,
      {
        method: 'POST',
        headers: { ...adminHeaders(service, true), prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: attacker.id,
          telegram_chat_id: syntheticChatId,
          status: 'active',
          tg_session_id: victimSessionId,
        }),
      },
      [201],
    )
    check(Array.isArray(linkCreated.json) && linkCreated.json.length === 1, 'synthetic-link-missing')

    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 1_700_000_000,
        chat: { id: syntheticChatId, type: 'private' },
        text: 'x'.repeat(4097),
      },
    }
    assertions.push(statusAssertion(
      'missing-webhook-secret-denied',
      await invokeWebhook(fetchImpl, url, update, null),
      401,
    ))
    assertions.push(statusAssertion(
      'wrong-webhook-secret-denied',
      await invokeWebhook(fetchImpl, url, update, `${webhookSecret}-wrong`),
      401,
    ))
    assertions.push(statusAssertion(
      'authenticated-smoke-reaches-handler',
      await invokeWebhook(fetchImpl, url, update, webhookSecret),
      200,
    ))

    const links = await restRows(fetchImpl, url, service, 'telegram_links', {
      select: 'user_id,tg_session_id',
      telegram_chat_id: `eq.${syntheticChatId}`,
      user_id: `eq.${attacker.id}`,
    })
    const replacementId = links.length === 1 ? links[0]?.tg_session_id : null
    assertions.push(booleanAssertion(
      'foreign-session-replaced',
      typeof replacementId === 'string' && replacementId !== victimSessionId,
    ))

    const replacementRows = typeof replacementId === 'string'
      ? await restRows(fetchImpl, url, service, 'chat_sessions', {
          select: 'id,user_id', id: `eq.${replacementId}`, user_id: `eq.${attacker.id}`,
        })
      : []
    assertions.push(booleanAssertion('replacement-owned-by-attacker', replacementRows.length === 1))

    const victimRows = await restRows(fetchImpl, url, service, 'chat_sessions', {
      select: 'id,user_id', id: `eq.${victimSessionId}`, user_id: `eq.${victim.id}`,
    })
    const victimMessages = await restRows(fetchImpl, url, service, 'chat_messages', {
      select: 'id,user_id,session_id', session_id: `eq.${victimSessionId}`,
    })
    assertions.push(booleanAssertion(
      'victim-session-untouched',
      victimRows.length === 1
      && victimMessages.length === 1
      && victimMessages[0]?.user_id === victim.id,
    ))

    const attackerMessages = await restRows(fetchImpl, url, service, 'chat_messages', {
      select: 'id', user_id: `eq.${attacker.id}`,
    })
    const attackerUsage = await restRows(fetchImpl, url, service, 'ai_usage', {
      select: 'id,tokens_used', user_id: `eq.${attacker.id}`,
    })
    assertions.push(booleanAssertion(
      'no-chat-or-ai-egress-side-effects',
      attackerMessages.length === 0
      && attackerUsage.length === 0,
    ))
  } catch {
    assertions.push({ id: 'smoke-harness-execution', status: 'failed' })
  } finally {
    if (fixtureEmails.length > 0 && baseUrl && serviceKey) {
      cleanupAttempted = true
      let cleanupPassed = true
      const deletedIds = new Set()
      for (const fixture of fixtures) {
        try {
          await deleteAndVerifyUser(fetchImpl, baseUrl, serviceKey, fixture.id)
          deletedIds.add(fixture.id)
        } catch {
          cleanupPassed = false
        }
      }
      for (const email of fixtureEmails) {
        try {
          const ids = await findExactUserIds(fetchImpl, baseUrl, serviceKey, email)
          for (const id of ids) {
            knownFixtureIds.add(id)
            if (deletedIds.has(id)) continue
            await deleteAndVerifyUser(fetchImpl, baseUrl, serviceKey, id)
            deletedIds.add(id)
          }
          const remaining = await findExactUserIds(fetchImpl, baseUrl, serviceKey, email)
          check(remaining.size === 0, 'synthetic-user-email-still-present')
        } catch {
          cleanupPassed = false
        }
      }
      assertions.push(cleanupPassed
        ? { id: 'synthetic-users-deleted', status: 'passed', httpStatus: 404 }
        : { id: 'synthetic-users-deleted', status: 'failed' })

      let dataCleanupPassed = true
      try {
        await verifyNoSyntheticRows(fetchImpl, baseUrl, serviceKey, knownFixtureIds)
      } catch {
        dataCleanupPassed = false
      }
      assertions.push(dataCleanupPassed
        ? { id: 'synthetic-data-deleted', status: 'passed', httpStatus: 200 }
        : { id: 'synthetic-data-deleted', status: 'failed' })
    }
  }

  if (!cleanupAttempted) {
    assertions.push({ id: 'synthetic-users-deleted', status: 'failed' })
    assertions.push({ id: 'synthetic-data-deleted', status: 'failed' })
  }
  return {
    status: assertions.length === 9 && assertions.every((assertion) => assertion.status === 'passed')
      ? 'passed'
      : 'failed',
    assertions,
  }
}

function parseDirectArguments(argv) {
  if (argv.length !== 4 || argv[0] !== '--project-ref' || argv[2] !== '--reviewed-sha') {
    throw new Error('invalid-arguments')
  }
  return { projectRef: argv[1], reviewedSha: argv[3] }
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isDirectExecution()) {
  let result
  try {
    result = await runTelegramChatOwnershipSmoke(parseDirectArguments(process.argv.slice(2)))
  } catch {
    result = {
      status: 'failed',
      assertions: [{ id: 'smoke-harness-execution', status: 'failed' }],
    }
  }
  console.log(JSON.stringify(result))
}
