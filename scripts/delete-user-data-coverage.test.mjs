import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

// Beta-safety PR 6: the delete_user_data RPC must cover every user-owned table
// from the generated security inventory. A new user-owned table fails here
// until a migration extends the RPC — the deletion list lives in reviewed SQL,
// never in UI code.

const inventory = JSON.parse(readFileSync('security/inventory.generated.json', 'utf8'))
const userOwnedTables = inventory.surfaces.tables
  .filter(table => table.exposure === 'user-owned')
  .map(table => table.name)

const rpcMigrations = readdirSync('supabase/migrations')
  .filter(file => file.endsWith('.sql'))
  .map(file => readFileSync(`supabase/migrations/${file}`, 'utf8'))
  .filter(sql => /create or replace function public\.delete_user_data/i.test(sql))

test('a migration defines the delete_user_data RPC with service-only execute', () => {
  assert.ok(rpcMigrations.length >= 1, 'no migration defines public.delete_user_data')
  const sql = rpcMigrations.join('\n')
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.delete_user_data\(uuid\)\s+from\s+public,\s*anon,\s*authenticated/i)
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.delete_user_data\(uuid\)\s+to\s+service_role/i)
})

test('delete_user_data covers every user-owned inventory table', () => {
  assert.ok(userOwnedTables.length > 0, 'inventory lists no user-owned tables')
  const sql = rpcMigrations.join('\n').toLowerCase()
  const missing = userOwnedTables.filter(name => {
    const ownerColumn = name === 'profiles' ? 'id' : 'user_id'
    const pattern = new RegExp(`delete\\s+from\\s+(?:public\\.)?${name}\\s+where\\s+${ownerColumn}\\s*=\\s*p_user_id`, 'i')
    return !pattern.test(sql)
  })
  assert.deepEqual(missing, [], `user-owned tables missing from delete_user_data: ${missing.join(', ')}`)
})
