import ts from 'typescript'

export const SUPABASE_CLI_VERSION = '2.109.1'
export const RECEIPT_SCHEMA_VERSION = 2

const FUNCTION_SECTION = /^\s*\[functions\.([^\]]+)]\s*(?:#.*)?$/
const VERIFY_JWT = /^\s*verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SAFE_CODE = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/
const SHA256 = /^[0-9a-f]{64}$/
const REMOTE_MODULE = /^(?:https?:\/\/|npm:|jsr:)/
const VERSION = 'v?\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?'
const EXACT_NPM = new RegExp(`^npm:(?:@[^/]+/)?[^@/]+@${VERSION}(?:/[^?#]*)?$`)
const EXACT_JSR = new RegExp(`^jsr:@[^/]+/[^@/]+@${VERSION}(?:/[^?#]*)?$`)
const EXACT_ESM_SH = new RegExp(`^https://esm\\.sh/(?:v\\d+/)?(?:@[^/]+/)?[^@/?#]+@${VERSION}(?:/[^?#]*)?$`)
const EXACT_DENO_LAND = new RegExp(`^https://deno\\.land/(?:std|x/[^@/]+)@${VERSION}(?:/[^?#]*)?$`)
const IMMUTABLE_GITHUB = /^https:\/\/(?:raw\.githubusercontent\.com\/[^/]+\/[^/]+|github\.com\/[^/]+\/[^/]+\/(?:raw|blob))\/[0-9a-f]{40}(?:\/[^?#]*)?$/
const GIT_SHA = /^[0-9a-f]{40}$/
const SAFE_OPERATOR = /^[A-Za-z0-9 .@/-]{1,80}$/
const CREDENTIAL_LIKE = /(?:github_pat_|gh[pousr]_|sbp_|sb_secret_|eyJ[a-zA-Z0-9_-]*\.)/i
const RECEIPT_STATUSES = new Set([
  'deployment_in_progress',
  'smoke_pending',
  'complete',
  'smoke_failed',
  'failed',
])

export function parseFunctionModes(config, localFunctions) {
  const sections = new Map()
  let currentFunction = null

  for (const line of String(config).split(/\r?\n/)) {
    const section = FUNCTION_SECTION.exec(line)
    if (section) {
      currentFunction = section[1]
      if (sections.has(currentFunction)) {
        throw new Error(`Duplicate function mode declaration: ${currentFunction}`)
      }
      sections.set(currentFunction, [])
      continue
    }

    if (/^\s*\[/.test(line)) {
      currentFunction = null
      continue
    }

    if (currentFunction) sections.get(currentFunction).push(line)
  }

  const local = new Set(localFunctions)
  for (const name of sections.keys()) {
    if (!local.has(name)) throw new Error(`Unknown function mode declaration: ${name}`)
  }

  const modes = new Map()
  for (const name of localFunctions) {
    const lines = sections.get(name)
    if (!lines) throw new Error(`Missing explicit function mode declaration: ${name}`)

    const declarations = lines
      .map((line) => VERIFY_JWT.exec(line)?.[1])
      .filter(Boolean)
    if (declarations.length === 0) {
      throw new Error(`Missing explicit verify_jwt mode for function: ${name}`)
    }
    if (declarations.length > 1) {
      throw new Error(`Duplicate verify_jwt mode for function: ${name}`)
    }
    modes.set(name, declarations[0] === 'true')
  }

  return modes
}

function literalModuleSpecifier(node) {
  if (ts.isStringLiteralLike(node)) return node.text
  throw new Error('Non-literal module specifier is not allowed in a deployment graph')
}

export function extractModuleSpecifiers(path, source) {
  const sourceFile = ts.createSourceFile(
    path,
    String(source),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') || path.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics?.length > 0) {
    throw new Error(`Deployment module cannot be parsed: ${path}`)
  }

  const specifiers = []
  for (const directive of sourceFile.typeReferenceDirectives ?? []) {
    specifiers.push(directive.fileName)
  }
  for (const directive of sourceFile.referencedFiles ?? []) {
    if (/^(?:https?:\/\/|npm:|jsr:)/.test(directive.fileName)) specifiers.push(directive.fileName)
  }
  for (const match of String(source).matchAll(/@deno-types\s*=\s*["']([^"']+)["']/g)) {
    specifiers.push(match[1])
  }
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
    ) {
      specifiers.push(literalModuleSpecifier(node.moduleSpecifier))
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
    ) {
      specifiers.push(literalModuleSpecifier(node.moduleReference.expression))
    } else if (ts.isImportTypeNode(node)) {
      if (!ts.isLiteralTypeNode(node.argument)) {
        throw new Error('Non-literal module specifier is not allowed in a deployment graph')
      }
      specifiers.push(literalModuleSpecifier(node.argument.literal))
    } else if (
      ts.isCallExpression(node)
      && (
        node.expression.kind === ts.SyntaxKind.ImportKeyword
        || ts.isIdentifier(node.expression) && node.expression.text === 'require'
      )
    ) {
      if (node.arguments.length !== 1) {
        throw new Error('Non-literal module specifier is not allowed in a deployment graph')
      }
      specifiers.push(literalModuleSpecifier(node.arguments[0]))
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...new Set(specifiers)]
}

export function validatePinnedRemoteImports(sources) {
  for (const file of sources) {
    if (!file || typeof file.path !== 'string' || typeof file.source !== 'string') {
      throw new Error('Deployment module graph input is invalid')
    }
    for (const specifier of extractModuleSpecifiers(file.path, file.source)) {
      if (
        REMOTE_MODULE.test(specifier)
        && !EXACT_NPM.test(specifier)
        && !EXACT_JSR.test(specifier)
        && !EXACT_ESM_SH.test(specifier)
        && !EXACT_DENO_LAND.test(specifier)
        && !IMMUTABLE_GITHUB.test(specifier)
      ) {
        throw new Error(`Unpinned remote module import in ${file.path}`)
      }
    }
  }
  return true
}

export function validateRequestedFunctions(requestedFunctions, modes) {
  if (!Array.isArray(requestedFunctions) || requestedFunctions.length === 0) {
    throw new Error('At least one function is required')
  }

  const seen = new Set()
  for (const name of requestedFunctions) {
    if (typeof name !== 'string' || name.includes(',')) {
      throw new Error('Provide one function per argument')
    }
    if (seen.has(name)) throw new Error(`Duplicate function: ${name}`)
    if (!modes.has(name)) throw new Error(`Unknown function: ${name}`)
    seen.add(name)
  }

  return [...requestedFunctions]
}

export function assertReleaseContext({
  gitStatus,
  ignoredFunctionFiles = '',
  headSha,
  headTree,
  reviewedSha,
  projectRef,
  expectedProjectRef,
}) {
  if (String(gitStatus).trim()) throw new Error('A clean checkout is required')
  if (String(ignoredFunctionFiles).trim()) {
    throw new Error('Ignored files are not allowed under supabase/functions')
  }
  if (headSha !== reviewedSha) throw new Error('Reviewed SHA does not match HEAD')
  if (projectRef !== expectedProjectRef) throw new Error('Project ref does not match the intended project')

  return { reviewedSha, reviewedTree: headTree, projectRef }
}

export function buildDeploySteps(functions, projectRef) {
  return functions.map((functionName) => ({
    functionName,
    command: 'npx',
    args: [
      '--yes',
      `supabase@${SUPABASE_CLI_VERSION}`,
      'functions',
      'deploy',
      functionName,
      '--project-ref',
      projectRef,
    ],
  }))
}

export async function runSequentialDeployments(steps, runner, { dryRun = false } = {}) {
  if (dryRun) return steps

  const results = []
  for (const step of steps) results.push(await runner(step))
  return results
}

function sanitizeMetadata(metadata) {
  if (metadata === null) return null
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Invalid function metadata')
  }
  const safe = {
    name: metadata.name,
    version: metadata.version,
    status: metadata.status,
    verify_jwt: metadata.verify_jwt,
  }
  if (Object.hasOwn(metadata, 'updated_at')) safe.updated_at = metadata.updated_at
  if (Object.hasOwn(metadata, 'ezbr_sha256')) safe.ezbr_sha256 = metadata.ezbr_sha256
  return safe
}

function assertArtifactMetadata(metadata) {
  if (
    !metadata
    || typeof metadata.name !== 'string'
    || !Number.isInteger(metadata.version)
    || metadata.version < 1
    || metadata.status !== 'ACTIVE'
    || typeof metadata.verify_jwt !== 'boolean'
    || !Number.isFinite(metadata.updated_at)
    || !SHA256.test(metadata.ezbr_sha256)
  ) throw new Error('Invalid stable function artifact metadata')
}

export function validatePreDeployMetadata(metadata, expectedName) {
  assertArtifactMetadata(metadata)
  if (metadata.name !== expectedName) throw new Error('Function metadata name is invalid')
  return sanitizeMetadata(metadata)
}

export function verifyPostDeploy({
  before,
  after,
  expectedVerifyJwt,
  allowCreate = false,
  allowUnchangedBundle = false,
}) {
  assertArtifactMetadata(after)
  if (after.verify_jwt !== expectedVerifyJwt) {
    throw new Error('Deployed function verify_jwt mode does not match')
  }

  if (before === null) {
    if (!allowCreate) throw new Error('Function create was not explicitly allowed')
    if (after.version !== 1) throw new Error('A first deployment must create the first version')
  } else {
    assertArtifactMetadata(before)
    if (before.name !== after.name) throw new Error('Function metadata name changed during deployment')
    if (after.version !== before.version + 1) {
      throw new Error('Deployed function did not make a single version transition')
    }
    if (after.ezbr_sha256 === before.ezbr_sha256 && !allowUnchangedBundle) {
      throw new Error('Deployed function has an unchanged bundle without explicit approval')
    }
  }

  return sanitizeMetadata(after)
}

export function metadataIdentityMatches(expected, actual) {
  try {
    assertArtifactMetadata(expected)
    assertArtifactMetadata(actual)
  } catch {
    return false
  }
  return expected.name === actual.name
    && expected.version === actual.version
    && expected.status === actual.status
    && expected.verify_jwt === actual.verify_jwt
    && expected.updated_at === actual.updated_at
    && expected.ezbr_sha256 === actual.ezbr_sha256
}

function assertSafeId(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new Error(`A valid ${label} is required`)
  }
}

function sanitizeRecovery(recovery) {
  if (!recovery || recovery.strategy !== 'forward_fix') {
    throw new Error('An explicit forward-fix recovery strategy is required')
  }
  assertSafeId(recovery.recordId, 'recovery record ID')
  return { strategy: 'forward_fix', recordId: recovery.recordId }
}

function assertSourceProof(source) {
  if (
    !source
    || !SHA256.test(source.sha256)
    || !Number.isInteger(source.fileCount)
    || source.fileCount < 1
    || source.entrypointVerified !== true
    || source.stableMetadata !== true
  ) throw new Error('Verified source attribution is required')
}

function sanitizeSourceProof(source) {
  assertSourceProof(source)
  return {
    sha256: source.sha256,
    fileCount: source.fileCount,
    entrypointVerified: true,
    stableMetadata: true,
  }
}

function baseReceiptFields(receipt) {
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    projectRef: receipt.projectRef,
    reviewedSha: receipt.reviewedSha,
    reviewedTree: receipt.reviewedTree,
    snapshotSha256: receipt.snapshotSha256,
    operator: receipt.operator,
    cliVersion: receipt.cliVersion,
    functions: [...receipt.functions],
    smokeCheckId: receipt.smokeCheckId,
    allowCreate: [...receipt.allowCreate],
    allowUnchangedBundle: [...receipt.allowUnchangedBundle],
    recovery: sanitizeRecovery(receipt.recovery),
    startedAt: receipt.startedAt,
    updatedAt: receipt.updatedAt,
    deployments: receipt.deployments.map((deployment) => ({
      name: deployment.name,
      before: sanitizeMetadata(deployment.before),
      after: sanitizeMetadata(deployment.after),
      source: sanitizeSourceProof(deployment.source),
    })),
    current: receipt.current === null
      ? null
      : {
          name: receipt.current.name,
          stage: receipt.current.stage,
          before: sanitizeMetadata(receipt.current.before),
        },
    secretsRedacted: true,
    responseBodiesRetained: false,
  }
}

