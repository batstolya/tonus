import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  SUPABASE_CLI_VERSION,
  advanceDeploymentReceipt,
  assertReleaseContext,
  buildDeploySteps,
  completeDeploymentReceipt,
  createDeploymentReceipt,
  failDeploymentReceipt,
  metadataIdentityMatches,
  parseFunctionModes,
  runSequentialDeployments,
  validateDeploymentReceiptForSmoke,
  validateRequestedFunctions,
  verifyPostDeploy,
  validatePinnedRemoteImports,
  validatePreDeployMetadata,
} from './edge-function-deploy-lib.mjs'

const PROJECT_REF = 'mxnmubakfzqoosgsqmhh'
const SHA = 'a'.repeat(40)
const TREE = 'b'.repeat(40)

const configFor = (entries) => [
  `project_id = "${PROJECT_REF}"`,
  ...entries.flatMap(([name, mode]) => [
    `[functions.${name}]`,
    `verify_jwt = ${mode}`,
  ]),
].join('\n')

test('parses one explicit JWT mode for every local Edge Function', () => {
  const modes = parseFunctionModes(
    configFor([['alpha', false], ['beta', true]]),
    ['alpha', 'beta'],
  )

  assert.deepEqual([...modes], [['alpha', false], ['beta', true]])
})

test('rejects missing, stale, and duplicate function mode declarations', () => {
  assert.throws(
    () => parseFunctionModes(configFor([['alpha', true]]), ['alpha', 'beta']),
    /missing.*beta/i,
  )
  assert.throws(
    () => parseFunctionModes(configFor([['alpha', true], ['stale', false]]), ['alpha']),
    /unknown.*stale/i,
  )
  assert.throws(
    () => parseFunctionModes(`${configFor([['alpha', true]])}\n[functions.alpha]\nverify_jwt = false`, ['alpha']),
    /duplicate.*alpha/i,
  )
})

test('the checked-in config explicitly covers all 22 functions', () => {
  const functionsUrl = new URL('../supabase/functions/', import.meta.url)
  const localFunctions = readdirSync(functionsUrl, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => entry.name)
    .sort()
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8')
  const modes = parseFunctionModes(config, localFunctions)

  assert.equal(localFunctions.length, 22)
  assert.equal(modes.size, 22)
  assert.equal(modes.get('chat-health'), true)
  assert.equal(modes.get('telegram-bot'), false)
})

test('accepts only an explicit ordered list of known unique functions', () => {
  const modes = new Map([['alpha', true], ['beta', false]])

  assert.deepEqual(validateRequestedFunctions(['beta', 'alpha'], modes), ['beta', 'alpha'])
  assert.throws(() => validateRequestedFunctions([], modes), /function/i)
  assert.throws(() => validateRequestedFunctions(['unknown'], modes), /unknown/i)
  assert.throws(() => validateRequestedFunctions(['alpha', 'alpha'], modes), /duplicate/i)
  assert.throws(() => validateRequestedFunctions(['alpha,beta'], modes), /one function per argument/i)
})

test('requires a clean checkout, exact reviewed SHA, and intended project', () => {
  const context = {
    gitStatus: '',
    headSha: SHA,
    headTree: TREE,
    reviewedSha: SHA,
    projectRef: PROJECT_REF,
    expectedProjectRef: PROJECT_REF,
  }

  assert.deepEqual(assertReleaseContext(context), {
    reviewedSha: SHA,
    reviewedTree: TREE,
    projectRef: PROJECT_REF,
  })
  assert.throws(() => assertReleaseContext({ ...context, gitStatus: '?? local.txt' }), /clean checkout/i)
  assert.throws(() => assertReleaseContext({ ...context, reviewedSha: 'c'.repeat(40) }), /reviewed SHA/i)
  assert.throws(() => assertReleaseContext({ ...context, projectRef: 'wrong-project-ref-xx' }), /project ref/i)
})

