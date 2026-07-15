import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { findRawDeployInstructions } from './edge-deploy-docs-lib.mjs'

const TEXT_EXTENSIONS = new Set([
  '.cjs', '.js', '.json', '.md', '.mjs', '.sh', '.sql', '.toml', '.ts', '.tsx', '.yaml', '.yml',
])

const paths = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})
  .split('\0')
  .filter(Boolean)
  .filter((path) => TEXT_EXTENSIONS.has(extname(path)))

const files = paths.map((path) => ({ path, content: readFileSync(path, 'utf8') }))
const findings = findRawDeployInstructions(files)

if (findings.length > 0) {
  for (const finding of findings) {
    const message = finding.kind === 'raw_deploy_command'
      ? 'Use the canonical Edge Function deployment wrapper instead of a raw CLI deploy command.'
      : 'JWT mode must come from supabase/config.toml; do not document an operator override flag.'
    console.error(`::error file=${finding.path},line=${finding.line}::${message}`)
  }
  console.error(`${findings.length} unsafe Edge Function deployment instruction(s) found.`)
  process.exit(1)
}

console.log('Edge Function deployment documentation guard passed.')
