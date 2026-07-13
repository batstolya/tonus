import { execFileSync } from 'node:child_process'
import { readFileSync, globSync } from 'node:fs'
import { decideCeiling } from './lint-ceiling-lib.mjs'

const ceiling = Number(readFileSync(new URL('../.deno-check-ceiling', import.meta.url), 'utf8').trim())

const files = globSync('supabase/functions/**/*.ts').sort()
if (files.length === 0) {
  console.error('::error::no files matched supabase/functions/**/*.ts')
  process.exit(1)
}

// deno check exits non-zero and prints "Found N errors." when the count is
// non-zero; a clean run exits 0 without the summary line.
let count = 0
try {
  execFileSync('deno', ['check', ...files], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })
} catch (e) {
  const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  const m = out.match(/Found (\d+) errors?\./)
  if (!m) {
    console.error(out)
    console.error('::error::deno check failed without an error count — deno crashed or is not installed')
    process.exit(1)
  }
  count = Number(m[1])
}

const { ok, message } = decideCeiling(count, ceiling, {
  label: 'deno type errors',
  file: '.deno-check-ceiling',
  hint: "run 'npm run check:functions' and fix the new ones",
})
if (!ok) {
  console.error(`::error::${message}`)
  process.exit(1)
}
console.log(message)