test('builds one pinned, named deploy command per function without unsafe flags', () => {
  const steps = buildDeploySteps(['alpha', 'beta'], PROJECT_REF)

  assert.equal(SUPABASE_CLI_VERSION, '2.109.1')
  assert.deepEqual(steps, [
    {
      functionName: 'alpha',
      command: 'npx',
      args: ['--yes', 'supabase@2.109.1', 'functions', 'deploy', 'alpha', '--project-ref', PROJECT_REF],
    },
    {
      functionName: 'beta',
      command: 'npx',
      args: ['--yes', 'supabase@2.109.1', 'functions', 'deploy', 'beta', '--project-ref', PROJECT_REF],
    },
  ])
  assert.doesNotMatch(JSON.stringify(steps), /--prune|--jobs|--no-verify-jwt/)
})

test('deploys sequentially and stops after the first failure', async () => {
  const steps = buildDeploySteps(['alpha', 'beta', 'gamma'], PROJECT_REF)
  const visited = []

  await assert.rejects(
    runSequentialDeployments(steps, async (step) => {
      visited.push(step.functionName)
      await Promise.resolve()
      if (step.functionName === 'beta') throw new Error('deploy_failed')
      return { ok: true }
    }),
    /deploy_failed/,
  )
  assert.deepEqual(visited, ['alpha', 'beta'])
})

test('dry-run returns the plan without invoking the network runner', async () => {
  const steps = buildDeploySteps(['alpha', 'beta'], PROJECT_REF)
  let calls = 0

  const result = await runSequentialDeployments(
    steps,
    async () => {
      calls += 1
      throw new Error('network runner must not be called')
    },
    { dryRun: true },
  )

  assert.equal(calls, 0)
  assert.deepEqual(result, steps)
})

test('accepts only an active, newer deployment with the expected JWT mode', () => {
  const before = {
    name: 'alpha',
    version: 4,
    status: 'ACTIVE',
    verify_jwt: true,
    updated_at: 1_783_000_000_000,
    ezbr_sha256: 'c'.repeat(64),
  }
  const after = {
    name: 'alpha',
    version: 5,
    status: 'ACTIVE',
    verify_jwt: true,
    updated_at: 1_784_000_000_000,
    ezbr_sha256: 'd'.repeat(64),
    raw_output: 'must-not-survive',
  }

  assert.deepEqual(verifyPostDeploy({ before, after, expectedVerifyJwt: true }), {
    name: 'alpha',
    version: 5,
    status: 'ACTIVE',
    verify_jwt: true,
    updated_at: 1_784_000_000_000,
    ezbr_sha256: 'd'.repeat(64),
  })
  assert.throws(
    () => verifyPostDeploy({ before, after: { ...after, status: 'INACTIVE' }, expectedVerifyJwt: true }),
    /artifact|ACTIVE/i,
  )
  assert.throws(
    () => verifyPostDeploy({ before, after: { ...after, version: 4 }, expectedVerifyJwt: true }),
    /version/i,
  )
  assert.throws(
    () => verifyPostDeploy({ before, after: { ...after, version: 6 }, expectedVerifyJwt: true }),
    /single version/i,
  )
  assert.throws(
    () => verifyPostDeploy({ before, after: { ...after, verify_jwt: false }, expectedVerifyJwt: true }),
    /verify_jwt/i,
  )
  assert.throws(
    () => verifyPostDeploy({
      before,
      after: { ...after, ezbr_sha256: before.ezbr_sha256 },
      expectedVerifyJwt: true,
    }),
    /unchanged bundle/i,
  )
  assert.equal(verifyPostDeploy({
    before,
    after: { ...after, ezbr_sha256: before.ezbr_sha256 },
    expectedVerifyJwt: true,
    allowUnchangedBundle: true,
  }).version, 5)
})

