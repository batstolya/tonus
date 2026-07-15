import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HISTORICAL_WARNING,
  findRawDeployInstructions,
} from './edge-deploy-docs-lib.mjs'

const scan = (path, content, options) => findRawDeployInstructions([{ path, content }], options)

test('rejects direct CLI deploy commands and JWT-mode override flags', () => {
  const findings = scan('docs/active-runbook.md', [
    '# Release',
    'npx supabase functions deploy chat-health --project-ref example',
    'Deploy ingest-health with --no-verify-jwt.',
  ].join('\n'))

  assert.deepEqual(findings, [
    { path: 'docs/active-runbook.md', line: 2, kind: 'raw_deploy_command' },
    { path: 'docs/active-runbook.md', line: 3, kind: 'jwt_mode_override' },
  ])
})

test('allows negative references in the canonical deployment guide only', () => {
  const safe = scan('docs/guides/edge-function-deployments.md', [
    'Raw `supabase functions deploy` examples are context, not release instructions.',
    'Do not add an operator JWT override such as `--no-verify-jwt`.',
  ].join('\n'))
  const unsafe = scan('docs/another-guide.md', [
    'Raw `supabase functions deploy` examples are context, not release instructions.',
    'Do not add an operator JWT override such as `--no-verify-jwt`.',
  ].join('\n'))

  assert.deepEqual(safe, [])
  assert.equal(unsafe.length, 2)
})

test('allows an explicitly listed historical document only with the archival warning', () => {
  const path = 'docs/superpowers/plans/old-plan.md'
  const content = `${HISTORICAL_WARNING}\n\nnpx supabase functions deploy chat-health`
  const options = { historicalAllowlist: new Set([path]) }

  assert.deepEqual(scan(path, content, options), [])
  assert.equal(scan(path, 'npx supabase functions deploy chat-health', options).length, 1)
  assert.equal(scan('docs/superpowers/plans/not-listed.md', content, options).length, 1)
})

test('allows immutable migration comments only through their explicit allowlist', () => {
  const path = 'supabase/migrations/20260101000000_old.sql'
  const options = { historicalAllowlist: new Set([path]) }

  assert.deepEqual(scan(path, '-- deploy with --no-verify-jwt', options), [])
  assert.equal(scan('supabase/migrations/20260102000000_new.sql', '-- deploy with --no-verify-jwt', options).length, 1)
})

test('ignores scanner implementation and test fixtures but scans other source files', () => {
  const content = 'const note = "--no-verify-jwt"'

  assert.deepEqual(scan('scripts/edge-deploy-docs-lib.mjs', content), [])
  assert.deepEqual(scan('scripts/example.test.mjs', content), [])
  assert.equal(scan('scripts/release-helper.mjs', content).length, 1)
})
