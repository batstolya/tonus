import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { decideCeiling } from './lint-ceiling-lib.mjs'

const ceiling = Number(readFileSync(new URL('../.lint-ceiling', import.meta.url), 'utf8').trim())

// eslint exits non-zero when it reports errors, so capture stdout from the throw.
let out
try {
  out = execSync('npx eslint . -f json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
} catch (e) {
  out = e.stdout
}
const count = JSON.parse(out).reduce((sum, r) => sum + r.errorCount, 0)

const { ok, message } = decideCeiling(count, ceiling)
if (!ok) {
  console.error(`::error::${message}`)
  process.exit(1)
}
console.log(message)
