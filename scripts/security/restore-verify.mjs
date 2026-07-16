// Post-restore smoke verification (beta-safety PR 7).
// Runs ONLY against a scratch Supabase project (production ref is refused).
//
//   SECURITY_MATRIX_SUPABASE_URL=https://<scratch-ref>.supabase.co \
//   SECURITY_MATRIX_SERVICE_ROLE_KEY=<scratch service key> \
//   SECURITY_MATRIX_ANON_KEY=<scratch anon key> \
//   node scripts/security/restore-verify.mjs
//
// Proves the restored schema matches the security inventory: every table and
// view answers a service-role read, every inventoried RPC exists, anonymous
// reads of protected tables are denied or empty, and auth sign-up works.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { assertIsolatedTarget } from '../security-negative-matrix-lib.mjs'

const PRODUCTION_REF = 'mxnmubakfzqoosgsqmhh'

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

const url = process.env.SECURITY_MATRIX_SUPABASE_URL
const serviceKey = process.env.SECURITY_MATRIX_SERVICE_ROLE_KEY
const anonKey = process.env.SECURITY_MATRIX_ANON_KEY
if (!url || !serviceKey || !anonKey) {
  fail('SECURITY_MATRIX_SUPABASE_URL, SECURITY_MATRIX_SERVICE_ROLE_KEY and SECURITY_MATRIX_ANON_KEY are required')
}
assertIsolatedTarget(url, PRODUCTION_REF)

const inventory = JSON.parse(readFileSync('security/inventory.generated.json', 'utf8'))
const service = createClient(url, serviceKey, { auth: { persistSession: false } })
const anon = createClient(url, anonKey, { auth: { persistSession: false } })

// 1. Every inventoried table/view exists and answers a service-role read.
for (const surface of [...inventory.surfaces.tables, ...inventory.surfaces.views]) {
  const { error } = await service.from(surface.name).select('*', { head: true, count: 'exact' }).limit(1)
  if (error) fail(`schema surface missing or unreadable after restore: ${surface.name} (${error.message})`)
}
console.log(`schema: ${inventory.surfaces.tables.length} tables + ${inventory.surfaces.views.length} views present`)

// 2. Every inventoried RPC exists (invalid-arg probe must not return 404).
for (const rpc of inventory.surfaces.rpcs) {
  const { error } = await service.rpc(rpc.name, {})
  if (error && /function .* does not exist|Could not find the function/i.test(error.message) && !/without parameters/i.test(error.message)) {
    fail(`RPC missing after restore: ${rpc.name} (${error.message})`)
  }
}
console.log(`rpcs: ${inventory.surfaces.rpcs.length} present`)

// 3. Anonymous access to protected tables is denied or returns nothing.
for (const table of inventory.surfaces.tables.filter(t => t.exposure !== 'public-reference')) {
  const { data, error } = await anon.from(table.name).select('*').limit(1)
  if (!error && Array.isArray(data) && data.length > 0) {
    fail(`anonymous read exposed data on ${table.name} after restore`)
  }
}
console.log('rls: anonymous reads denied or empty on all protected tables')

// 4. Auth works: a fixture user can sign up and sign in.
const email = `restore-fixture-${Date.now()}@example.com`
const password = `Fixture-${crypto.randomUUID()}`
const { data: created, error: createErr } = await service.auth.admin.createUser({ email, password, email_confirm: true })
if (createErr) fail(`auth createUser failed after restore: ${createErr.message}`)
const { error: signInErr } = await anon.auth.signInWithPassword({ email, password })
if (signInErr) fail(`auth sign-in failed after restore: ${signInErr.message}`)
await service.auth.admin.deleteUser(created.user.id)
console.log('auth: sign-up and sign-in work')

// 5. Storage bucket exists.
const { error: bucketErr } = await service.storage.from('health-photos').list('', { limit: 1 })
if (bucketErr) fail(`health-photos bucket missing after restore: ${bucketErr.message}`)
console.log('storage: health-photos bucket present')

console.log('OK: restore smoke passed — record the dated restore log per docs/guides/backup-restore.md')
