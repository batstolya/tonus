import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  assertIsolatedTarget,
  assertReadOutcome,
  buildCredentialProbes,
  buildRelationReadTargets,
} from './security-negative-matrix-lib.mjs'

const targetUrl = process.env.SECURITY_MATRIX_SUPABASE_URL ?? ''
const anonKey = process.env.SECURITY_MATRIX_ANON_KEY ?? ''
const serviceRoleKey = process.env.SECURITY_MATRIX_SERVICE_ROLE_KEY ?? ''
const productionRef = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? ''

if (!targetUrl || !anonKey || !serviceRoleKey) {
  throw new Error('set SECURITY_MATRIX_SUPABASE_URL, SECURITY_MATRIX_ANON_KEY, and SECURITY_MATRIX_SERVICE_ROLE_KEY')
}
assertIsolatedTarget(targetUrl, productionRef)

const inventory = JSON.parse(readFileSync('security/inventory.generated.json', 'utf8'))
const service = createClient(targetUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const anonymousHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
const suffix = crypto.randomUUID()
const password = `Tonus-matrix-${crypto.randomUUID()}!`
const users = []
const seededObjects = []

async function createSyntheticUser(label) {
  const email = `tonus-security-${label}-${suffix}@example.invalid`
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`failed to create synthetic user ${label}`)
  users.push(data.user.id)
  return { id: data.user.id, email }
}

async function readAs(headers, surface, ownerId, expectVisible = false) {
  const query = new URLSearchParams({ select: surface.ownerColumn ?? '*', limit: '1' })
  if (surface.ownerColumn) query.set(surface.ownerColumn, `eq.${ownerId}`)
  const response = await fetch(`${targetUrl}/rest/v1/${surface.name}?${query}`, { headers })
  const rows = response.status === 200 ? await response.json() : null
  assertReadOutcome(response.status, rows, expectVisible, `${surface.kind}:${surface.name}`)
}

async function seedCanaries(userId) {
  const rows = [
    ['ideas', { user_id: userId, text: `security-matrix-${suffix}` }],
    ['context_notes', { user_id: userId, date: '2099-01-01', note: `security-matrix-${suffix}` }],
  ]
  for (const [table, row] of rows) {
    const { error } = await service.from(table).insert(row)
    if (error) throw new Error(`failed to seed ${table}`)
  }
}

async function checkStorage(userA, userB, userAId) {
  for (const bucket of inventory.surfaces.buckets) {
    const path = `${userAId}/security-matrix-${suffix}.txt`
    const { error: uploadError } = await service.storage.from(bucket.name)
      .upload(path, new TextEncoder().encode('synthetic security matrix fixture'), { contentType: 'text/plain' })
    if (uploadError) throw new Error(`failed to seed storage bucket ${bucket.name}`)
    seededObjects.push([bucket.name, path])

    const { data: ownerDownload, error: ownerDownloadError } = await userA.storage.from(bucket.name).download(path)
    if (ownerDownloadError || !ownerDownload) throw new Error(`bucket:${bucket.name} owner positive control failed`)
    const { data: listed, error: listError } = await userB.storage.from(bucket.name).list(userAId)
    if (!listError && (listed?.length ?? 0) > 0) throw new Error(`bucket:${bucket.name} exposed a cross-user listing`)
    const { data: downloaded, error: downloadError } = await userB.storage.from(bucket.name).download(path)
    if (!downloadError || downloaded) throw new Error(`bucket:${bucket.name} exposed a cross-user object`)
  }
}

async function checkCustomFunctionCredentials() {
  const probes = buildCredentialProbes(inventory.surfaces.edgeFunctions)
  for (const probe of probes) {
    const response = await fetch(`${targetUrl}/functions/v1/${probe.functionName}${probe.query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...probe.headers },
      body: '{}',
    })
    if (![401, 403, 503].includes(response.status)) {
      throw new Error(`function:${probe.functionName}:${probe.variant} returned ${response.status}`)
    }
  }
  return probes.length
}

let relationChecks = 0
let functionChecks = 0
try {
  const userA = await createSyntheticUser('a')
  const userBIdentity = await createSyntheticUser('b')
  const userAClient = createClient(targetUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const userB = createClient(targetUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userASession, error: userASignInError } = await userAClient.auth.signInWithPassword({
    email: userA.email,
    password,
  })
  if (userASignInError || !userASession.session) throw new Error('failed to sign in synthetic user A')
  const { data: session, error: signInError } = await userB.auth.signInWithPassword({
    email: userBIdentity.email,
    password,
  })
  if (signInError || !session.session) throw new Error('failed to sign in synthetic user B')
  const userAHeaders = { apikey: anonKey, Authorization: `Bearer ${userASession.session.access_token}` }
  const userBHeaders = { apikey: anonKey, Authorization: `Bearer ${session.session.access_token}` }

  await seedCanaries(userA.id)
  const relationTargets = buildRelationReadTargets(inventory)
  for (const canaryName of ['profiles', 'ideas', 'context_notes']) {
    const surface = relationTargets.find(target => target.name === canaryName)
    if (!surface) throw new Error(`missing positive-control surface: ${canaryName}`)
    await readAs(userAHeaders, surface, userA.id, true)
  }
  for (const surface of relationTargets) {
    await readAs(anonymousHeaders, surface, userA.id)
    await readAs(userBHeaders, surface, userA.id)
    relationChecks += 2
  }
  await checkStorage(userAClient, userB, userA.id)
  functionChecks = await checkCustomFunctionCredentials()

  console.log(JSON.stringify({
    ok: true,
    relationChecks,
    storageChecks: inventory.surfaces.buckets.length * 2,
    positiveControls: 3 + inventory.surfaces.buckets.length,
    functionChecks,
    syntheticUsers: 2,
  }))
} finally {
  for (const [bucket, path] of seededObjects) await service.storage.from(bucket).remove([path])
  if (users[0]) {
    await service.from('ideas').delete().eq('user_id', users[0])
    await service.from('context_notes').delete().eq('user_id', users[0])
  }
  for (const id of users.reverse()) await service.auth.admin.deleteUser(id)
}