function assertReceiptCore(receipt) {
  if (!receipt || receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION) {
    throw new Error('Unsupported deployment receipt schema')
  }
  if (!RECEIPT_STATUSES.has(receipt.status)) throw new Error('Invalid deployment receipt status')
  if (!Array.isArray(receipt.functions) || receipt.functions.length === 0) {
    throw new Error('Deployment receipt requires functions')
  }
  if (new Set(receipt.functions).size !== receipt.functions.length) {
    throw new Error('Deployment receipt function list is invalid')
  }
  assertSafeId(receipt.smokeCheckId, 'smoke check ID')
  if (!Array.isArray(receipt.allowCreate)) throw new Error('Deployment receipt allow-create list is invalid')
  if (receipt.allowCreate.some((name) => !receipt.functions.includes(name))) {
    throw new Error('Deployment receipt allow-create list is invalid')
  }
  if (!Array.isArray(receipt.allowUnchangedBundle)) {
    throw new Error('Deployment receipt unchanged-bundle list is invalid')
  }
  if (receipt.allowUnchangedBundle.some((name) => !receipt.functions.includes(name))) {
    throw new Error('Deployment receipt unchanged-bundle list is invalid')
  }
  if (!SHA256.test(receipt.snapshotSha256)) throw new Error('Deployment snapshot digest is invalid')
  if (!SAFE_OPERATOR.test(receipt.operator) || CREDENTIAL_LIKE.test(receipt.operator)) {
    throw new Error('Deployment receipt operator is invalid')
  }
  sanitizeRecovery(receipt.recovery)
  if (!Array.isArray(receipt.deployments)) throw new Error('Deployment evidence is invalid')
}

