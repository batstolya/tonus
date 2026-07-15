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

function validateCredential(token, { role, projectRef, issuer }) {
  const claims = decodeClaims(token)
  check(claims.role === role, 'unexpected-jwt-role')
  if (projectRef !== undefined) check(claims.ref === projectRef, 'unexpected-jwt-project')
  if (issuer !== undefined) check(claims.iss === issuer, 'unexpected-jwt-issuer')
  check(Number.isFinite(claims.exp) && claims.exp > Math.floor(Date.now() / 1000), 'expired-jwt')
  return claims
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

async function invokeStatus(fetchImpl, url, anon, authorization) {
  const headers = { apikey: anon, 'content-type': 'application/json' }
  if (authorization !== null) headers.authorization = authorization
  const response = await fetchImpl(`${url}/functions/v1/chat-health`, {
    method: 'POST',
    headers,
    body: '{}',
    signal: AbortSignal.timeout(30_000),
  })
  await response.arrayBuffer()
  return response.status
}

function statusAssertion(id, actual, expected) {
  return { id, status: actual === expected ? 'passed' : 'failed', httpStatus: actual }
}

async function findExactUserIds(fetchImpl, url, service, email) {
  const ids = new Set()
  const perPage = 100
  for (let page = 1; page <= 100; page += 1) {
    const endpoint = new URL(`${url}/auth/v1/admin/users`)
    endpoint.searchParams.set('page', String(page))
    endpoint.searchParams.set('per_page', String(perPage))
    const result = await jsonRequest(
      fetchImpl,
      endpoint,
      { headers: adminHeaders(service) },
      [200],
    )
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

export async function runChatHealthJwtSmoke({
  projectRef,
  reviewedSha,
  env = process.env,
  fetchImpl = fetch,
  randomUUID = nodeRandomUUID,
}) {
  const assertions = []
  let userId = null
  let fixtureEmail = null
  let baseUrl = null
  let serviceKey = null
  let cleanupAttempted = false

  try {
    check(PROJECT_REF_PATTERN.test(projectRef), 'invalid-project-ref')
    check(SHA_PATTERN.test(reviewedSha), 'invalid-reviewed-sha')
    const url = env.SUPABASE_URL
    const anon = env.SUPABASE_ANON_KEY
    const service = env.SUPABASE_SERVICE_ROLE_KEY
    check(url === `https://${projectRef}.supabase.co`, 'unexpected-supabase-url')
    check(Boolean(anon && service) && anon !== service, 'missing-api-credentials')
    validateCredential(anon, { role: 'anon', projectRef, issuer: 'supabase' })
    validateCredential(service, { role: 'service_role', projectRef, issuer: 'supabase' })
    baseUrl = url
    serviceKey = service

    const fixtureId = randomUUID()
    const email = `codex-chat-health-smoke-${fixtureId}@example.invalid`
    fixtureEmail = email
    const password = `Tn!${randomUUID()}aA9`
    const created = await jsonRequest(
      fetchImpl,
      `${url}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: adminHeaders(service, true),
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { purpose: 'chat-health-jwt-smoke' },
        }),
      },
      [200],
    )
    userId = created.json?.id ?? created.json?.user?.id
    check(typeof userId === 'string' && userId.length > 0, 'synthetic-user-id-missing')

    const signedIn = await jsonRequest(
      fetchImpl,
      `${url}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: { apikey: anon, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      },
      [200],
    )
    const userToken = signedIn.json?.access_token
    check(Boolean(userToken), 'synthetic-user-token-missing')
    const userClaims = validateCredential(userToken, {
      role: 'authenticated',
      issuer: `${url}/auth/v1`,
    })
    check(userClaims.sub === userId, 'synthetic-user-subject-mismatch')

    assertions.push(statusAssertion(
      'missing-auth-denied',
      await invokeStatus(fetchImpl, url, anon, null),
      401,
    ))
    assertions.push(statusAssertion(
      'malformed-auth-denied',
      await invokeStatus(fetchImpl, url, anon, 'Bearer malformed'),
      401,
    ))
    assertions.push(statusAssertion(
      'signed-user-reaches-handler',
      await invokeStatus(fetchImpl, url, anon, `Bearer ${userToken}`),
      400,
    ))
  } catch {
    assertions.push({ id: 'smoke-harness-execution', status: 'failed' })
  } finally {
    if (fixtureEmail && baseUrl && serviceKey) {
      cleanupAttempted = true
      try {
        const deletedIds = new Set()
        if (userId) {
          await deleteAndVerifyUser(fetchImpl, baseUrl, serviceKey, userId)
          deletedIds.add(userId)
        }
        const ids = await findExactUserIds(fetchImpl, baseUrl, serviceKey, fixtureEmail)
        for (const id of ids) {
          if (deletedIds.has(id)) continue
          await deleteAndVerifyUser(fetchImpl, baseUrl, serviceKey, id)
        }
        const remaining = await findExactUserIds(fetchImpl, baseUrl, serviceKey, fixtureEmail)
        check(remaining.size === 0, 'synthetic-user-email-still-present')
        assertions.push({ id: 'synthetic-user-deleted', status: 'passed', httpStatus: 404 })
      } catch {
        assertions.push({ id: 'synthetic-user-deleted', status: 'failed' })
      }
    }
  }

  if (!cleanupAttempted) {
    assertions.push({ id: 'synthetic-user-deleted', status: 'failed' })
  }
  return {
    status: assertions.length === 4 && assertions.every((assertion) => assertion.status === 'passed')
      ? 'passed'
      : 'failed',
    assertions,
  }
}

function parseDirectArguments(argv) {
  if (
    argv.length !== 4
    || argv[0] !== '--project-ref'
    || argv[2] !== '--reviewed-sha'
  ) throw new Error('invalid-arguments')
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
    result = await runChatHealthJwtSmoke(parseDirectArguments(process.argv.slice(2)))
  } catch {
    result = {
      status: 'failed',
      assertions: [{ id: 'smoke-harness-execution', status: 'failed' }],
    }
  }
  console.log(JSON.stringify(result))
}