test('validates the complete live baseline before a deployment can start', () => {
  const before = {
    name: 'alpha',
    version: 4,
    status: 'ACTIVE',
    verify_jwt: true,
    updated_at: 1_783_000_000_000,
    ezbr_sha256: 'c'.repeat(64),
    raw_output: 'must-not-survive',
  }
  assert.deepEqual(validatePreDeployMetadata(before, 'alpha'), {
    name: 'alpha',
    version: 4,
    status: 'ACTIVE',
    verify_jwt: true,
    updated_at: 1_783_000_000_000,
    ezbr_sha256: 'c'.repeat(64),
  })
  assert.throws(() => validatePreDeployMetadata({ ...before, status: 'FAILED' }, 'alpha'), /artifact/i)
  assert.throws(() => validatePreDeployMetadata({ ...before, name: 'beta' }, 'alpha'), /name/i)
})

test('allows an explicitly declared first deployment but rejects an implicit create', () => {
  const after = {
    name: 'alpha',
    version: 1,
    status: 'ACTIVE',
    verify_jwt: true,
    updated_at: 1_784_000_000_000,
    ezbr_sha256: 'd'.repeat(64),
  }

  assert.throws(
    () => verifyPostDeploy({ before: null, after, expectedVerifyJwt: true }),
    /create/i,
  )
  assert.equal(
    verifyPostDeploy({ before: null, after, expectedVerifyJwt: true, allowCreate: true }).version,
    1,
  )
  assert.throws(
    () => verifyPostDeploy({
      before: null,
      after: { ...after, version: 7 },
      expectedVerifyJwt: true,
      allowCreate: true,
    }),
    /first version/i,
  )
})

test('compares the complete stable live artifact identity', () => {
  const metadata = {
    name: 'alpha',
    version: 5,
    status: 'ACTIVE',
    verify_jwt: true,
    updated_at: 1_784_000_000_000,
    ezbr_sha256: 'd'.repeat(64),
  }

  assert.equal(metadataIdentityMatches(metadata, { ...metadata }), true)
  assert.equal(metadataIdentityMatches(metadata, { ...metadata, version: 6 }), false)
  assert.equal(metadataIdentityMatches(metadata, { ...metadata, ezbr_sha256: 'e'.repeat(64) }), false)
})

test('persists every deployment transition and preserves in-flight pre-state on failure', () => {
  let receipt = createDeploymentReceipt({
    projectRef: PROJECT_REF,
    reviewedSha: SHA,
    reviewedTree: TREE,
    snapshotSha256: 'c'.repeat(64),
    operator: 'codex',
    cliVersion: SUPABASE_CLI_VERSION,
    functions: ['alpha', 'beta'],
    smokeCheckId: 'alpha-smoke',
    allowCreate: [],
    recovery: { strategy: 'forward_fix', recordId: 'alpha-forward-fix' },
    startedAt: '2026-07-15T08:00:00Z',
  })
  assert.equal(receipt.status, 'deployment_in_progress')
  assert.deepEqual(receipt.deployments, [])
  assert.equal(receipt.current, null)

  const before = {
    name: 'alpha',
    version: 4,
    status: 'ACTIVE',
    verify_jwt: false,
    updated_at: 1_783_000_000_000,
    ezbr_sha256: 'a'.repeat(64),
  }
  receipt = advanceDeploymentReceipt(receipt, {
    type: 'pre_state',
    name: 'alpha',
    before,
    at: '2026-07-15T08:00:10Z',
  })
  receipt = advanceDeploymentReceipt(receipt, {
    type: 'deploy_started',
    name: 'alpha',
    at: '2026-07-15T08:00:11Z',
  })
  assert.equal(receipt.current.stage, 'deploying')
  assert.equal(receipt.current.before.version, 4)

  const failed = failDeploymentReceipt(receipt, {
    stage: 'deploy',
    code: 'supabase_command_failed',
    functionName: 'alpha',
    at: '2026-07-15T08:00:12Z',
  })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.productionState, 'changed_or_uncertain')
  assert.equal(failed.current.before.version, 4)
  assert.deepEqual(failed.failure, {
    stage: 'deploy',
    error: 'supabase_command_failed',
    function: 'alpha',
  })
})

