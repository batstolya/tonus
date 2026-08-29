import { readFile } from 'node:fs/promises'
import { simulateVitalPortIngest } from './simulate-vitalport-ingest-core.ts'

const SIMULATION_USER = '00000000-0000-0000-0000-000000000001'

async function main() {
  const [fixturePath, timezone] = process.argv.slice(2)
  if (!fixturePath || !timezone) throw new Error('Usage: vite-node scripts/simulate-vitalport-ingest.ts <fixture.json> <timezone>')

  const payload: unknown = JSON.parse(await readFile(fixturePath, 'utf8'))
  console.log(JSON.stringify(simulateVitalPortIngest(payload, SIMULATION_USER, timezone), null, 2))
}

await main()
