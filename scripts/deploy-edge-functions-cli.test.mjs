import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRODUCTION_PROJECT_REF,
  SafeError,
  parseArguments,
  runCli,
  validateReleaseTreeEntries,
} from './deploy-edge-functions.mjs'

const SHA = 'a'.repeat(40)
const TREE = 'b'.repeat(40)
const SNAPSHOT = 'c'.repeat(64)

const metadata = (name, version, verifyJwt) => ({
  name,
  version,
  status: 'ACTIVE',
  verify_jwt: verifyJwt,
  updated_at: 1_784_000_000_000 + version,
  ezbr_sha256: String(version).padStart(64, 'd'),
})

function fakeRuntime({ functions = ['alpha'], failAt, smokeStatus = 'passed' } = {}) {
  const events = []
  const writes = []
  const outputs = []
  const live = new Map(functions.map((name) => [name, metadata(name, 4, false)]))
  let clock = 0
  let storedReceipt = null

  const runtime = {
    events,
    writes,
    outputs,
    live,
    requireNode24() { events.push('node') },
    now() {
      clock += 1
      return `2026-07-15T08:00:${String(clock).padStart(2, '0')}Z`
    },
    async readReleaseContract(options) {
      events.push('contract')
      if (options.projectRef && options.projectRef !== PRODUCTION_PROJECT_REF) {
        throw new SafeError('preflight', 'project_ref_mismatch')
      }
      return {
        projectRef: PRODUCTION_PROJECT_REF,
        reviewedSha: SHA,
        reviewedTree: TREE,
        functions: [...options.functions],
        allowCreate: [...(options.allowCreate ?? [])],
        allowUnchangedBundle: [...(options.allowUnchangedBundle ?? [])],
        smokeCheckId: options.smokeCheckId ?? options.checkId,
        modes: new Map(options.functions.map((name) => [name, true])),
      }
    },
    validateSmokeCheck(checkId) {
      events.push(`smoke-contract:${checkId}`)
    },
    async createSnapshot() {
      events.push('snapshot')
      return { path: '/immutable/reviewed-snapshot', sha256: SNAPSHOT }
    },
    async removeSnapshot() { events.push('snapshot-cleanup') },
    validateReceiptPath(_value, { mustExist }) {
      events.push(mustExist ? 'receipt-open' : 'receipt-validate')
      return { path: '/ignored/receipt.json', parent: '/ignored' }
    },
    reserveReceipt(_handle, receipt) {
      events.push('receipt-reserve')
      storedReceipt = structuredClone(receipt)
      writes.push(structuredClone(receipt))
    },
    persistReceipt(_handle, receipt) {
      events.push(`receipt-write:${receipt.current?.stage ?? receipt.status}`)
      storedReceipt = structuredClone(receipt)
      writes.push(structuredClone(receipt))
    },
    readReceipt() {
      events.push('receipt-read')
      return structuredClone(storedReceipt)
    },
    seedReceipt(receipt) { storedReceipt = structuredClone(receipt) },
    async listFunctionMetadata(_projectRef, name, _snapshotPath, stage, { allowMissing = false } = {}) {
      events.push(`metadata:${stage}:${name}`)
      if (failAt === `${stage}:${name}`) throw new SafeError(stage, 'supabase_command_failed', { functionName: name })
      const value = live.get(name) ?? null
      if (value === null && !allowMissing) throw new SafeError(stage, 'function_metadata_missing', { functionName: name })
      return value === null ? null : structuredClone(value)
    },
    async deployFunction(_projectRef, name, snapshotPath) {
      events.push(`deploy:${name}:${snapshotPath}`)
      if (failAt === `deploy:${name}`) throw new SafeError('deploy', 'supabase_command_failed', { functionName: name })
      const before = live.get(name)
      live.set(name, metadata(name, before ? before.version + 1 : 1, true))
    },
    async verifyRemoteArtifact(_projectRef, name, _sha, expected, snapshotPath) {
      events.push(`source:${name}:${snapshotPath}`)
      if (failAt === `source:${name}`) throw new SafeError('source_verify', 'source_mismatch', { functionName: name })
      return {
        after: structuredClone(expected),
        source: {
          sha256: 'e'.repeat(64),
          fileCount: 2,
          entrypointVerified: true,
          stableMetadata: true,
        },
      }
    },
    async runSmoke(checkId, context, snapshotPath) {
      events.push(`smoke:${checkId}:${snapshotPath}:${context.functions.join(',')}`)
      return {
        status: smokeStatus,
        assertions: [{
          id: 'signed-user-reaches-handler',
          status: smokeStatus === 'passed' ? 'passed' : 'failed',
          httpStatus: smokeStatus === 'passed' ? 400 : 500,
        }],
      }
    },
    print(payload) { outputs.push(structuredClone(payload)) },
  }
  return runtime
}