test('requires exact ordered verified deployments and machine-produced smoke evidence', () => {
  const before = {
    name: 'alpha', version: 4, status: 'ACTIVE', verify_jwt: false,
    updated_at: 1_783_000_000_000, ezbr_sha256: 'a'.repeat(64),
  }
  const after = {
    name: 'alpha', version: 5, status: 'ACTIVE', verify_jwt: true,
    updated_at: 1_784_000_000_000, ezbr_sha256: 'b'.repeat(64),
  }
  let receipt = createDeploymentReceipt({
    projectRef: PROJECT_REF,
    reviewedSha: SHA,
    reviewedTree: TREE,
    snapshotSha256: 'c'.repeat(64),
    operator: 'codex',
    cliVersion: SUPABASE_CLI_VERSION,
    functions: ['alpha'],
    smokeCheckId: 'alpha-smoke',
    allowCreate: [],
    recovery: { strategy: 'forward_fix', recordId: 'alpha-forward-fix' },
    startedAt: '2026-07-15T08:00:00Z',
  })

  assert.throws(
    () => completeDeploymentReceipt(receipt, {
      status: 'passed', checkId: 'alpha-smoke', machineProduced: true,
      completedAt: '2026-07-15T08:02:00Z', reviewedSha: SHA,
      functions: ['alpha'], liveArtifacts: [after],
      assertions: [{ id: 'signed-user', status: 'passed' }],
    }),
    /deployment/i,
  )

  for (const transition of [
    { type: 'pre_state', name: 'alpha', before, at: '2026-07-15T08:00:10Z' },
    { type: 'deploy_started', name: 'alpha', at: '2026-07-15T08:00:11Z' },
    { type: 'deploy_returned', name: 'alpha', at: '2026-07-15T08:00:30Z' },
    {
      type: 'verified', name: 'alpha', after,
      source: {
        sha256: 'd'.repeat(64), fileCount: 10,
        entrypointVerified: true, stableMetadata: true,
      },
      at: '2026-07-15T08:00:31Z',
    },
    { type: 'ready_for_smoke', at: '2026-07-15T08:00:32Z' },
  ]) receipt = advanceDeploymentReceipt(receipt, transition)

  assert.equal(validateDeploymentReceiptForSmoke(receipt), true)
  assert.throws(
    () => validateDeploymentReceiptForSmoke({ ...receipt, deployments: [] }),
    /deployment/i,
  )
  assert.throws(
    () => validateDeploymentReceiptForSmoke({ ...receipt, operator: 'ghp_tokenlike' }),
    /operator/i,
  )
  assert.throws(
    () => validateDeploymentReceiptForSmoke({ ...receipt, credential: 'secret-sentinel' }),
    /schema/i,
  )

  assert.throws(
    () => completeDeploymentReceipt(receipt, {
      status: 'passed', checkId: 'alpha-smoke', machineProduced: false,
      completedAt: '2026-07-15T08:02:00Z', reviewedSha: SHA,
      functions: ['alpha'], liveArtifacts: [after],
      assertions: [{ id: 'signed-user', status: 'passed' }],
    }),
    /machine/i,
  )

  const completed = completeDeploymentReceipt(receipt, {
    status: 'passed', checkId: 'alpha-smoke', machineProduced: true,
    completedAt: '2026-07-15T08:02:00Z', reviewedSha: SHA,
    functions: ['alpha'], liveArtifacts: [after],
    assertions: [{ id: 'signed-user', status: 'passed' }],
  })
  assert.equal(completed.status, 'complete')
  assert.equal(completed.recovery.recordId, 'alpha-forward-fix')
  assert.deepEqual(completed.smoke.assertions, [{ id: 'signed-user', status: 'passed' }])

  const smokeFailed = completeDeploymentReceipt(receipt, {
    status: 'failed', checkId: 'alpha-smoke', machineProduced: true,
    completedAt: '2026-07-15T08:02:00Z', reviewedSha: SHA,
    functions: ['alpha'], liveArtifacts: [after],
    assertions: [{ id: 'signed-user', status: 'failed' }],
  })
  assert.equal(smokeFailed.status, 'smoke_failed')
  assert.equal(smokeFailed.smoke.status, 'failed')
})

