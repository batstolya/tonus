// Ratchet: every outbound fetch in Edge Functions must use _shared/http.ts.
// Files listed below still contain raw fetch calls; migrate a file, then
// REMOVE it from the list. Adding new raw fetch anywhere fails this test.
import { test } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'

const ALLOWLIST = new Set([
  'supabase/functions/_shared/observability.ts',
  'supabase/functions/fetch-environment/index.ts',
  'supabase/functions/send-football-reminders/index.ts',
  'supabase/functions/send-reminders/index.ts',
  'supabase/functions/sync-cal/index.ts',
  'supabase/functions/sync-football-fixtures/index.ts',
  'supabase/functions/telegram-bot/index.ts',
])

const grep = () => {
  try {
    return execSync(
      String.raw`grep -rln --include='*.ts' -E '(^|[^.\w])fetch\(' supabase/functions | grep -v '\.test\.' | grep -v '_shared/http\.ts'`,
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

test('raw fetch in edge functions only where allowlisted', () => {
  const offenders = grep()
  const newRaw = offenders.filter((f) => !ALLOWLIST.has(f))
  assert.deepEqual(newRaw, [], `raw fetch outside allowlist (use _shared/http.ts): ${newRaw.join(', ')}`)
  const stale = [...ALLOWLIST].filter((f) => !offenders.includes(f))
  assert.deepEqual(stale, [], `allowlist entries now clean — remove them: ${stale.join(', ')}`)
})
