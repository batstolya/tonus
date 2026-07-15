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

function validateCredential(token, projectRef, role) {
  const claims = decodeClaims(token)
  check(claims.role === role, 'unexpected-jwt-role')
  check(claims.ref === projectRef && claims.iss === 'supabase', 'unexpected-jwt-project')
  check(Number.isFinite(claims.exp) && claims.exp > Math.floor(Date.now() / 1000), 'expired-jwt')
}

function headers(key, authorization = key, json = false) {
  return {
    apikey: key,
    authorization: `Bearer ${authorization}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  }
}

async function request(fetchImpl, url, options, acceptedStatuses) {
  const response = await fetchImpl(url, {
    ...options,
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  check(acceptedStatuses.includes(response.status), 'unexpected-http-status')
  let json = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error('invalid-json')
    }
  }
  return { status: response.status, json }
}

function tokenUrl(baseUrl, token, select = 'token,user_id') {
  const endpoint = new URL(`${baseUrl}/rest/v1/telegram_link_tokens`)
  endpoint.searchParams.set('select', select)
  endpoint.searchParams.set('token', `eq.${token}`)
  return endpoint
}

async function tokenRows(fetchImpl, baseUrl, key, authorization, token) {
  const result = await request(
    fetchImpl,
    tokenUrl(baseUrl, token),
    { headers: headers(key, authorization) },
    [200],
  )
  check(Array.isArray(result.json), 'invalid-token-response')
  return result.json
}

async function findExactUserIds(fetchImpl, baseUrl, service, email) {
  const ids = new Set()
  const perPage = 100
  for (let page = 1; page <= 100; page += 1) {
    const endpoint = new URL(`${baseUrl}/auth/v1/admin/users`)
    endpoint.searchParams.set('page', String(page))
    endpoint.searchParams.set('per_page', String(perPage))
    const result = await request(
      fetchImpl,
      endpoint,
      { headers: headers(service) },
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

async function deleteAndVerifyUser(fetchImpl, baseUrl, service, userId) {
  const deleted = await request(
    fetchImpl,
    `${baseUrl}/auth/v1/admin/users/${userId}`,
    {
      method: 'DELETE',
      headers: headers(service, service, true),
      body: JSON.stringify({ should_soft_delete: false }),
    },
    [200, 204],
  )
  check([200, 204].includes(deleted.status), 'synthetic-user-delete-failed')
  const verified = await request(
    fetchImpl,
    `${baseUrl}/auth/v1/admin/users/${userId}`,
    { headers: headers(service) },
    [404],
  )
  check(verified.status === 404, 'synthetic-user-still-present')
}

function assertion(id, passed, httpStatus = 200) {
  return { id, status: passed ? 'passed' : 'failed', httpStatus }
}

export async function runTelegramLinkTokenRlsSmoke({
  projectRef,
  reviewedSha,
  env = process.env,
  fetchImpl = fetch,
  randomUUID = nodeRandomUUID,
}) {
  const assertions = []
  const userIds = []
  const fixtureEmails = []
  let baseUrl = null
  let serviceKey = null
  let fixtureTokens = []
  let cleanupAttempted = false

  try {
    check(PROJECT_REF_PATTERN.test(projectRef), 'invalid-project-ref')
    check(SHA_PATTERN.test(reviewedSha), 'invalid-reviewed-sha')
    const url = env.SUPABASE_URL
    const anon = env.SUPABASE_ANON_KEY
    const service = env.SUPABASE_SERVICE_ROLE_KEY
    check(url === `https://${projectRef}.supabase.co`, 'unexpected-supabase-url')
    validateCredential(anon, projectRef, 'anon')
    validateCredential(service, projectRef, 'service_role')
    baseUrl = url
    serviceKey = service

    const fixtureId = randomUUID()
    const victimToken = `victim-${fixtureId}`
    const attackerToken = `attacker-${fixtureId}`
    const forgedToken = `forged-${fixtureId}`
    fixtureTokens = [victimToken, attackerToken, forgedToken]
    const users = []
    for (const role of ['victim', 'attacker']) {
      const email = `codex-token-rls-${role}-${fixtureId}@example.invalid`
      fixtureEmails.push(email)
      const password = `Tn!${fixtureId}aA9`
      const created = await request(
        fetchImpl,
        `${url}/auth/v1/admin/users`,
        {
          method: 'POST',
          headers: headers(service, service, true),
          body: JSON.stringify({ email, password, email_confirm: true }),
        },
        [200],
      )
      const id = created.json?.id ?? created.json?.user?.id
      check(typeof id === 'string' && id.length > 0, 'synthetic-user-id-missing')
      userIds.push(id)
      users.push({ role, email, password, id })
    }
    const victim = users.find((user) => user.role === 'victim')
    const attacker = users.find((user) => user.role === 'attacker')
    check(Boolean(victim && attacker), 'synthetic-user-role-missing')

    await request(
      fetchImpl,
      `${url}/rest/v1/telegram_link_tokens`,
      {
        method: 'POST',
        headers: { ...headers(service, service, true), prefer: 'return=minimal' },
        body: JSON.stringify({
          token: victimToken,
          user_id: victim.id,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        }),
      },
      [201],
    )

    const signedIn = await request(
      fetchImpl,
      `${url}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: { apikey: anon, 'content-type': 'application/json' },
        body: JSON.stringify({ email: attacker.email, password: attacker.password }),
      },
      [200],
    )
    const attackerJwt = signedIn.json?.access_token
    check(typeof attackerJwt === 'string' && attackerJwt.length > 0, 'synthetic-user-token-missing')

    const anonymous = await request(
      fetchImpl,
      tokenUrl(url, victimToken),
      { headers: headers(anon) },
      [401, 403],
    )
    assertions.push(assertion('anonymous-token-read-denied', true, anonymous.status))

    const crossRows = await tokenRows(fetchImpl, url, anon, attackerJwt, victimToken)
    assertions.push(assertion('cross-user-token-read-denied', crossRows.length === 0))

    const crossDelete = await request(
      fetchImpl,
      tokenUrl(url, victimToken, 'token'),
      { method: 'DELETE', headers: headers(anon, attackerJwt) },
      [204],
    )
    const victimRows = await tokenRows(fetchImpl, url, service, service, victimToken)
    assertions.push(assertion(
      'cross-user-token-delete-denied',
      victimRows.length === 1 && victimRows[0]?.user_id === victim.id,
      crossDelete.status,
    ))

    const crossInsert = await request(
      fetchImpl,
      `${url}/rest/v1/telegram_link_tokens`,
      {
        method: 'POST',
        headers: { ...headers(anon, attackerJwt, true), prefer: 'return=minimal' },
        body: JSON.stringify({
          token: forgedToken,
          user_id: victim.id,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        }),
      },
      [403],
    )
    assertions.push(assertion('cross-user-token-insert-denied', true, crossInsert.status))

    const ownInsert = await request(
      fetchImpl,
      `${url}/rest/v1/telegram_link_tokens`,
      {
        method: 'POST',
        headers: { ...headers(anon, attackerJwt, true), prefer: 'return=minimal' },
        body: JSON.stringify({
          token: attackerToken,
          user_id: attacker.id,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        }),
      },
      [201],
    )
    const ownRows = await tokenRows(fetchImpl, url, anon, attackerJwt, attackerToken)
    const ownDelete = await request(
      fetchImpl,
      tokenUrl(url, attackerToken, 'token'),
      { method: 'DELETE', headers: headers(anon, attackerJwt) },
      [204],
    )
    const ownAfter = await tokenRows(fetchImpl, url, service, service, attackerToken)
    assertions.push(assertion(
      'owner-token-lifecycle-allowed',
      ownInsert.status === 201
        && ownRows.length === 1
        && ownRows[0]?.user_id === attacker.id
        && ownDelete.status === 204
        && ownAfter.length === 0,
    ))
  } catch {
    assertions.push({ id: 'smoke-harness-execution', status: 'failed' })
  } finally {
    if (baseUrl && serviceKey) {
      cleanupAttempted = true
      let usersDeleted = true
      let dataDeleted = true
      const knownUserIds = new Set(userIds)
      const deletedUserIds = new Set()
      for (const token of fixtureTokens) {
        try {
          await request(
            fetchImpl,
            tokenUrl(baseUrl, token, 'token'),
            { method: 'DELETE', headers: headers(serviceKey) },
            [204],
          )
        } catch {
          dataDeleted = false
        }
      }
      for (const userId of userIds) {
        try {
          await deleteAndVerifyUser(fetchImpl, baseUrl, serviceKey, userId)
          deletedUserIds.add(userId)
        } catch {
          usersDeleted = false
        }
      }
      for (const email of fixtureEmails) {
        try {
          const recoveredIds = await findExactUserIds(fetchImpl, baseUrl, serviceKey, email)
          for (const userId of recoveredIds) {
            knownUserIds.add(userId)
            if (deletedUserIds.has(userId)) continue
            await deleteAndVerifyUser(fetchImpl, baseUrl, serviceKey, userId)
            deletedUserIds.add(userId)
          }
          const remainingIds = await findExactUserIds(fetchImpl, baseUrl, serviceKey, email)
          check(remainingIds.size === 0, 'synthetic-user-email-still-present')
        } catch {
          usersDeleted = false
        }
      }
      for (const token of fixtureTokens) {
        try {
          if ((await tokenRows(fetchImpl, baseUrl, serviceKey, serviceKey, token)).length !== 0) {
            dataDeleted = false
          }
        } catch {
          dataDeleted = false
        }
      }
      for (const userId of knownUserIds) {
        try {
          const endpoint = new URL(`${baseUrl}/rest/v1/profiles`)
          endpoint.searchParams.set('select', 'id')
          endpoint.searchParams.set('id', `eq.${userId}`)
          const result = await request(
            fetchImpl,
            endpoint,
            { headers: headers(serviceKey) },
            [200],
          )
          if (!Array.isArray(result.json) || result.json.length !== 0) dataDeleted = false
        } catch {
          dataDeleted = false
        }
      }
      assertions.push(assertion('synthetic-users-deleted', usersDeleted, usersDeleted ? 404 : 500))
      assertions.push(assertion('synthetic-data-deleted', dataDeleted, dataDeleted ? 200 : 500))
    }
  }

  if (!cleanupAttempted) {
    assertions.push({ id: 'synthetic-users-deleted', status: 'failed' })
    assertions.push({ id: 'synthetic-data-deleted', status: 'failed' })
  }
  return {
    status: assertions.length === 7 && assertions.every((item) => item.status === 'passed')
      ? 'passed'
      : 'failed',
    assertions,
  }
}

function directArgs(argv) {
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
    result = await runTelegramLinkTokenRlsSmoke(directArgs(process.argv.slice(2)))
  } catch {
    result = {
      status: 'failed',
      assertions: [{ id: 'smoke-harness-execution', status: 'failed' }],
    }
  }
  console.log(JSON.stringify(result))
}
