import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_REF = 'mxnmubakfzqoosgsqmhh'
const SECRET_SENTINEL = 'secret-sentinel-must-never-escape'

const FAKE_NPX = `#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const args = process.argv.slice(2)
const statePath = process.env.FAKE_SUPABASE_STATE
const logPath = process.env.FAKE_SUPABASE_LOG
const state = JSON.parse(readFileSync(statePath, 'utf8'))
appendFileSync(logPath, JSON.stringify({ args, cwd: process.cwd() }) + '\\n')
console.error(process.env.SECRET_SENTINEL)

const functionsIndex = args.indexOf('functions')
const action = args[functionsIndex + 1]
const functionName = args[functionsIndex + 2]

function collect(root, current = root) {
  const result = {}
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) Object.assign(result, collect(root, path))
    else if (entry.isFile()) result[relative(process.cwd(), path)] = readFileSync(path).toString('base64')
  }
  return result
}

if (action === 'list') {
  process.stdout.write(JSON.stringify(state.live))
} else if (action === 'deploy') {
  if (state.failDeploy) process.exit(7)
  state.deployedFiles = collect(join(process.cwd(), 'supabase/functions'))
  const before = state.live.find((entry) => entry.name === functionName)
  state.live = [{
    name: functionName,
    version: before.version + 1,
    status: 'ACTIVE',
    verify_jwt: true,
    updated_at: before.updated_at + 1,
    ezbr_sha256: 'b'.repeat(64),
  }]
  writeFileSync(statePath, JSON.stringify(state))
  if (process.env.MUTATE_ORIGINAL === '1') {
    appendFileSync(join(process.env.FAKE_REPO, 'supabase/functions/chat-health/index.ts'), '\\n// mutable worktree edit\\n')
  }
  process.stdout.write('deployed')
} else if (action === 'download') {
  for (const [path, encoded] of Object.entries(state.deployedFiles ?? {})) {
    const target = join(process.cwd(), path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, Buffer.from(encoded, 'base64'))
  }
  process.stdout.write('downloaded')
} else {
  process.exit(9)
}
`

const FAKE_DENO = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'

