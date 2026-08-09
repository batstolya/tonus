import { readFile } from 'node:fs/promises'
import { parseHAE } from '../supabase/functions/_shared/hae.ts'
import { normalizeHealthPayload } from '../supabase/functions/ingest-health/normalize.ts'

const SIMULATION_USER = '00000000-0000-0000-0000-000000000001'

export function simulateVitalPortIngest(payload: unknown, userId: string, timezone: string) {
  return parseHAE(userId, normalizeHealthPayload(payload, timezone))
}

async function main() {
  const [fixturePath, timezone] = process.argv.slice(2)
  if (!fixturePath || !timezone) throw new Error('Usage: vite-node scripts/simulate-vitalport-ingest.ts <fixture.json> <timezone>')

  const payload: unknown = JSON.parse(await readFile(fixturePath, 'utf8'))
  console.log(JSON.stringify(simulateVitalPortIngest(payload, SIMULATION_USER, timezone), null, 2))
}

// vite-node executes the file but leaves only the arguments after its filename
// in process.argv, so a Node-style import.meta.url/argv[1] entrypoint check
// cannot identify this invocation.
if (process.argv[2]?.endsWith('.json')) {
  await main()
}