test('creates an in-progress receipt from allowlisted fields only', () => {
  const secret = 'secret_sentinel_value'
  const receipt = createDeploymentReceipt({
    projectRef: PROJECT_REF,
    reviewedSha: SHA,
    reviewedTree: TREE,
    snapshotSha256: 'c'.repeat(64),
    operator: 'Codex',
    cliVersion: SUPABASE_CLI_VERSION,
    functions: ['alpha'],
    smokeCheckId: 'alpha-smoke',
    allowCreate: [],
    recovery: { strategy: 'forward_fix', recordId: 'alpha-forward-fix' },
    startedAt: '2026-07-15T08:00:00Z',
    credentials: secret,
  })
  const serialized = JSON.stringify(receipt)

  assert.equal(receipt.status, 'deployment_in_progress')
  assert.equal(receipt.smoke.status, 'not_run')
  assert.equal(receipt.secretsRedacted, true)
  assert.equal(receipt.responseBodiesRetained, false)
  assert.deepEqual(receipt.deployments, [])
  assert.deepEqual(receipt.recovery, { strategy: 'forward_fix', recordId: 'alpha-forward-fix' })
  assert.doesNotMatch(serialized, new RegExp(secret))
  assert.doesNotMatch(serialized, /credentials/)
})

test('requires exact versions for every remote module import in a deployment graph', () => {
  assert.doesNotThrow(() => validatePinnedRemoteImports([
    {
      path: 'supabase/functions/alpha/index.ts',
      source: [
        "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'",
        "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2'",
        "const module = await import('npm:package@1.2.3')",
        "export type { Value } from 'jsr:@scope/package@1.2.3/types'",
      ].join('\n'),
    },
  ]))

  assert.throws(() => validatePinnedRemoteImports([
    {
      path: 'supabase/functions/alpha/index.ts',
      source: "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'",
    },
  ]), /unpinned remote module import/i)
  assert.throws(() => validatePinnedRemoteImports([
    {
      path: 'supabase/functions/alpha/override.ts',
      source: "export { value } from 'https://esm.sh/package@1.2.3?deps=other@latest'",
    },
  ]), /unpinned remote module import/i)
  assert.throws(() => validatePinnedRemoteImports([
    {
      path: 'supabase/functions/alpha/types.ts',
      source: [
        '/// <reference types="npm:@types/node@latest" />',
        '// @deno-types="npm:@types/express@^4.17"',
        "import express from 'npm:express@4.21.2'",
      ].join('\n'),
    },
  ]), /unpinned remote module import/i)
  assert.throws(() => validatePinnedRemoteImports([
    {
      path: 'supabase/functions/_shared/client.ts',
      source: "export { value } from 'npm:package@latest'",
    },
  ]), /unpinned remote module import/i)
  assert.throws(() => validatePinnedRemoteImports([
    {
      path: 'supabase/functions/alpha/lazy.ts',
      source: "const module = await import(\n  'https://esm.sh/package@1'\n)",
    },
  ]), /unpinned remote module import/i)
  assert.throws(() => validatePinnedRemoteImports([
    {
      path: 'supabase/functions/alpha/evasion.ts',
      source: "export { value } from 'https://example.com/latest/mod.ts?cache=@1.2.3'",
    },
  ]), /unpinned remote module import/i)
})
