import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import {
  buildSecurityInventory,
  discoverDatabaseSurfaces,
  discoverEdgeFunctions,
  findServiceRpcPermissionFindings,
  validateFindingRemediations,
} from './security-inventory-lib.mjs'

export function generateSecurityInventory() {
  const databaseTypes = readFileSync('src/lib/database.types.ts', 'utf8')
  const config = readFileSync('supabase/config.toml', 'utf8')
  const classification = JSON.parse(readFileSync('security/inventory-classification.json', 'utf8'))
  const functionNames = readdirSync('supabase/functions', { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== '_shared')
    .map(entry => entry.name)
  const functionSources = Object.fromEntries(functionNames.map(name => [
    name,
    readFileSync(`supabase/functions/${name}/index.ts`, 'utf8'),
  ]))
  const inventory = buildSecurityInventory({
    ...discoverDatabaseSurfaces(databaseTypes),
    edgeFunctions: discoverEdgeFunctions(functionNames, config, functionSources),
  }, classification)
  const migrationSql = readdirSync('supabase/migrations')
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(name => readFileSync(`supabase/migrations/${name}`, 'utf8'))
    .join('\n')
  const findings = findServiceRpcPermissionFindings(
    inventory.surfaces.rpcs,
    migrationSql,
    classification.rpcRemediations,
  )
  validateFindingRemediations(findings, classification.rpcRemediations)
  return {
    ...inventory,
    findings,
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const output = `${JSON.stringify(generateSecurityInventory(), null, 2)}\n`
  writeFileSync('security/inventory.generated.json', output)
  console.log('wrote security/inventory.generated.json')
}
