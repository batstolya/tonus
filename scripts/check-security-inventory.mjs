import { readFileSync } from 'node:fs'
import { generateSecurityInventory } from './generate-security-inventory.mjs'

const expected = `${JSON.stringify(generateSecurityInventory(), null, 2)}\n`
const actual = readFileSync('security/inventory.generated.json', 'utf8')
if (actual !== expected) {
  console.error('security inventory drifted; run npm run security:inventory:generate and review the classification')
  process.exit(1)
}
const parsed = JSON.parse(actual)
console.log(`security inventory in sync: ${Object.values(parsed.counts).reduce((sum, count) => sum + count, 0)} surfaces`)
