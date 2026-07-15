#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SUPABASE_CLI_VERSION,
  advanceDeploymentReceipt,
  assertReleaseContext,
  completeDeploymentReceipt,
  createDeploymentReceipt,
  extractModuleSpecifiers,
  failDeploymentReceipt,
  metadataIdentityMatches,
  parseFunctionModes,
  validatePinnedRemoteImports,
  validatePreDeployMetadata,
  validateDeploymentReceiptForSmoke,
  validateRequestedFunctions,
  verifyPostDeploy,
} from './edge-function-deploy-lib.mjs'

export const PRODUCTION_PROJECT_REF = 'mxnmubakfzqoosgsqmhh'

const REPO_ROOT = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const SHA_PATTERN = /^[0-9a-f]{40}$/
const SAFE_OPERATOR = /^[A-Za-z0-9 .@/-]{1,80}$/
const CREDENTIAL_LIKE = /(?:github_pat_|gh[pousr]_|sbp_|sb_secret_|eyJ[a-zA-Z0-9_-]*\.)/i
const MAX_OUTPUT = 8 * 1024 * 1024

const HELP = `Usage:
  node scripts/deploy-edge-functions.mjs deploy \\
    --function <name> [--function <name> ...] \\
    --project-ref ${PRODUCTION_PROJECT_REF} \\
    --reviewed-sha <40-hex-sha> --operator <label> \\
    --forward-fix-id <safe-record-id> \\
    --smoke-check-id <allowlisted-machine-smoke-id> \\
    --receipt <ignored-or-outside-path> \\
    [--allow-create <name> ...] \\
    [--allow-unchanged-bundle <name> ...] [--dry-run]

  node scripts/deploy-edge-functions.mjs smoke \\
    --function <name> [--function <name> ...] \\
    --reviewed-sha <40-hex-sha> --receipt <existing-path> \\
    --check-id <allowlisted-machine-smoke-id>
`

export class SafeError extends Error {
  constructor(stage, code, { functionName, exitCode } = {}) {
    super(code)
    this.name = 'SafeError'
    this.stage = stage
    this.code = code
    this.functionName = functionName
    this.exitCode = exitCode
  }
}

function fail(stage, code, details) {
  throw new SafeError(stage, code, details)
}

function safeError(error, stage = 'internal') {
  return error instanceof SafeError ? error : new SafeError(stage, 'unexpected_error')
}

function valueAfter(argv, index) {
  const value = argv[index + 1]
  if (!value || value.startsWith('-')) fail('arguments', 'missing_option_value')
  return value
}

function setOnce(options, key, value) {
  if (options[key] !== undefined) fail('arguments', 'duplicate_option')
  options[key] = value
}

export function parseArguments(argv) {
  const action = argv[0]
  if (action !== 'deploy' && action !== 'smoke') fail('arguments', 'invalid_action')

  const options = {
    action,
    functions: [],
    allowCreate: [],
    allowUnchangedBundle: [],
    dryRun: false,
  }
  const valueOptions = action === 'deploy'
    ? new Map([
        ['--project-ref', 'projectRef'],
        ['--reviewed-sha', 'reviewedSha'],
        ['--operator', 'operator'],
        ['--receipt', 'receipt'],
        ['--forward-fix-id', 'forwardFixId'],
        ['--smoke-check-id', 'smokeCheckId'],
      ])
    : new Map([
        ['--reviewed-sha', 'reviewedSha'],
        ['--receipt', 'receipt'],
        ['--check-id', 'checkId'],
      ])

  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === '--function' || option === '--allow-create' || option === '--allow-unchanged-bundle') {
      if (option !== '--function' && action !== 'deploy') fail('arguments', 'unknown_option')
      const target = option === '--function'
        ? options.functions
        : option === '--allow-create'
          ? options.allowCreate
          : options.allowUnchangedBundle
      target.push(valueAfter(argv, index))
      index += 1
      continue
    }
    if (option === '--dry-run') {
      if (action !== 'deploy' || options.dryRun) fail('arguments', 'invalid_dry_run')
      options.dryRun = true
      continue
    }
    const key = valueOptions.get(option)
    if (!key) fail('arguments', option.startsWith('-') ? 'unknown_option' : 'extra_argument')
    setOnce(options, key, valueAfter(argv, index))
    index += 1
  }

  const required = action === 'deploy'
    ? ['projectRef', 'reviewedSha', 'operator', 'receipt', 'forwardFixId', 'smokeCheckId']
    : ['reviewedSha', 'receipt', 'checkId']
  if (required.some((key) => !options[key]) || options.functions.length === 0) {
    fail('arguments', 'missing_required_option')
  }
  if (!SHA_PATTERN.test(options.reviewedSha)) fail('arguments', 'reviewed_sha_must_be_40_hex')
  if (
    action === 'deploy'
    && (!SAFE_OPERATOR.test(options.operator) || CREDENTIAL_LIKE.test(options.operator))
  ) fail('arguments', 'invalid_operator')
  return options
}

