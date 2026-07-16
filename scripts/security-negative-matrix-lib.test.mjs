import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  assertIsolatedTarget,
  assertReadOutcome,
  buildCredentialProbes,
  buildRelationReadTargets,
} from './security-negative-matrix-lib.mjs'

test('refuses the linked production project before integration work', () => {
  assert.throws(() => assertIsolatedTarget(
    'https://mxnmubakfzqoosgsqmhh.supabase.co',
    'mxnmubakfzqoosgsqmhh',
  ), /refusing production project/)
  assert.doesNotThrow(() => assertIsolatedTarget('http://127.0.0.1:54321', 'production-ref'))
  assert.doesNotThrow(() => assertIsolatedTarget('https://scratchref.supabase.co', 'production-ref'))
})

test('the executable runner refuses production before creating clients or users', () => {
  const result = spawnSync(process.execPath, ['scripts/run-security-negative-matrix.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECURITY_MATRIX_SUPABASE_URL: 'https://mxnmubakfzqoosgsqmhh.supabase.co',
      SECURITY_MATRIX_ANON_KEY: 'synthetic-anon',
      SECURITY_MATRIX_SERVICE_ROLE_KEY: 'synthetic-service',
    },
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /refusing production project/)
})

test('builds owner-filtered read targets without public reference surfaces', () => {
  const inventory = {
    surfaces: {
      tables: [
        { name: 'notes', exposure: 'user-owned', ownerColumn: 'user_id' },
        { name: 'internal', exposure: 'service-only', ownerColumn: null },
        { name: 'countries', exposure: 'public-reference', ownerColumn: null },
      ],
      views: [{ name: 'summary', exposure: 'user-owned-view', ownerColumn: 'user_id' }],
    },
  }
  assert.deepEqual(buildRelationReadTargets(inventory), [
    { kind: 'table', name: 'internal', exposure: 'service-only', ownerColumn: null },
    { kind: 'table', name: 'notes', exposure: 'user-owned', ownerColumn: 'user_id' },
    { kind: 'view', name: 'summary', exposure: 'user-owned-view', ownerColumn: 'user_id' },
  ])
})

test('maps every custom credential class to side-effect-free missing and invalid probes', () => {
  const functions = [
    { name: 'cron', verifyJwt: false, credentialType: 'cron-secret' },
    { name: 'ingest', verifyJwt: false, credentialType: 'ingest-token' },
    { name: 'internal', verifyJwt: false, credentialType: 'user-or-internal-secret-or-service-role' },
    { name: 'internal-only', verifyJwt: false, credentialType: 'user-or-internal-secret' },
    { name: 'telegram', verifyJwt: false, credentialType: 'telegram-webhook-secret' },
    { name: 'user', verifyJwt: true, credentialType: 'user-jwt' },
  ]
  const probes = buildCredentialProbes(functions)

  assert.deepEqual(probes.map(probe => `${probe.functionName}:${probe.variant}`), [
    'cron:missing', 'cron:invalid', 'ingest:missing', 'ingest:invalid',
    'internal:missing', 'internal:invalid',
    'internal-only:missing', 'internal-only:invalid',
    'telegram:missing', 'telegram:invalid',
  ])
  assert.equal(probes.find(probe => probe.functionName === 'cron' && probe.variant === 'invalid').headers['x-cron-secret'], 'invalid')
  assert.equal(probes.find(probe => probe.functionName === 'ingest' && probe.variant === 'invalid').query, '?token=invalid')
  assert.equal(probes.find(probe => probe.functionName === 'telegram' && probe.variant === 'invalid').headers['x-telegram-bot-api-secret-token'], 'invalid')
  assert.equal(probes.find(probe => probe.functionName === 'internal' && probe.variant === 'invalid').headers['x-internal-secret'], 'invalid')
  assert.equal(probes.find(probe => probe.functionName === 'internal-only' && probe.variant === 'invalid').headers['x-internal-secret'], 'invalid')
})

test('requires visible owner canaries and empty-or-denied foreign reads', () => {
  assert.doesNotThrow(() => assertReadOutcome(200, [{ user_id: 'a' }], true, 'owner'))
  assert.throws(() => assertReadOutcome(200, [], true, 'owner'), /owner positive control returned no row/)
  assert.doesNotThrow(() => assertReadOutcome(200, [], false, 'foreign'))
  assert.doesNotThrow(() => assertReadOutcome(403, null, false, 'foreign'))
  assert.throws(() => assertReadOutcome(200, [{ user_id: 'a' }], false, 'foreign'), /foreign exposed a protected row/)
})