appendFileSync(process.env.FAKE_DENO_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + '\\n')
if (process.env.FAKE_DENO_FAIL === '1') process.exit(8)
`

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
}

function fixture({
  failDeploy = false,
  functionSource = "Deno.serve(() => new Response('ok'))\n",
  moduleManifest = null,
  configExtra = '',
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tonus-edge-blackbox-'))
  const repo = join(root, 'repo')
  const bin = join(root, 'bin')
  const receiptDir = join(root, 'receipts')
  mkdirSync(join(repo, 'scripts/edge-function-smoke'), { recursive: true })
  mkdirSync(join(repo, 'supabase/functions/chat-health'), { recursive: true })
  mkdirSync(bin, { recursive: true })
  mkdirSync(receiptDir, { recursive: true })
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n')
  symlinkSync(join(HERE, '../node_modules'), join(repo, 'node_modules'), 'dir')

  cpSync(join(HERE, 'deploy-edge-functions.mjs'), join(repo, 'scripts/deploy-edge-functions.mjs'))
  cpSync(join(HERE, 'edge-function-deploy-lib.mjs'), join(repo, 'scripts/edge-function-deploy-lib.mjs'))
  writeFileSync(
    join(repo, 'scripts/edge-function-smoke/chat-health-jwt-boundary.mjs'),
    "console.log(JSON.stringify({status:'failed',assertions:[{id:'not-used',status:'failed'}]}))\n",
  )
  writeFileSync(
    join(repo, 'supabase/config.toml'),
    `project_id = "${PROJECT_REF}"\n\n[functions.chat-health]\nverify_jwt = true\n${configExtra}`,
  )
  writeFileSync(join(repo, 'supabase/functions/chat-health/index.ts'), functionSource)
  if (moduleManifest) {
    writeFileSync(
      join(repo, `supabase/functions/chat-health/${moduleManifest.name}`),
      moduleManifest.content,
    )
  }
  writeFileSync(join(repo, 'deno.lock'), '{"version":"4","specifiers":{},"jsr":{},"npm":{},"redirects":{},"remote":{}}\n')

  git(repo, ['init', '-q'])
  git(repo, ['config', 'user.email', 'blackbox@example.invalid'])
  git(repo, ['config', 'user.name', 'Black Box'])
  git(repo, ['add', '.'])
  git(repo, ['commit', '-qm', 'fixture'])
  const sha = git(repo, ['rev-parse', 'HEAD'])

  const fakeNpx = join(bin, 'npx')
  writeFileSync(fakeNpx, FAKE_NPX, { mode: 0o755 })
  chmodSync(fakeNpx, 0o755)
  const fakeDeno = join(bin, 'deno')
  writeFileSync(fakeDeno, FAKE_DENO, { mode: 0o755 })
  chmodSync(fakeDeno, 0o755)
  const statePath = join(root, 'state.json')
  const logPath = join(root, 'calls.ndjson')
  const denoLogPath = join(root, 'deno-calls.ndjson')
  writeFileSync(statePath, JSON.stringify({
    failDeploy,
    live: [{
      name: 'chat-health',
      version: 4,
      status: 'ACTIVE',
      verify_jwt: false,
      updated_at: 1_784_000_000_004,
      ezbr_sha256: 'a'.repeat(64),
    }],
  }))
  writeFileSync(logPath, '')
  writeFileSync(denoLogPath, '')
  return { root, repo, bin, receiptDir, statePath, logPath, denoLogPath, sha }
}

function runDeploy(value, extraEnv = {}) {
  const receipt = join(value.receiptDir, 'receipt.json')
  const result = spawnSync(
    process.execPath,
    [
      join(value.repo, 'scripts/deploy-edge-functions.mjs'),
      'deploy',
      '--project-ref', PROJECT_REF,
      '--reviewed-sha', value.sha,
      '--operator', 'blackbox',
      '--receipt', receipt,
      '--forward-fix-id', 'blackbox-forward-fix',
      '--smoke-check-id', 'chat-health-jwt-boundary',
      '--function', 'chat-health',
    ],
    {
      cwd: value.repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${value.bin}:${process.env.PATH}`,
        FAKE_SUPABASE_STATE: value.statePath,
        FAKE_SUPABASE_LOG: value.logPath,
        FAKE_DENO_LOG: value.denoLogPath,
        FAKE_REPO: value.repo,
        SECRET_SENTINEL,
        ...extraEnv,
      },
    },
  )
  return { result, receipt }
}