function runSync(command, args, { cwd = REPO_ROOT, encoding = 'utf8', input } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding,
    input,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: MAX_OUTPUT,
  })
  if (result.error || result.status !== 0) fail('preflight', 'local_command_failed', {
    exitCode: result.status ?? null,
  })
  return result.stdout
}

function git(args) {
  return String(runSync('git', args)).trim()
}

function gitBuffer(args) {
  return runSync('git', args, { encoding: null })
}

function requireNode24() {
  if (Number(process.versions.node.split('.')[0]) !== 24) fail('runtime', 'node_24_required')
}

function projectRefFromConfig(config) {
  const matches = [...String(config).matchAll(/^\s*project_id\s*=\s*"([a-z0-9]+)"\s*(?:#.*)?$/gm)]
  if (matches.length !== 1) fail('preflight', 'invalid_project_config')
  return matches[0][1]
}

function validateAllowCreate(allowCreate, functions) {
  const seen = new Set()
  for (const name of allowCreate) {
    if (seen.has(name) || !functions.includes(name)) fail('preflight', 'invalid_allow_create')
    seen.add(name)
  }
  return [...allowCreate]
}

export function validateReleaseTreeEntries(output) {
  const lines = String(output).split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) fail('preflight', 'invalid_release_tree')
  const paths = []
  for (const line of lines) {
    const match = /^(100644|100755) blob [0-9a-f]{40}\t(.+)$/.exec(line)
    if (!match) fail('preflight', 'invalid_release_tree')
    const path = match[2]
    if (
      path !== 'deno.lock'
      && !path.startsWith('supabase/')
      && !path.startsWith('scripts/edge-function-smoke/')
    ) fail('preflight', 'invalid_release_tree')
    paths.push(path)
  }
  return paths
}

function validateFunctionSubset(values, functions, code) {
  const seen = new Set()
  for (const name of values) {
    if (seen.has(name) || !functions.includes(name)) fail('preflight', code)
    seen.add(name)
  }
  return [...values]
}

async function readRepositoryContract(options) {
  const topLevel = realpathSync(git(['rev-parse', '--show-toplevel']))
  if (topLevel !== REPO_ROOT) fail('preflight', 'repository_root_mismatch')

  const headSha = git(['rev-parse', 'HEAD'])
  const headTree = git(['rev-parse', 'HEAD^{tree}'])
  const gitStatus = git(['status', '--porcelain=v1', '--untracked-files=all'])
  const ignoredFunctionFiles = git([
    'ls-files', '--others', '--ignored', '--exclude-standard', '--', 'supabase/functions',
  ])
  if (!SHA_PATTERN.test(headSha) || !SHA_PATTERN.test(headTree)) fail('preflight', 'invalid_git_identity')

  let config
  let localFunctions
  try {
    const releasePaths = validateReleaseTreeEntries(git([
      'ls-tree', '-r', options.reviewedSha, '--',
      'supabase', 'scripts/edge-function-smoke', 'deno.lock',
    ]))
    if (!releasePaths.includes('deno.lock') || !releasePaths.includes('supabase/config.toml')) {
      fail('preflight', 'invalid_release_tree')
    }
    config = git(['show', `${options.reviewedSha}:supabase/config.toml`])
    localFunctions = git([
      'ls-tree', '-d', '--name-only', `${options.reviewedSha}:supabase/functions`,
    ]).split(/\r?\n/).filter((name) => name && name !== '_shared').sort()
  } catch {
    fail('preflight', 'reviewed_manifest_unavailable')
  }
  const projectRef = projectRefFromConfig(config)

  let modes
  let functions
  try {
    modes = parseFunctionModes(config, localFunctions)
    functions = validateRequestedFunctions(options.functions, modes)
  } catch {
    fail('preflight', 'invalid_function_manifest')
  }
  const allowCreate = validateAllowCreate(options.allowCreate ?? [], functions)
  const allowUnchangedBundle = validateFunctionSubset(
    options.allowUnchangedBundle ?? [],
    functions,
    'invalid_allow_unchanged_bundle',
  )

  let release
  try {
    release = assertReleaseContext({
      gitStatus,
      ignoredFunctionFiles,
      headSha,
      headTree,
      reviewedSha: options.reviewedSha,
      projectRef,
      expectedProjectRef: PRODUCTION_PROJECT_REF,
    })
  } catch {
    fail('preflight', 'release_context_invalid')
  }
  if (options.projectRef !== undefined && options.projectRef !== PRODUCTION_PROJECT_REF) {
    fail('preflight', 'project_ref_mismatch')
  }

  return {
    ...release,
    modes,
    functions,
    allowCreate,
    allowUnchangedBundle,
    smokeCheckId: options.smokeCheckId ?? options.checkId,
  }
}

function createArchiveSnapshot(contract) {
  const snapshotPath = mkdtempSync(join(tmpdir(), 'tonus-edge-release-'))
  try {
    const archive = gitBuffer([
      'archive', '--format=tar', contract.reviewedSha,
      'supabase', 'scripts/edge-function-smoke', 'deno.lock',
    ])
    const extracted = spawnSync('tar', ['-xf', '-', '-C', snapshotPath], {
      input: archive,
      encoding: null,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: MAX_OUTPUT,
    })
    if (extracted.error || extracted.status !== 0) fail('snapshot', 'snapshot_extract_failed')
    validateSnapshotModuleGraph(snapshotPath, contract.functions)
    return {
      path: snapshotPath,
      sha256: createHash('sha256').update(archive).digest('hex'),
    }
  } catch (error) {
    rmSync(snapshotPath, { recursive: true, force: true })
    throw error
  }
}

function validateSnapshotModuleGraph(snapshotPath, functions) {
  const functionsRoot = join(snapshotPath, 'supabase/functions')
  const sourceRoots = [
    join(functionsRoot, '_shared'),
    ...functions.map((name) => join(functionsRoot, name)),
  ].filter((path) => existsSync(path))
  const unsupportedManifestNames = new Set([
    'deno.json', 'deno.jsonc', 'import_map.json', 'import-map.json', 'package.json', '.npmrc',
  ])
  const rootFiles = readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(functionsRoot, entry.name))
  const scopedFiles = [...rootFiles, ...sourceRoots.flatMap((root) => collectRegularFiles(root))]
  if (scopedFiles.some((path) => unsupportedManifestNames.has(basename(path)))) {
    fail('preflight', 'unsupported_module_manifest')
  }
  if (/^[ \t]*(?!#)[^=\r\n]*(?:import_map|entrypoint)[^=\r\n]*=/m.test(
    readFileSync(join(snapshotPath, 'supabase/config.toml'), 'utf8'),
  )) {
    fail('preflight', 'unsupported_module_manifest')
  }

  const queue = functions.map((name) => join(functionsRoot, name, 'index.ts'))
  const visited = new Set()
  while (queue.length > 0) {
    const path = queue.shift()
    if (visited.has(path)) continue
    if (!existsSync(path) || !lstatSync(path).isFile()) fail('preflight', 'module_graph_invalid')
    visited.add(path)
    if (!/\.(?:[cm]?[jt]sx?)$/.test(path)) continue

    const pathFromSnapshot = relative(snapshotPath, path).split(sep).join('/')
    const source = readFileSync(path, 'utf8')
    let specifiers
    try {
      specifiers = extractModuleSpecifiers(pathFromSnapshot, source)
      validatePinnedRemoteImports([{ path: pathFromSnapshot, source }])
    } catch (error) {
      if (String(error?.message).startsWith('Unpinned remote module import')) {
        fail('preflight', 'unpinned_remote_import')
      }
      fail('preflight', 'module_graph_invalid')
    }

    for (const specifier of specifiers) {
      if (/^(?:https?:\/\/|npm:|jsr:|node:)/.test(specifier)) continue
      if (!/^\.\.?\//.test(specifier) || /[?#]/.test(specifier)) {
        fail('preflight', 'unsupported_module_specifier')
      }
      const importedPath = resolve(dirname(path), specifier)
      const fromFunctionsRoot = relative(functionsRoot, importedPath)
      if (
        fromFunctionsRoot === ''
        || fromFunctionsRoot === '..'
        || fromFunctionsRoot.startsWith(`..${sep}`)
        || isAbsolute(fromFunctionsRoot)
      ) fail('preflight', 'module_import_outside_functions')
      queue.push(importedPath)
    }
  }
}

function removeSnapshot(snapshot) {
  rmSync(snapshot.path, { recursive: true, force: true })
}

function isInsideRepository(path) {
  const pathFromRoot = relative(REPO_ROOT, path)
  return pathFromRoot !== ''
    && pathFromRoot !== '..'
    && !pathFromRoot.startsWith(`..${sep}`)
    && !isAbsolute(pathFromRoot)
}

function canonicalReceiptLocation(input, { createParent }) {
  const unresolved = resolve(REPO_ROOT, input)
  const unresolvedParent = dirname(unresolved)
  let existingParent = unresolvedParent
  while (!existsSync(existingParent)) {
    const next = dirname(existingParent)
    if (next === existingParent) fail('receipt', 'receipt_parent_missing')
    existingParent = next
  }
  if (!statSync(existingParent).isDirectory()) fail('receipt', 'receipt_parent_not_directory')

  const candidateParent = resolve(realpathSync(existingParent), relative(existingParent, unresolvedParent))
  const candidatePath = join(candidateParent, basename(unresolved))
  if (isInsideRepository(unresolved) !== isInsideRepository(candidatePath)) {
    fail('receipt', 'receipt_symlink_crosses_repository_boundary')
  }

  if (!existsSync(candidateParent)) {
    if (!createParent || !isInsideRepository(candidatePath)) {
      fail('receipt', 'receipt_parent_missing')
    }
    try {
      mkdirSync(candidateParent, { recursive: true, mode: 0o700 })
    } catch {
      fail('receipt', 'receipt_parent_unwritable')
    }
  }
  const parent = realpathSync(candidateParent)
  return { parent, path: join(parent, basename(unresolved)) }
}

function requireIgnoredReceiptPath(receiptPath) {
  if (!isInsideRepository(receiptPath)) return
  const pathFromRoot = relative(REPO_ROOT, receiptPath)
  const ignored = spawnSync('git', ['check-ignore', '--quiet', '--', pathFromRoot], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (ignored.error || ignored.status !== 0) fail('receipt', 'receipt_path_must_be_ignored')
}

function validateReceiptPath(input, { mustExist, createParent = false }) {
  const handle = canonicalReceiptLocation(input, { createParent })
  requireIgnoredReceiptPath(handle.path)
  if (existsSync(handle.path) && lstatSync(handle.path).isSymbolicLink()) {
    fail('receipt', 'receipt_symlink_not_allowed')
  }
  if (mustExist !== existsSync(handle.path)) {
    fail('receipt', mustExist ? 'receipt_missing' : 'receipt_already_exists')
  }
  return handle
}

function verifyReceiptHandle(handle) {
  if (realpathSync(handle.parent) !== handle.parent || dirname(handle.path) !== handle.parent) {
    fail('receipt', 'receipt_parent_changed')
  }
  if (existsSync(handle.path) && lstatSync(handle.path).isSymbolicLink()) {
    fail('receipt', 'receipt_symlink_not_allowed')
  }
}

function serializedReceipt(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function writeDurableTemporary(path, value) {
  const descriptor = openSync(path, 'wx', 0o600)
  try {
    writeFileSync(descriptor, serializedReceipt(value), { encoding: 'utf8' })
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function syncDirectory(path) {
  const descriptor = openSync(path, 'r')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function reserveReceipt(handle, value) {
  verifyReceiptHandle(handle)
  const temporary = join(handle.parent, `.${process.pid}-${Date.now()}.reserve`)
  try {
    writeDurableTemporary(temporary, value)
    linkSync(temporary, handle.path)
    unlinkSync(temporary)
    syncDirectory(handle.parent)
  } catch {
    rmSync(temporary, { force: true })
    fail('receipt', 'receipt_reservation_failed')
  }
}

function persistReceipt(handle, value) {
  verifyReceiptHandle(handle)
  if (!existsSync(handle.path)) fail('receipt', 'receipt_missing')
  const temporary = join(handle.parent, `.${process.pid}-${Date.now()}.tmp`)
  try {
    writeDurableTemporary(temporary, value)
    renameSync(temporary, handle.path)
    syncDirectory(handle.parent)
  } catch {
    rmSync(temporary, { force: true })
    fail('receipt', 'receipt_write_failed')
  }
}

function readReceipt(handle) {
  verifyReceiptHandle(handle)
  try {
    const receipt = JSON.parse(readFileSync(handle.path, 'utf8'))
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('invalid')
    return receipt
  } catch {
    fail('receipt', 'receipt_invalid')
  }
}

function runProcess(command, args, { cwd, stage, functionName } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    let outputSize = 0
    let interrupted = false

    const collect = (target) => (chunk) => {
      outputSize += chunk.length
      if (outputSize > MAX_OUTPUT) {
        child.kill('SIGKILL')
        return
      }
      target.push(chunk)
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))

    const signalHandler = () => {
      interrupted = true
      child.kill('SIGTERM')
    }
    process.once('SIGINT', signalHandler)
    process.once('SIGTERM', signalHandler)

    child.once('error', () => {
      process.removeListener('SIGINT', signalHandler)
      process.removeListener('SIGTERM', signalHandler)
      rejectPromise(new SafeError(stage, 'process_start_failed', { functionName }))
    })
    child.once('close', (code) => {
      process.removeListener('SIGINT', signalHandler)
      process.removeListener('SIGTERM', signalHandler)
      if (interrupted) {
        rejectPromise(new SafeError(stage, 'process_interrupted', { functionName, exitCode: code }))
        return
      }
      if (outputSize > MAX_OUTPUT) {
        rejectPromise(new SafeError(stage, 'command_output_limit', { functionName, exitCode: code }))
        return
      }
      if (code !== 0) {
        rejectPromise(new SafeError(stage, 'supabase_command_failed', { functionName, exitCode: code }))
        return
      }
      resolvePromise(Buffer.concat(stdout).toString('utf8'))
    })
  })
}

async function runSupabase(args, { cwd, stage, functionName }) {
  return runProcess(
    'npx',
    ['--yes', `supabase@${SUPABASE_CLI_VERSION}`, ...args],
    { cwd, stage, functionName },
  )
}

async function listFunctionMetadata(projectRef, functionName, snapshotPath, stage, { allowMissing = false } = {}) {
  const output = await runSupabase(
    ['functions', 'list', '--project-ref', projectRef, '--output', 'json'],
    { cwd: snapshotPath, stage, functionName },
  )
  let functions
  try {
    functions = JSON.parse(output)
  } catch {
    fail(stage, 'invalid_metadata_json', { functionName, exitCode: 0 })
  }
  if (!Array.isArray(functions)) fail(stage, 'invalid_metadata_shape', { functionName, exitCode: 0 })
  const matches = functions.filter((entry) => entry?.name === functionName)
  if (matches.length === 0 && allowMissing) return null
  if (matches.length !== 1) {
    fail(stage, matches.length === 0 ? 'function_metadata_missing' : 'function_metadata_not_unique', {
      functionName,
      exitCode: 0,
    })
  }
  return matches[0]
}

async function deployFunction(projectRef, functionName, snapshotPath) {
  await runSupabase(
    ['functions', 'deploy', functionName, '--project-ref', projectRef],
    { cwd: snapshotPath, stage: 'deploy', functionName },
  )
}

function collectRegularFiles(root, current = root) {
  const files = []
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name)
    if (entry.isSymbolicLink()) fail('source_verify', 'downloaded_source_symlink')
    if (entry.isDirectory()) files.push(...collectRegularFiles(root, path))
    else if (entry.isFile()) files.push(path)
    else fail('source_verify', 'downloaded_source_special_file')
  }
  return files
}

async function verifyRemoteArtifact(projectRef, functionName, reviewedSha, expected, snapshotPath) {
  const downloadRoot = mkdtempSync(join(tmpdir(), 'tonus-edge-download-'))
  try {
    await runSupabase(
      ['functions', 'download', functionName, '--project-ref', projectRef, '--use-api'],
      { cwd: downloadRoot, stage: 'source_download', functionName },
    )
    const sourceRoot = join(downloadRoot, 'supabase/functions')
    if (!existsSync(sourceRoot)) fail('source_verify', 'downloaded_source_missing', { functionName })
    const files = collectRegularFiles(sourceRoot).sort()
    if (files.length === 0) fail('source_verify', 'downloaded_source_empty', { functionName })
    const entrypoint = join(sourceRoot, functionName, 'index.ts')
    if (!files.includes(entrypoint)) fail('source_verify', 'downloaded_entrypoint_missing', { functionName })

    const hash = createHash('sha256')
    for (const file of files) {
      const pathFromDownload = relative(downloadRoot, file).split(sep).join('/')
      const liveBytes = readFileSync(file)
      let reviewedBytes
      try {
        reviewedBytes = gitBuffer(['show', `${reviewedSha}:${pathFromDownload}`])
      } catch {
        fail('source_verify', 'downloaded_source_not_reviewed', { functionName })
      }
      if (!liveBytes.equals(reviewedBytes)) {
        fail('source_verify', 'downloaded_source_mismatch', { functionName })
      }
      hash.update(pathFromDownload)
      hash.update('\0')
      hash.update(liveBytes)
      hash.update('\0')
    }

    const stable = await listFunctionMetadata(
      projectRef,
      functionName,
      snapshotPath,
      'metadata_stable',
    )
    if (!metadataIdentityMatches(expected, stable)) {
      fail('metadata_stable', 'live_artifact_changed', { functionName })
    }
    return {
      after: stable,
      source: {
        sha256: hash.digest('hex'),
        fileCount: files.length,
        entrypointVerified: true,
        stableMetadata: true,
      },
    }
  } finally {
    rmSync(downloadRoot, { recursive: true, force: true })
  }
}

const SMOKE_CHECKS = new Map([
  ['chat-health-jwt-boundary', {
    functions: ['chat-health'],
    script: 'scripts/edge-function-smoke/chat-health-jwt-boundary.mjs',
  }],
])

function validateSmokeCheck(checkId, functions) {
  const check = SMOKE_CHECKS.get(checkId)
  if (!check || JSON.stringify(check.functions) !== JSON.stringify(functions)) {
    fail('smoke', 'smoke_check_not_allowlisted')
  }
  return check
}

async function runSmoke(checkId, context, snapshotPath) {
  const check = validateSmokeCheck(checkId, context.functions)
  const output = await runProcess(
    process.execPath,
    [
      join(snapshotPath, check.script),
      '--project-ref', context.projectRef,
      '--reviewed-sha', context.reviewedSha,
    ],
    { cwd: snapshotPath, stage: 'smoke' },
  )
  let result
  try {
    result = JSON.parse(output)
  } catch {
    fail('smoke', 'invalid_smoke_output')
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    fail('smoke', 'invalid_smoke_output')
  }
  return result
}

export function createProductionRuntime() {
  return {
    requireNode24,
    now: () => new Date().toISOString(),
    readReleaseContract: readRepositoryContract,
    createSnapshot: async (contract) => createArchiveSnapshot(contract),
    removeSnapshot: async (snapshot) => removeSnapshot(snapshot),
    validateReceiptPath,
    reserveReceipt,
    persistReceipt,
    readReceipt,
    listFunctionMetadata,
    deployFunction,
    verifyRemoteArtifact,
    validateSmokeCheck,
    runSmoke,
    print: (payload) => console.log(JSON.stringify(payload)),
  }
}

function releaseMatchesReceipt(receipt, contract, snapshot) {
  return receipt.status === 'smoke_pending'
    && receipt.projectRef === contract.projectRef
    && receipt.reviewedSha === contract.reviewedSha
    && receipt.reviewedTree === contract.reviewedTree
    && receipt.snapshotSha256 === snapshot.sha256
    && receipt.cliVersion === SUPABASE_CLI_VERSION
    && receipt.smokeCheckId === contract.smokeCheckId
    && JSON.stringify(receipt.functions) === JSON.stringify(contract.functions)
    && Array.isArray(receipt.deployments)
    && receipt.deployments.every((deployment) => (
      contract.modes.has(deployment.name)
      && deployment.after?.verify_jwt === contract.modes.get(deployment.name)
    ))
}

function sourceProofMatches(expected, actual) {
  return expected?.sha256 === actual?.sha256
    && expected?.fileCount === actual?.fileCount
    && expected?.entrypointVerified === true
    && actual?.entrypointVerified === true
    && expected?.stableMetadata === true
    && actual?.stableMetadata === true
}

async function deployAction(options, runtime) {
  const contract = await runtime.readReleaseContract(options)
  runtime.validateSmokeCheck(options.smokeCheckId, contract.functions)
  const snapshot = await runtime.createSnapshot(contract)
  try {
    const receiptHandle = runtime.validateReceiptPath(options.receipt, {
      mustExist: false,
      createParent: !options.dryRun,
    })
    if (options.dryRun) {
      runtime.print({
        ok: true,
        action: 'dry-run',
        reviewedSha: contract.reviewedSha,
        reviewedTree: contract.reviewedTree,
        snapshotSha256: snapshot.sha256,
        functions: contract.functions,
        allowCreate: contract.allowCreate,
        allowUnchangedBundle: contract.allowUnchangedBundle,
      })
      return
    }

    let receipt = createDeploymentReceipt({
      projectRef: contract.projectRef,
      reviewedSha: contract.reviewedSha,
      reviewedTree: contract.reviewedTree,
      snapshotSha256: snapshot.sha256,
      operator: options.operator,
      cliVersion: SUPABASE_CLI_VERSION,
      functions: contract.functions,
      smokeCheckId: options.smokeCheckId,
      allowCreate: contract.allowCreate,
      allowUnchangedBundle: contract.allowUnchangedBundle,
      recovery: { strategy: 'forward_fix', recordId: options.forwardFixId },
      startedAt: runtime.now(),
    })
    runtime.reserveReceipt(receiptHandle, receipt)

    try {
      for (const functionName of contract.functions) {
        const allowCreate = contract.allowCreate.includes(functionName)
        const allowUnchangedBundle = contract.allowUnchangedBundle.includes(functionName)
        let before = await runtime.listFunctionMetadata(
          contract.projectRef,
          functionName,
          snapshot.path,
          'metadata_pre',
          { allowMissing: true },
        )
        if (before === null && !allowCreate) {
          fail('metadata_pre', 'function_metadata_missing', { functionName })
        }
        if (before !== null) {
          try {
            before = validatePreDeployMetadata(before, functionName)
          } catch {
            fail('metadata_pre', 'invalid_pre_deploy_metadata', { functionName })
          }
        }
        receipt = advanceDeploymentReceipt(receipt, {
          type: 'pre_state', functionName, name: functionName, before, at: runtime.now(),
        })
        runtime.persistReceipt(receiptHandle, receipt)

        receipt = advanceDeploymentReceipt(receipt, {
          type: 'deploy_started', name: functionName, at: runtime.now(),
        })
        runtime.persistReceipt(receiptHandle, receipt)
        await runtime.deployFunction(contract.projectRef, functionName, snapshot.path)

        receipt = advanceDeploymentReceipt(receipt, {
          type: 'deploy_returned', name: functionName, at: runtime.now(),
        })
        runtime.persistReceipt(receiptHandle, receipt)
        const after = await runtime.listFunctionMetadata(
          contract.projectRef,
          functionName,
          snapshot.path,
          'metadata_post',
        )
        let verified
        try {
          verified = verifyPostDeploy({
            before,
            after,
            expectedVerifyJwt: contract.modes.get(functionName),
            allowCreate,
            allowUnchangedBundle,
          })
        } catch {
          fail('metadata_post', 'post_deploy_verification_failed', { functionName })
        }
        const artifact = await runtime.verifyRemoteArtifact(
          contract.projectRef,
          functionName,
          contract.reviewedSha,
          verified,
          snapshot.path,
        )
        receipt = advanceDeploymentReceipt(receipt, {
          type: 'verified',
          name: functionName,
          after: artifact.after,
          source: artifact.source,
          at: runtime.now(),
        })
        runtime.persistReceipt(receiptHandle, receipt)
      }
      receipt = advanceDeploymentReceipt(receipt, { type: 'ready_for_smoke', at: runtime.now() })
      runtime.persistReceipt(receiptHandle, receipt)
    } catch (error) {
      const safe = safeError(error)
      try {
        const failedReceipt = failDeploymentReceipt(receipt, {
          stage: safe.stage,
          code: safe.code,
          functionName: safe.functionName,
          at: runtime.now(),
        })
        runtime.persistReceipt(receiptHandle, failedReceipt)
        safe.receiptWritten = true
      } catch {
        safe.receiptWritten = false
      }
      throw safe
    }

    runtime.print({
      ok: true,
      status: receipt.status,
      reviewedSha: receipt.reviewedSha,
      reviewedTree: receipt.reviewedTree,
      functions: receipt.functions,
    })
  } finally {
    await runtime.removeSnapshot(snapshot)
  }
}

async function smokeAction(options, runtime) {
  const contract = await runtime.readReleaseContract(options)
  runtime.validateSmokeCheck(options.checkId, contract.functions)
  const snapshot = await runtime.createSnapshot(contract)
  try {
    const receiptHandle = runtime.validateReceiptPath(options.receipt, { mustExist: true })
    const receipt = runtime.readReceipt(receiptHandle)
    if (!releaseMatchesReceipt(receipt, contract, snapshot)) fail('receipt', 'receipt_release_mismatch')
    try {
      validateDeploymentReceiptForSmoke(receipt)
    } catch {
      fail('receipt', 'receipt_invalid')
    }

    const assertions = []
    let smokeStatus = 'passed'
    let liveArtifacts = []
    try {
      const beforeSmoke = []
      for (const deployment of receipt.deployments) {
        const live = await runtime.listFunctionMetadata(
          contract.projectRef,
          deployment.name,
          snapshot.path,
          'smoke_metadata_pre',
        )
        if (!metadataIdentityMatches(deployment.after, live)) {
          throw new SafeError('smoke', 'live_artifact_superseded', { functionName: deployment.name })
        }
        const attributed = await runtime.verifyRemoteArtifact(
          contract.projectRef,
          deployment.name,
          contract.reviewedSha,
          live,
          snapshot.path,
        )
        if (
          !metadataIdentityMatches(deployment.after, attributed.after)
          || !sourceProofMatches(deployment.source, attributed.source)
        ) {
          throw new SafeError('smoke', 'source_attribution_mismatch', {
            functionName: deployment.name,
          })
        }
        beforeSmoke.push(attributed.after)
      }

      const result = await runtime.runSmoke(options.checkId, {
        projectRef: contract.projectRef,
        reviewedSha: contract.reviewedSha,
        functions: contract.functions,
        artifacts: beforeSmoke,
      }, snapshot.path)
      if (result.status !== 'passed' && result.status !== 'failed') {
        throw new SafeError('smoke', 'invalid_smoke_output')
      }
      smokeStatus = result.status
      if (!Array.isArray(result.assertions)) throw new SafeError('smoke', 'invalid_smoke_output')
      assertions.push(...result.assertions)

      for (const deployment of receipt.deployments) {
        const live = await runtime.listFunctionMetadata(
          contract.projectRef,
          deployment.name,
          snapshot.path,
          'smoke_metadata_post',
        )
        liveArtifacts.push(live)
        if (!metadataIdentityMatches(deployment.after, live)) {
          smokeStatus = 'failed'
          assertions.push({ id: 'live-artifact-stable', status: 'failed' })
        }
      }
    } catch {
      smokeStatus = 'failed'
      assertions.push({ id: 'smoke-harness-execution', status: 'failed' })
      liveArtifacts = receipt.deployments.map((deployment) => deployment.after)
    }

    let completed
    try {
      completed = completeDeploymentReceipt(receipt, {
        status: smokeStatus,
        checkId: options.checkId,
        machineProduced: true,
        completedAt: runtime.now(),
        reviewedSha: contract.reviewedSha,
        functions: contract.functions,
        liveArtifacts,
        assertions,
      })
    } catch {
      fail('receipt', 'smoke_evidence_mismatch')
    }
    runtime.persistReceipt(receiptHandle, completed)
    if (completed.status !== 'complete') throw new SafeError('smoke', 'smoke_failed')
    runtime.print({
      ok: true,
      status: completed.status,
      reviewedSha: completed.reviewedSha,
      reviewedTree: completed.reviewedTree,
      functions: completed.functions,
    })
  } finally {
    await runtime.removeSnapshot(snapshot)
  }
}

export async function runCli(argv, runtime = createProductionRuntime()) {
  runtime.requireNode24()
  const options = parseArguments(argv)
  if (options.action === 'deploy') await deployAction(options, runtime)
  else await smokeAction(options, runtime)
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
  if (
    process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])
    || process.argv.length === 4 && ['deploy', 'smoke'].includes(process.argv[2])
      && ['--help', '-h'].includes(process.argv[3])
  ) {
    console.log(HELP)
  } else {
    try {
      await runCli(process.argv.slice(2))
    } catch (error) {
      const safe = safeError(error)
      const payload = { ok: false, stage: safe.stage, error: safe.code }
      if (safe.functionName) payload.function = safe.functionName
      if (safe.exitCode !== undefined) payload.exit = safe.exitCode
      if (safe.receiptWritten !== undefined) payload.receipt_written = safe.receiptWritten
      console.error(JSON.stringify(payload))
      process.exitCode = 1
    }
  }
}