export function createDeploymentReceipt(input) {
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    projectRef: input.projectRef,
    reviewedSha: input.reviewedSha,
    reviewedTree: input.reviewedTree,
    snapshotSha256: input.snapshotSha256,
    operator: input.operator,
    cliVersion: input.cliVersion,
    functions: [...input.functions],
    smokeCheckId: input.smokeCheckId,
    allowCreate: [...(input.allowCreate ?? [])],
    allowUnchangedBundle: [...(input.allowUnchangedBundle ?? [])],
    recovery: sanitizeRecovery(input.recovery),
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
    deployments: [],
    current: null,
    secretsRedacted: true,
    responseBodiesRetained: false,
    status: 'deployment_in_progress',
    smoke: { status: 'not_run' },
  }
  assertReceiptCore(receipt)
  return receipt
}

function nextFunction(receipt) {
  return receipt.functions[receipt.deployments.length]
}

export function advanceDeploymentReceipt(receipt, transition) {
  assertReceiptCore(receipt)
  if (receipt.status !== 'deployment_in_progress') {
    throw new Error('Deployment receipt is not in progress')
  }
  const next = { ...baseReceiptFields(receipt), status: receipt.status, smoke: { status: 'not_run' } }

  if (transition.type === 'pre_state') {
    if (receipt.current !== null || transition.name !== nextFunction(receipt)) {
      throw new Error('Deployment transition is out of order')
    }
    if (transition.before === null && !receipt.allowCreate.includes(transition.name)) {
      throw new Error('Function create was not explicitly allowed')
    }
    next.current = {
      name: transition.name,
      stage: 'pre_deploy',
      before: sanitizeMetadata(transition.before),
    }
  } else if (transition.type === 'deploy_started' || transition.type === 'deploy_returned') {
    const expectedStage = transition.type === 'deploy_started' ? 'pre_deploy' : 'deploying'
    const nextStage = transition.type === 'deploy_started' ? 'deploying' : 'deployed_unverified'
    if (receipt.current?.name !== transition.name || receipt.current.stage !== expectedStage) {
      throw new Error('Deployment transition is out of order')
    }
    next.current = { ...next.current, stage: nextStage }
  } else if (transition.type === 'verified') {
    if (receipt.current?.name !== transition.name || receipt.current.stage !== 'deployed_unverified') {
      throw new Error('Deployment transition is out of order')
    }
    const source = sanitizeSourceProof(transition.source)
    const after = sanitizeMetadata(transition.after)
    assertArtifactMetadata(after)
    next.deployments = [
      ...next.deployments,
      { name: transition.name, before: next.current.before, after, source },
    ]
    next.current = null
  } else if (transition.type === 'ready_for_smoke') {
    if (receipt.current !== null || receipt.deployments.length !== receipt.functions.length) {
      throw new Error('Every ordered deployment must be verified before smoke')
    }
    next.status = 'smoke_pending'
    next.smoke = { status: 'pending' }
    next.finishedAt = transition.at
  } else {
    throw new Error('Unknown deployment transition')
  }

  next.updatedAt = transition.at
  return next
}