test('actual CLI deploys immutable reviewed bytes and leaves a sanitized pending receipt', () => {
  const value = fixture()
  try {
    const { result, receipt } = runDeploy(value, { MUTATE_ORIGINAL: '1' })
    assert.equal(result.status, 0, result.stderr)
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(SECRET_SENTINEL))

    const evidence = JSON.parse(readFileSync(receipt, 'utf8'))
    assert.equal(evidence.status, 'smoke_pending')
    assert.equal(evidence.deployments.length, 1)
    assert.equal(evidence.deployments[0].before.version, 4)
    assert.equal(evidence.deployments[0].after.version, 5)
    assert.equal(evidence.deployments[0].source.fileCount, 1)
    assert.equal(evidence.recovery.recordId, 'blackbox-forward-fix')
    assert.doesNotMatch(JSON.stringify(evidence), new RegExp(SECRET_SENTINEL))

    const calls = readFileSync(value.logPath, 'utf8').trim().split('\n').map(JSON.parse)
    assert.deepEqual(calls.map((call) => call.args[3]), ['list', 'deploy', 'list', 'download', 'list'])
    const deployCall = calls.find((call) => call.args[3] === 'deploy')
    assert.match(deployCall.cwd, /tonus-edge-release-/)
    assert.notEqual(deployCall.cwd, value.repo)
    assert.equal(deployCall.args.includes('supabase@2.109.1'), true)
    assert.equal(calls.some((call) => call.args.includes('--no-verify-jwt')), false)
    assert.equal(calls.some((call) => call.args.includes('--prune')), false)
    const denoCalls = readFileSync(value.denoLogPath, 'utf8').trim().split('\n').map(JSON.parse)
    assert.equal(denoCalls.length, 1)
    assert.deepEqual(denoCalls[0].args.slice(0, 2), ['cache', '--no-config'])
    assert.equal(denoCalls[0].args.includes('--frozen'), true)
    assert.equal(denoCalls[0].args.includes('--lock'), true)
    assert.equal(denoCalls[0].args.some((arg) => arg.endsWith('/deno.lock')), true)
    assert.equal(denoCalls[0].args.some((arg) => arg.endsWith('/chat-health/index.ts')), true)
    assert.match(readFileSync(join(value.repo, 'supabase/functions/chat-health/index.ts'), 'utf8'), /mutable worktree edit/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('actual CLI rejects a stale transitive dependency lock before Supabase or receipt mutation', () => {
  const value = fixture()
  try {
    const { result, receipt } = runDeploy(value, { FAKE_DENO_FAIL: '1' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /dependency_lock_invalid/)
    assert.equal(readFileSync(value.logPath, 'utf8'), '')
    assert.equal(existsSync(receipt), false)
    assert.notEqual(readFileSync(value.denoLogPath, 'utf8'), '')
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('actual CLI stops on deploy failure and preserves the durable in-flight receipt', () => {
  const value = fixture({ failDeploy: true })
  try {
    const { result, receipt } = runDeploy(value)
    assert.notEqual(result.status, 0)
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(SECRET_SENTINEL))

    const evidence = JSON.parse(readFileSync(receipt, 'utf8'))
    assert.equal(evidence.status, 'failed')
    assert.equal(evidence.productionState, 'changed_or_uncertain')
    assert.equal(evidence.current.stage, 'deploying')
    assert.equal(evidence.current.before.version, 4)
    assert.equal(evidence.failure.error, 'supabase_command_failed')
    const calls = readFileSync(value.logPath, 'utf8').trim().split('\n').map(JSON.parse)
    assert.deepEqual(calls.map((call) => call.args[3]), ['list', 'deploy'])
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('actual CLI rejects floating remote module imports before Supabase or receipt mutation', () => {
  const sources = [
    "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'\n",
    "import {\n  createClient,\n}\nfrom\n'https://esm.sh/@supabase/supabase-js@2'\n",
    "import { createClient } from /* reviewed? */ 'https://esm.sh/@supabase/supabase-js@2'\n",
    "const module = await import(`https://esm.sh/@supabase/supabase-js@2`)\n",
  ]
  for (const functionSource of sources) {
    const value = fixture({ functionSource })
    try {
      const { result, receipt } = runDeploy(value)
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /unpinned_remote_import/)
      assert.equal(readFileSync(value.logPath, 'utf8'), '')
      assert.equal(existsSync(receipt), false)
    } finally {
      rmSync(value.root, { recursive: true, force: true })
    }
  }
})

test('actual CLI rejects import maps and non-literal dynamic imports before mutation', () => {
  const values = [
    fixture({
      functionSource: "import { createClient } from 'client'\n",
      moduleManifest: {
        name: 'deno.json',
        content: '{"imports":{"client":"npm:@supabase/supabase-js@2"}}\n',
      },
    }),
    fixture({ functionSource: "const url = './local.ts'\nawait import(url)\n" }),
    fixture({ configExtra: 'entrypoint = "./functions/chat-health/alternate.ts"\n' }),
    fixture({ configExtra: '"entrypoint" = "./functions/chat-health/alternate.ts"\n' }),
    fixture({
      moduleManifest: {
        name: '.npmrc',
        content: 'registry=https://mutable-registry.example.invalid/\n',
      },
    }),
  ]
  try {
    for (const value of values) {
      const { result, receipt } = runDeploy(value)
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /unsupported_module_manifest|module_graph_invalid/)
      assert.equal(readFileSync(value.logPath, 'utf8'), '')
      assert.equal(existsSync(receipt), false)
    }
  } finally {
    for (const value of values) rmSync(value.root, { recursive: true, force: true })
  }
})
