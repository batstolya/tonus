import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { parseAddedLines, offendingMessages } from './lint-diff-lib.mjs'

// Base ref: the PR target on CI, else CLI arg, else local `main`.
const base = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : (process.argv[2] || 'main')

const diff = execSync(`git diff --unified=0 ${base}...HEAD -- '*.ts' '*.tsx'`, {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
const added = parseAddedLines(diff)
const files = [...added.keys()].filter((f) => existsSync(f))

if (files.length === 0) {
  console.log('lint:diff — no changed .ts/.tsx lines')
  process.exit(0)
}

let out
try {
  out = execSync(`npx eslint ${files.map((f) => `'${f}'`).join(' ')} -f json`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
} catch (e) {
  out = e.stdout
}

const offending = offendingMessages(JSON.parse(out), added)
if (offending.length) {
  for (const o of offending) {
    console.error(`::error file=${o.file},line=${o.line}::${o.ruleId}: ${o.message}`)
  }
  console.error(`\n${offending.length} new lint error(s) on changed lines. Fix before merge.`)
  process.exit(1)
}
console.log('lint:diff — no new lint errors on changed lines')
