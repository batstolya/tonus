import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Beta-safety PR 6: export must read only user-owned surfaces. Service-only
// tables (internal secrets/telemetry) must never appear in the export source.

describe('export table inventory', () => {
  const source = readFileSync('src/lib/exportData.ts', 'utf8')
  const inventory = JSON.parse(readFileSync('security/inventory.generated.json', 'utf8')) as {
    surfaces: { tables: Array<{ name: string; exposure: string }>; views: Array<{ name: string }> }
  }
  const queried = [...source.matchAll(/from\('([a-z_]+)'\)/g)].map(m => m[1])

  it('queries at least the core user tables', () => {
    expect(queried.length).toBeGreaterThan(3)
  })

  it('touches only user-owned tables and views, never service-only ones', () => {
    const allowed = new Set([
      ...inventory.surfaces.tables.filter(t => t.exposure === 'user-owned').map(t => t.name),
      ...inventory.surfaces.views.map(v => v.name),
    ])
    const offenders = queried.filter(name => !allowed.has(name))
    expect(offenders).toEqual([])
  })
})
