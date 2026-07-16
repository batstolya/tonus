import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationPath = 'supabase/migrations/20260716005000_restrict_football_rpc_execute.sql'
const signatures = [
  'generate_football_reminders\\(\\)',
  'claim_due_football_reminders\\(\\)',
  'mark_football_reminder_sent\\(uuid,\\s*bigint\\)',
  'mark_football_reminder_failed\\(uuid,\\s*text\\)',
]

test('football SECURITY DEFINER RPCs are executable only by service_role', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  for (const signature of signatures) {
    assert.match(sql, new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+public\\.${signature}\\s+from\\s+public,\\s*anon,\\s*authenticated`,
      'i',
    ))
    assert.match(sql, new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${signature}\\s+to\\s+service_role`,
      'i',
    ))
  }
})