export function failDeploymentReceipt(receipt, failure) {
  assertReceiptCore(receipt)
  if (!SAFE_CODE.test(failure.stage)) throw new Error('A valid failure stage is required')
  if (!SAFE_CODE.test(failure.code)) throw new Error('A valid failure code is required')
  if (failure.functionName !== undefined) assertSafeId(failure.functionName, 'function name')
  const productionState = receipt.deployments.length > 0 || receipt.current?.stage === 'deploying'
    || receipt.current?.stage === 'deployed_unverified'
    ? 'changed_or_uncertain'
    : 'unchanged'
  const safeFailure = { stage: failure.stage, error: failure.code }
  if (failure.functionName !== undefined) safeFailure.function = failure.functionName
  return {
    ...baseReceiptFields({ ...receipt, updatedAt: failure.at }),
    status: 'failed',
    productionState,
    smoke: { status: 'not_run' },
    failure: safeFailure,
  }
}

function validateDeploymentsForCompletion(receipt) {
  if (receipt.current !== null || receipt.deployments.length !== receipt.functions.length) {
    throw new Error('Every ordered deployment must have verified evidence')
  }
  const names = receipt.deployments.map((deployment) => deployment.name)
  if (JSON.stringify(names) !== JSON.stringify(receipt.functions) || new Set(names).size !== names.length) {
    throw new Error('Deployment evidence order does not match the function list')
  }
  for (const deployment of receipt.deployments) {
    if (deployment.name !== deployment.after?.name) {
      throw new Error('Deployment evidence name is invalid')
    }
    assertArtifactMetadata(deployment.after)
    assertSourceProof(deployment.source)
    verifyPostDeploy({
      before: deployment.before,
      after: deployment.after,
      expectedVerifyJwt: deployment.after.verify_jwt,
      allowCreate: receipt.allowCreate.includes(deployment.name),
      allowUnchangedBundle: receipt.allowUnchangedBundle.includes(deployment.name),
    })
  }
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} schema is invalid`)
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} schema is invalid`)
  }
}

