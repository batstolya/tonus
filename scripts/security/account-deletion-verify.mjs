// Isolated end-to-end verification of complete account deletion (PR 6).
// Runs ONLY against a scratch Supabase project (production ref is refused).
//
//   SECURITY_MATRIX_SUPABASE_URL=https://<scratch-ref>.supabase.co \
//   SECURITY_MATRIX_SERVICE_ROLE_KEY=<scratch service key> \
//   node scripts/security/account-deletion-verify.mjs
//
// Creates a fixture user, seeds one row into every user-owned inventory table
// (payloads derived from database.types.ts + SEED_OVERRIDES), uploads one
// storage object, runs the deletion steps in production order, then proves no
// accessible residue remains. Fails loudly if any table could not be seeded —
// extend SEED_OVERRIDES rather than skipping a surface.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import ts from 'typescript'
import { assertIsolatedTarget } from '../security-negative-matrix-lib.mjs'

const PRODUCTION_REF = 'mxnmubakfzqoosgsqmhh'
const BUCKET = 'health-photos'

// Columns whose valid values the generated types cannot express
// (check constraints, semantic formats). Extend as the schema grows.
const SEED_OVERRIDES = {
  reminder_events: { status: 'pending' },
  scheduled_reports: { status: 'pending' },
  imports: { status: 'done' },
  research_runs: { status: 'done' },
  health_alerts: { level: 'info', type: 'anomaly' },
}

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

const url = process.env.SECURITY_MATRIX_SUPABASE_URL
const serviceKey = process.env.SECURITY_MATRIX_SERVICE_ROLE_KEY
if (!url || !serviceKey) fail('SECURITY_MATRIX_SUPABASE_URL and SECURITY_MATRIX_SERVICE_ROLE_KEY are required')
assertIsolatedTarget(url, PRODUCTION_REF)

const inventory = JSON.parse(readFileSync('security/inventory.generated.json', 'utf8'))
const userOwned = inventory.surfaces.tables.filter(t => t.exposure === 'user-owned')

// ── Parse Insert requirements + FK relationships from database.types.ts ─────
const typesSource = readFileSync('packages/shared/src/database.types.ts', 'utf8')
const file = ts.createSourceFile('database.types.ts', typesSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

function memberByName(node, name) {
  return node?.members?.find(m => m.name && m.name.text === name)?.type
}
const database = file.statements.find(s => ts.isTypeAliasDeclaration(s) && s.name.text === 'Database')
const publicSchema = memberByName(database.type, 'public')
const tablesNode = memberByName(publicSchema, 'Tables')

function tableMeta(name) {
  const tableNode = memberByName(tablesNode, name)
  if (!tableNode) fail(`table ${name} missing from database.types.ts`)
  const insert = memberByName(tableNode, 'Insert')
  const required = []
  for (const member of insert.members) {
    if (member.questionToken) continue
    required.push({ name: member.name.text, type: member.type.getText(file) })
  }
  const relationships = []
  const relNode = memberByName(tableNode, 'Relationships')
  if (relNode && ts.isTupleTypeNode(relNode)) {
    for (const element of relNode.elements) {
      const cols = memberByName(element, 'columns')
      const ref = memberByName(element, 'referencedRelation')
      if (!cols || !ref) continue
      const column = cols.getText(file).match(/"([^"]+)"/)?.[1]
      const referenced = ref.getText(file).match(/"([^"]+)"/)?.[1]
      if (column && referenced) relationships.push({ column, referenced })
    }
  }
  return { required, relationships }
}

function dummyFor(column, typeText) {
  if (/"[^"]+"/.test(typeText)) return typeText.match(/"([^"]+)"/)[1] // literal union → first literal
  if (typeText.includes('string')) {
    if (/date|day$/.test(column)) return '2026-01-01'
    if (/_at$|^ts$|time/.test(column)) return '2026-01-01T00:00:00Z'
    return 'deletion-fixture'
  }
  if (typeText.includes('number')) return 1
  if (typeText.includes('boolean')) return false
  if (typeText.includes('Json')) return {}
  if (typeText.includes('[]')) return []
  return 'deletion-fixture'
}

// ── Run ─────────────────────────────────────────────────────────────────────
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const email = `deletion-fixture-${Date.now()}@example.com`
const password = `Fixture-${crypto.randomUUID()}`

const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (createErr) fail(`fixture user creation failed: ${createErr.message}`)
const userId = created.user.id
console.log(`fixture user created (${userId.slice(0, 8)}…)`)

// Seed parents before children (reverse of the deletion order).
const seeded = new Map() // table → created row id (when it has one)
const pending = new Set(userOwned.map(t => t.name))
let progress = true
while (pending.size > 0 && progress) {
  progress = false
  for (const name of [...pending]) {
    const meta = tableMeta(name)
    const parentDeps = meta.relationships.filter(r => pending.has(r.referenced) && r.referenced !== name)
    if (parentDeps.length > 0) continue // wait for parents
    const row = {}
    for (const { name: col, type } of meta.required) row[col] = dummyFor(col, type)
    for (const { column, referenced } of meta.relationships) {
      if (seeded.has(referenced)) row[column] = seeded.get(referenced)
    }
    if (name === 'profiles') row.id = userId
    else row.user_id = userId
    Object.assign(row, SEED_OVERRIDES[name] ?? {})
    const { data, error } = await admin.from(name).insert(row).select().maybeSingle()
    if (error) fail(`seeding ${name} failed: ${error.message} — extend SEED_OVERRIDES`)
    if (data?.id) seeded.set(name, data.id)
    pending.delete(name)
    progress = true
  }
}
if (pending.size > 0) fail(`unseedable tables (dependency cycle?): ${[...pending].join(', ')}`)
console.log(`seeded ${userOwned.length} user-owned tables`)

const objectPath = `${userId}/concerns/fixture.txt`
const { error: uploadErr } = await admin.storage.from(BUCKET).upload(objectPath, new Blob(['fixture']), { contentType: 'text/plain' })
if (uploadErr) fail(`storage seed failed: ${uploadErr.message}`)

// ── Delete in production order: storage → rows → auth user ─────────────────
const { error: removeErr } = await admin.storage.from(BUCKET).remove([objectPath])
if (removeErr) fail(`storage removal failed: ${removeErr.message}`)
const { data: counts, error: rpcErr } = await admin.rpc('delete_user_data', { p_user_id: userId })
if (rpcErr) fail(`delete_user_data failed: ${rpcErr.message}`)
const { error: authErr } = await admin.auth.admin.deleteUser(userId)
if (authErr) fail(`auth deletion failed: ${authErr.message}`)

// ── Prove zero residue ──────────────────────────────────────────────────────
for (const table of userOwned) {
  const column = table.name === 'profiles' ? 'id' : 'user_id'
  const { data, error } = await admin.from(table.name).select(column).eq(column, userId).limit(1)
  if (error) fail(`residue check ${table.name} failed: ${error.message}`)
  if (data.length > 0) fail(`residue remains in ${table.name}`)
}
const { data: leftovers } = await admin.storage.from(BUCKET).list(userId, { limit: 1 })
if ((leftovers ?? []).length > 0) fail('storage residue remains')
const anon = createClient(url, serviceKey, { auth: { persistSession: false } })
const { error: signInErr } = await anon.auth.signInWithPassword({ email, password })
if (!signInErr) fail('deleted user can still authenticate')

console.log('deleted counts:', JSON.stringify(counts))
console.log('OK: complete deletion verified — no accessible residue, sign-in impossible')
