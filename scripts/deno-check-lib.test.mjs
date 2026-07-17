import test from 'node:test'
import assert from 'node:assert/strict'
import { denoCheckTargets } from './deno-check-lib.mjs'

test('excludes vitest-run test files, keeps shipped modules', () => {
  const files = [
    'supabase/functions/_shared/football.ts',
    'supabase/functions/_shared/football.test.ts',
    'supabase/functions/telegram-bot/index.ts',
    'supabase/functions/telegram-bot/router.test.ts',
  ]
  assert.deepEqual(denoCheckTargets(files), [
    'supabase/functions/_shared/football.ts',
    'supabase/functions/telegram-bot/index.ts',
  ])
})

test('refuses to silently check nothing', () => {
  assert.deepEqual(denoCheckTargets(['a.test.ts']), [])
})