const deployArgs = (functions = ['alpha']) => [
  'deploy',
  '--project-ref', PRODUCTION_PROJECT_REF,
  '--reviewed-sha', SHA,
  '--operator', 'codex',
  '--receipt', '.superpowers/deployments/test.json',
  '--forward-fix-id', 'reviewed-forward-fix',
  '--smoke-check-id', 'chat-health-jwt-boundary',
  ...functions.flatMap((name) => ['--function', name]),
]

const smokeArgs = (functions = ['alpha']) => [
  'smoke',
  '--reviewed-sha', SHA,
  '--receipt', '.superpowers/deployments/test.json',
  '--check-id', 'chat-health-jwt-boundary',
  ...functions.flatMap((name) => ['--function', name]),
]

test('parses only explicit deploy and allowlisted smoke inputs', () => {
  const deploy = parseArguments([
    ...deployArgs(),
    '--allow-create', 'alpha',
    '--allow-unchanged-bundle', 'alpha',
  ])
  assert.deepEqual(deploy.allowCreate, ['alpha'])
  assert.deepEqual(deploy.allowUnchangedBundle, ['alpha'])
  assert.equal(deploy.forwardFixId, 'reviewed-forward-fix')
  assert.equal(deploy.smokeCheckId, 'chat-health-jwt-boundary')
  assert.throws(() => parseArguments([...deployArgs(), '--operator', 'ghp_tokenlike']), /duplicate|operator/i)
  const tokenArgs = deployArgs()
  tokenArgs[tokenArgs.indexOf('codex')] = 'github_pat_tokenlike'
  assert.throws(() => parseArguments(tokenArgs), /operator/i)
  assert.throws(() => parseArguments(['complete']), /action/i)
  assert.throws(() => parseArguments([...smokeArgs(), '--smoke-result', 'passed']), /unknown/i)
})

test('accepts only ordinary tracked blobs in the immutable release tree', () => {
  assert.deepEqual(validateReleaseTreeEntries([
    `100644 blob ${'a'.repeat(40)}\tdeno.lock`,
    `100755 blob ${'b'.repeat(40)}\tscripts/edge-function-smoke/check.mjs`,
    `100644 blob ${'c'.repeat(40)}\tsupabase/functions/alpha/index.ts`,
  ].join('\n')), [
    'deno.lock',
    'scripts/edge-function-smoke/check.mjs',
    'supabase/functions/alpha/index.ts',
  ])
  assert.throws(
    () => validateReleaseTreeEntries(`120000 blob ${'a'.repeat(40)}\tsupabase/functions/alpha/link.ts`),
    /tree/i,
  )
  assert.throws(
    () => validateReleaseTreeEntries(`160000 commit ${'a'.repeat(40)}\tsupabase/functions/vendor`),
    /tree/i,
  )
})

test('dry-run validates and snapshots without reserving a receipt or touching Supabase', async () => {
  const runtime = fakeRuntime()
  await runCli([...deployArgs(), '--dry-run'], runtime)

  assert.deepEqual(runtime.events, [
    'node', 'contract', 'smoke-contract:chat-health-jwt-boundary',
    'snapshot', 'receipt-validate', 'snapshot-cleanup',
  ])
  assert.equal(runtime.writes.length, 0)
  assert.equal(runtime.outputs[0].action, 'dry-run')
})

test('reserves an in-progress receipt before the first Supabase read and persists every stage', async () => {
  const runtime = fakeRuntime()
  await runCli(deployArgs(), runtime)

  assert.ok(runtime.events.indexOf('receipt-reserve') < runtime.events.indexOf('metadata:metadata_pre:alpha'))
  assert.ok(runtime.events.includes('deploy:alpha:/immutable/reviewed-snapshot'))
  assert.deepEqual(runtime.writes.map((receipt) => receipt.current?.stage ?? receipt.status), [
    'deployment_in_progress',
    'pre_deploy',
    'deploying',
    'deployed_unverified',
    'deployment_in_progress',
    'smoke_pending',
  ])
  assert.equal(runtime.writes.at(-1).deployments[0].after.version, 5)
  assert.equal(runtime.writes.at(-1).recovery.recordId, 'reviewed-forward-fix')
  assert.deepEqual(runtime.writes.at(-1).allowUnchangedBundle, [])
})

test('records the in-flight pre-state when deploy succeeds but post-metadata fails', async () => {
  const runtime = fakeRuntime({ failAt: 'metadata_post:alpha' })
  await assert.rejects(runCli(deployArgs(), runtime), /supabase_command_failed/)

  const failed = runtime.writes.at(-1)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.productionState, 'changed_or_uncertain')
  assert.equal(failed.current.stage, 'deployed_unverified')
  assert.equal(failed.current.before.version, 4)
  assert.equal(failed.failure.function, 'alpha')
})

