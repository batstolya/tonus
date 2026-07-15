import { execFileSync } from 'node:child_process'
import { globSync } from 'node:fs'

const entrypoints = globSync('supabase/functions/*/index.ts').sort()
if (entrypoints.length === 0) {
  console.error('::error::no Edge Function entrypoints found')
  process.exit(1)
}

try {
  execFileSync(
    'deno',
    [
      'cache',
      '--no-config',
      '--lock', 'deno.lock',
      '--frozen',
      '--node-modules-dir=none',
      ...entrypoints,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
      maxBuffer: 64 * 1024 * 1024,
    },
  )
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
  if (output) console.error(output.trim())
  console.error('::error::Edge Function dependency graph is not fully frozen in deno.lock')
  process.exit(1)
}

console.log(`Edge Function dependency lock covers ${entrypoints.length} entrypoints.`)