export function validateDeploymentReceiptForSmoke(receipt) {
  assertReceiptCore(receipt)
  if (receipt.status !== 'smoke_pending') throw new Error('Deployment receipt is not smoke-pending')
  assertExactKeys(receipt, [
    'schemaVersion',
    'projectRef',
    'reviewedSha',
    'reviewedTree',
    'snapshotSha256',
    'operator',
    'cliVersion',
    'functions',
    'smokeCheckId',
    'allowCreate',
    'allowUnchangedBundle',
    'recovery',
    'startedAt',
    'updatedAt',
    'finishedAt',
    'deployments',
    'current',
    'secretsRedacted',
    'responseBodiesRetained',
    'status',
    'smoke',
  ], 'Deployment receipt')
  assertExactKeys(receipt.recovery, ['strategy', 'recordId'], 'Recovery contract')
  assertExactKeys(receipt.smoke, ['status'], 'Smoke state')
  if (
    receipt.smoke.status !== 'pending'
    || receipt.current !== null
    || receipt.secretsRedacted !== true
    || receipt.responseBodiesRetained !== false
    || !GIT_SHA.test(receipt.reviewedSha)
    || !GIT_SHA.test(receipt.reviewedTree)
    || typeof receipt.startedAt !== 'string'
    || typeof receipt.updatedAt !== 'string'
    || typeof receipt.finishedAt !== 'string'
  ) throw new Error('Deployment receipt schema is invalid')
  for (const deployment of receipt.deployments) {
    assertExactKeys(deployment, ['name', 'before', 'after', 'source'], 'Deployment evidence')
    if (deployment.before !== null) {
      assertExactKeys(deployment.before, [
        'name', 'version', 'status', 'verify_jwt', 'updated_at', 'ezbr_sha256',
      ], 'Pre-deploy metadata')
    }
    assertExactKeys(deployment.after, [
      'name', 'version', 'status', 'verify_jwt', 'updated_at', 'ezbr_sha256',
    ], 'Post-deploy metadata')
    assertExactKeys(deployment.source, [
      'sha256', 'fileCount', 'entrypointVerified', 'stableMetadata',
    ], 'Source attribution')
  }
  validateDeploymentsForCompletion(receipt)
  return true
}

