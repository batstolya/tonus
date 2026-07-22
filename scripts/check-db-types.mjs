// Drift guard for packages/shared/src/database.types.ts.
// Regenerates types from the linked Supabase project and fails if the committed
// file is out of date — i.e. a migration landed without running `npm run gen:types`.
//
// Requires Supabase CLI auth (Keychain locally, or SUPABASE_ACCESS_TOKEN in CI).
// If the CLI cannot reach the project, this exits 0 with a warning rather than a
// hard failure, so the check never blocks environments without DB access.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const COMMITTED = 'packages/shared/src/database.types.ts'

// Локально проект залинкован (Keychain) → --linked. В CI линка нет
// (supabase/.temp в gitignore), но есть SUPABASE_ACCESS_TOKEN → адресуем проект
// по ref из config.toml (ref не секрет). Без токена остаёмся на --linked и
// gracefully пропускаем ниже.
function targetFlag() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) return '--linked'
  const cfg = readFileSync('supabase/config.toml', 'utf8')
  const ref = cfg.match(/project_id\s*=\s*"([^"]+)"/)?.[1]
  return ref ? `--project-id ${ref}` : '--linked'
}

let fresh
try {
  fresh = execSync(`npx --yes supabase gen types typescript ${targetFlag()} --schema public`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (e) {
  console.warn(`::warning::gen:types:check skipped — could not reach Supabase (${e.message.split('\n')[0]})`)
  process.exit(0)
}

const committed = readFileSync(COMMITTED, 'utf8')
if (fresh.trim() !== committed.trim()) {
  console.error(`::error::${COMMITTED} is out of date. Run 'npm run gen:types' and commit the result.`)
  process.exit(1)
}
console.log(`${COMMITTED} is in sync with the linked schema.`)
