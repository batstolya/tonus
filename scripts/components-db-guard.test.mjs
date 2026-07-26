// Guard: components must not query the DB directly — use apps/web/src/lib/api/*
// (or apps/web/src/lib/*) modules. The allowlist emptied with B2 and must stay
// empty forever: any `.from('table')` call in apps/web/src/components fails
// here — put the query in an apps/web/src/lib/api/* module.
import { test } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'

const ALLOWLIST = new Set([])

const grep = () => {
  try {
    return execSync(
      String.raw`grep -rln --include='*.ts' --include='*.tsx' -E "\.from\(['\"]" apps/web/src/components | grep -v '\.test\.'`,
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

test('direct DB queries in components only where allowlisted', () => {
  const offenders = grep()
  const fresh = offenders.filter((f) => !ALLOWLIST.has(f))
  assert.deepEqual(fresh, [], `direct .from() outside allowlist (move to apps/web/src/lib/api/*): ${fresh.join(', ')}`)
  const stale = [...ALLOWLIST].filter((f) => !offenders.includes(f))
  assert.deepEqual(stale, [], `allowlist entries now clean — remove them: ${stale.join(', ')}`)
})
