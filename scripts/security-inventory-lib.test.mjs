import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSecurityInventory,
  discoverDatabaseSurfaces,
  discoverEdgeFunctions,
  findServiceRpcPermissionFindings,
  validateFindingRemediations,
} from './security-inventory-lib.mjs'

const TYPES = `
export type Database = {
  public: {
    Tables: {
      notes: { Row: { id: string; user_id: string; text: string } }
      profiles: { Row: { id: string; timezone: string } }
      reference_data: { Row: { id: string; label: string } }
    }
    Views: { note_summary: { Row: { user_id: string; total: number } } }
    Functions: { service_job: { Args: { limit_count?: number }; Returns: number } }
  }
}
`

test('discovers public tables, views, RPCs, and ownership columns from generated types', () => {
  assert.deepEqual(discoverDatabaseSurfaces(TYPES), {
    tables: [
      { name: 'notes', columns: ['id', 'text', 'user_id'] },
      { name: 'profiles', columns: ['id', 'timezone'] },
      { name: 'reference_data', columns: ['id', 'label'] },
    ],
    views: [{ name: 'note_summary', columns: ['total', 'user_id'] }],
    rpcs: [{ name: 'service_job' }],
  })
})

test('discovers every function directory and applies secure JWT defaults', () => {
  const config = `
[functions.webhook]
verify_jwt = false

[functions.explicit-user]
verify_jwt = true
`
  assert.deepEqual(discoverEdgeFunctions(['user-api', 'webhook', 'explicit-user'], config, {
    'user-api': "const CORS = { 'Access-Control-Allow-Origin': '*' }; await checkBudget(db, user)",
    webhook: 'serve(handler)',
    'explicit-user': "const origin = req.headers.get('origin'); headers.set('Access-Control-Allow-Origin', origin)",
  }), [
    { name: 'explicit-user', verifyJwt: true, cors: 'restricted', rateLimit: 'none' },
    { name: 'user-api', verifyJwt: true, cors: 'wildcard', rateLimit: 'ai-budget' },
    { name: 'webhook', verifyJwt: false, cors: 'none', rateLimit: 'none' },
  ])
})

test('detects allowlist CORS and durable rate limits from shared helpers', () => {
  assert.deepEqual(discoverEdgeFunctions(['allowlisted', 'token-api', 'ai-chat'], '', {
    allowlisted: "const CORS = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS)",
    'token-api': "await consumeRateLimit(supabase, { bucket: `ingest:${subject}`, limit: 120, windowSeconds: 3600 })",
    'ai-chat': "const CORS = corsHeadersFor(origin, ALLOWED_ORIGINS); await checkBudget(db, u); await consumeRateLimit(db, rule)",
  }), [
    { name: 'ai-chat', verifyJwt: true, cors: 'allowlist', rateLimit: 'ai-budget+durable' },
    { name: 'allowlisted', verifyJwt: true, cors: 'allowlist', rateLimit: 'none' },
    { name: 'token-api', verifyJwt: true, cors: 'none', rateLimit: 'durable' },
  ])
})

test('builds a deterministic fully classified inventory', () => {
  const discovered = {
    ...discoverDatabaseSurfaces(TYPES),
    edgeFunctions: discoverEdgeFunctions(['webhook'], '[functions.webhook]\nverify_jwt = false'),
  }
  const classification = {
    version: 1,
    tables: {
      publicReference: ['reference_data'],
      serviceOnly: [],
      ownerColumnOverrides: { profiles: 'id' },
      credentialTables: [],
    },
    views: {
      note_summary: { authOwner: 'rls:user_id', dataSensitivity: 'health' },
    },
    rpcs: {
      service_job: { signature: 'service_job()', authOwner: 'service-role', credentialType: 'service-role', dataSensitivity: 'internal' },
    },
    buckets: {
      private_files: { authOwner: 'storage-path-owner', dataSensitivity: 'health', public: false },
    },
    edgeFunctions: {
      webhook: {
        authOwner: 'handler:webhook-secret', credentialType: 'webhook-secret',
        cors: 'none', rateLimit: 'none', dataSensitivity: 'health',
      },
    },
  }

  const inventory = buildSecurityInventory(discovered, classification)

  assert.equal(inventory.counts.tables, 3)
  assert.deepEqual(inventory.surfaces.tables.map(row => row.name), ['notes', 'profiles', 'reference_data'])
  assert.deepEqual(inventory.surfaces.tables.find(row => row.name === 'notes'), {
    name: 'notes', ownerColumn: 'user_id', authOwner: 'rls:user_id', dataSensitivity: 'health', exposure: 'user-owned',
  })
  assert.equal(inventory.surfaces.edgeFunctions[0].verifyJwt, false)
})

test('fails when discovered surfaces are missing or stale in reviewed classifications', () => {
  const discovered = {
    ...discoverDatabaseSurfaces(TYPES),
    edgeFunctions: discoverEdgeFunctions(['webhook'], '[functions.webhook]\nverify_jwt = false'),
  }
  const base = {
    version: 1,
    tables: {
      publicReference: ['reference_data'], serviceOnly: [],
      ownerColumnOverrides: { profiles: 'id' }, credentialTables: [],
    },
    views: { note_summary: { authOwner: 'rls:user_id', dataSensitivity: 'health' } },
    rpcs: { service_job: { signature: 'service_job()', authOwner: 'service-role', credentialType: 'service-role', dataSensitivity: 'internal' } },
    buckets: {},
    edgeFunctions: {},
  }

  assert.throws(() => buildSecurityInventory(discovered, base), /missing edge function classification: webhook/)
  assert.throws(() => buildSecurityInventory(discovered, {
    ...base,
    edgeFunctions: {
      webhook: { authOwner: 'handler:secret', credentialType: 'secret', cors: 'none', rateLimit: 'none', dataSensitivity: 'health' },
      stale: { authOwner: 'handler:secret', credentialType: 'secret', cors: 'none', rateLimit: 'none', dataSensitivity: 'health' },
    },
  }), /stale edge function classification: stale/)
})

test('reports service-only RPCs that retain PostgreSQL default PUBLIC execute', () => {
  const rpcs = [
    { name: 'safe_job', signature: 'safe_job()', authOwner: 'service-role' },
    { name: 'open_job', signature: 'open_job(uuid, text)', authOwner: 'service-role' },
  ]
  const sql = `
    revoke all on function public.safe_job() from public, anon, authenticated;
    grant execute on function public.safe_job() to service_role;
    grant execute on function public.open_job(uuid, text) to service_role;
  `

  assert.deepEqual(findServiceRpcPermissionFindings(rpcs, sql, { open_job: 'PR #77' }), [{
    id: 'SEC-RPC-PUBLIC-EXECUTE-open_job',
    severity: 'high',
    surface: 'rpc:open_job',
    summary: 'Service-only SECURITY DEFINER RPC lacks an explicit PUBLIC/anon/authenticated revoke',
    remediation: 'PR #77',
  }])
})

test('requires every high finding remediation and rejects stale remediation entries', () => {
  const finding = {
    id: 'SEC-RPC-PUBLIC-EXECUTE-open_job', severity: 'high', surface: 'rpc:open_job',
    summary: 'summary', remediation: 'PR #77',
  }
  assert.doesNotThrow(() => validateFindingRemediations([finding], { open_job: 'PR #77' }))
  assert.throws(() => validateFindingRemediations([{ ...finding, remediation: 'unassigned' }], {}), /unassigned high finding/)
  assert.throws(() => validateFindingRemediations([], { open_job: 'PR #77' }), /stale RPC remediation/)
})
