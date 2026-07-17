// Zero-tolerance deno type check of edge-function code. Successor of the
// deno-check-ceiling ratchet: the debt is 0, so any error fails CI outright.
// Scope: shipped modules only — *.test.ts run under vitest, not Deno
// (see deno-check-lib.mjs).
import { execFileSync } from 'node:child_process'
import { globSync } from 'node:fs'
import { denoCheckTargets } from './deno-check-lib.mjs'

const files = denoCheckTargets(globSync('supabase/functions/**/*.ts'))
if (files.length === 0) {
  console.error('::error::no deno check targets matched supabase/functions/**/*.ts')
  process.exit(1)
}

try {
  execFileSync('deno', ['check', ...files], {
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })
} catch {
  console.error("::error::deno type errors in edge functions — run 'npm run check:functions' and fix them")
  process.exit(1)
}

console.log(`deno check clean: ${files.length} files, 0 errors`)