test('refuses to mutate when the live pre-deploy artifact metadata is invalid', async () => {
  const runtime = fakeRuntime()
  runtime.live.set('alpha', { ...runtime.live.get('alpha'), status: 'FAILED' })

  await assert.rejects(runCli(deployArgs(), runtime), /invalid_pre_deploy_metadata/)

  assert.equal(runtime.events.some((event) => event.startsWith('deploy:')), false)
  assert.equal(runtime.writes.at(-1).status, 'failed')
  assert.equal(runtime.writes.at(-1).productionState, 'unchanged')
  assert.equal(runtime.writes.at(-1).failure.error, 'invalid_pre_deploy_metadata')
})

test('stops after a second target failure and keeps the first verified deployment', async () => {
  const runtime = fakeRuntime({ functions: ['alpha', 'beta'], failAt: 'deploy:beta' })
  await assert.rejects(runCli(deployArgs(['alpha', 'beta']), runtime), /supabase_command_failed/)

  assert.equal(runtime.events.some((event) => event.startsWith('source:alpha:')), true)
  assert.equal(runtime.events.some((event) => event.startsWith('source:beta:')), false)
  const failed = runtime.writes.at(-1)
  assert.deepEqual(failed.deployments.map((item) => item.name), ['alpha'])
  assert.equal(failed.current.name, 'beta')
  assert.equal(failed.current.stage, 'deploying')
})

test('supports a first deployment only when create is explicit', async () => {
  const denied = fakeRuntime()
  denied.live.delete('alpha')
  await assert.rejects(runCli(deployArgs(), denied), /metadata|missing/)

  const allowed = fakeRuntime()
  allowed.live.delete('alpha')
  await runCli([...deployArgs(), '--allow-create', 'alpha'], allowed)
  assert.equal(allowed.writes.at(-1).deployments[0].before, null)
  assert.equal(allowed.writes.at(-1).deployments[0].after.version, 1)
})

async function pendingReceipt(runtime) {
  await runCli(deployArgs(), runtime)
  return runtime.writes.at(-1)
}

test('runs an allowlisted machine smoke between two live-artifact checks before completion', async () => {
  const runtime = fakeRuntime()
  runtime.seedReceipt(await pendingReceipt(runtime))
  runtime.events.length = 0
  runtime.writes.length = 0

  await runCli(smokeArgs(), runtime)

  assert.deepEqual(runtime.events, [
    'node',
    'contract',
    'smoke-contract:chat-health-jwt-boundary',
    'snapshot',
    'receipt-open',
    'receipt-read',
    'metadata:smoke_metadata_pre:alpha',
    'source:alpha:/immutable/reviewed-snapshot',
    'smoke:chat-health-jwt-boundary:/immutable/reviewed-snapshot:alpha',
    'metadata:smoke_metadata_post:alpha',
    'receipt-write:complete',
    'snapshot-cleanup',
  ])
  assert.equal(runtime.writes.at(-1).status, 'complete')
  assert.equal(runtime.writes.at(-1).smoke.status, 'passed')
})

test('rejects a forged source proof even when current live metadata matches', async () => {
  const runtime = fakeRuntime()
  const receipt = await pendingReceipt(runtime)
  receipt.deployments[0].source.sha256 = 'f'.repeat(64)
  runtime.seedReceipt(receipt)
  runtime.events.length = 0
  runtime.writes.length = 0

  await assert.rejects(runCli(smokeArgs(), runtime), /smoke_failed/)
  assert.equal(runtime.events.some((event) => event.startsWith('smoke:')), false)
  assert.equal(runtime.writes.at(-1).status, 'smoke_failed')
})

test('rejects a forged receipt whose JWT mode disagrees with the reviewed manifest', async () => {
  const runtime = fakeRuntime()
  const receipt = await pendingReceipt(runtime)
  receipt.deployments[0].after.verify_jwt = false
  runtime.live.set('alpha', structuredClone(receipt.deployments[0].after))
  runtime.seedReceipt(receipt)
  runtime.events.length = 0
  runtime.writes.length = 0

  await assert.rejects(runCli(smokeArgs(), runtime), /receipt_release_mismatch/)
  assert.equal(runtime.events.some((event) => event.startsWith('metadata:')), false)
  assert.equal(runtime.writes.length, 0)
})

test('durably records a failed machine smoke and never marks it complete', async () => {
  const runtime = fakeRuntime({ smokeStatus: 'failed' })
  runtime.seedReceipt(await pendingReceipt(runtime))
  runtime.events.length = 0
  runtime.writes.length = 0

  await assert.rejects(runCli(smokeArgs(), runtime), /smoke_failed/)

  assert.equal(runtime.writes.at(-1).status, 'smoke_failed')
  assert.equal(runtime.writes.at(-1).smoke.status, 'failed')
  assert.equal(runtime.writes.at(-1).recovery.recordId, 'reviewed-forward-fix')
})