function sanitizeAssertions(assertions, expectedStatus) {
  if (!Array.isArray(assertions) || assertions.length === 0) {
    throw new Error('Machine smoke assertions are required')
  }
  const seen = new Set()
  const safe = assertions.map((assertion) => {
    assertSafeId(assertion.id, 'smoke assertion ID')
    if (seen.has(assertion.id)) throw new Error('Duplicate smoke assertion ID')
    seen.add(assertion.id)
    if (assertion.status !== 'passed' && assertion.status !== 'failed') {
      throw new Error('Invalid smoke assertion status')
    }
    const value = { id: assertion.id, status: assertion.status }
    if (assertion.httpStatus !== undefined) {
      if (!Number.isInteger(assertion.httpStatus) || assertion.httpStatus < 100 || assertion.httpStatus > 599) {
        throw new Error('Invalid smoke assertion HTTP status')
      }
      value.httpStatus = assertion.httpStatus
    }
    return value
  })
  if (expectedStatus === 'passed' && safe.some((assertion) => assertion.status !== 'passed')) {
    throw new Error('Passing smoke evidence contains a failed assertion')
  }
  if (expectedStatus === 'failed' && safe.every((assertion) => assertion.status === 'passed')) {
    throw new Error('Failed smoke evidence must contain a failed assertion')
  }
  return safe
}

export function completeDeploymentReceipt(receipt, evidence) {
  validateDeploymentReceiptForSmoke(receipt)
  if (evidence.machineProduced !== true) throw new Error('Machine-produced smoke evidence is required')
  if (evidence.status !== 'passed' && evidence.status !== 'failed') {
    throw new Error('Smoke evidence status must be passed or failed')
  }
  assertSafeId(evidence.checkId, 'smoke check ID')
  if (evidence.checkId !== receipt.smokeCheckId) {
    throw new Error('Smoke check ID does not match the deployment receipt')
  }
  if (evidence.reviewedSha !== receipt.reviewedSha) {
    throw new Error('Smoke evidence reviewed SHA does not match the deployment receipt')
  }
  if (JSON.stringify(evidence.functions) !== JSON.stringify(receipt.functions)) {
    throw new Error('Smoke evidence function list does not match the deployment receipt')
  }
  if (!Array.isArray(evidence.liveArtifacts) || evidence.liveArtifacts.length !== receipt.deployments.length) {
    throw new Error('Live deployment evidence is incomplete')
  }
  if (evidence.status === 'passed') {
    for (let index = 0; index < receipt.deployments.length; index += 1) {
      if (!metadataIdentityMatches(receipt.deployments[index].after, evidence.liveArtifacts[index])) {
        throw new Error('Live deployment artifact no longer matches the receipt')
      }
    }
  }
  const assertions = sanitizeAssertions(evidence.assertions, evidence.status)
  const base = baseReceiptFields({ ...receipt, updatedAt: evidence.completedAt })

  return {
    ...base,
    status: evidence.status === 'passed' ? 'complete' : 'smoke_failed',
    finishedAt: receipt.finishedAt,
    smoke: {
      status: evidence.status,
      checkId: evidence.checkId,
      completedAt: evidence.completedAt,
      assertions,
    },
  }
}
