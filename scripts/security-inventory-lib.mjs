import ts from 'typescript'

function propertyName(member) {
  const name = member?.name
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : null
}

function propertyType(node, expectedName) {
  return node?.members?.find(member => propertyName(member) === expectedName)?.type
}

function objectMembers(node, label) {
  if (!node || !ts.isTypeLiteralNode(node)) throw new Error(`missing type section: ${label}`)
  return node.members
}

export function discoverDatabaseSurfaces(source) {
  const file = ts.createSourceFile('database.types.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const database = file.statements.find(statement =>
    ts.isTypeAliasDeclaration(statement) && statement.name.text === 'Database')
  if (!database) throw new Error('missing Database type alias')
  const publicSchema = propertyType(database.type, 'public')
  if (!publicSchema) throw new Error('missing public schema')

  const relationRows = section => objectMembers(propertyType(publicSchema, section), `public.${section}`)
    .map(member => {
      const name = propertyName(member)
      if (!name) throw new Error(`unnamed ${section} surface`)
      const row = propertyType(member.type, 'Row')
      const columns = row && ts.isTypeLiteralNode(row)
        ? row.members.map(propertyName).filter(Boolean).sort()
        : []
      return { name, columns }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const rpcs = objectMembers(propertyType(publicSchema, 'Functions'), 'public.Functions')
    .map(member => ({ name: propertyName(member) }))
    .filter(row => row.name)
    .sort((a, b) => a.name.localeCompare(b.name))

  return { tables: relationRows('Tables'), views: relationRows('Views'), rpcs }
}

export function discoverEdgeFunctions(functionNames, configText, sourceByName = {}) {
  const explicitModes = new Map()
  let currentFunction = null
  for (const line of configText.split(/\r?\n/)) {
    const section = line.match(/^\[functions\.([^\]]+)\]\s*$/)
    if (section) {
      currentFunction = section[1]
      continue
    }
    if (line.startsWith('[')) currentFunction = null
    const mode = line.match(/^verify_jwt\s*=\s*(true|false)/)
    if (currentFunction && mode) explicitModes.set(currentFunction, mode[1] === 'true')
  }
  return [...functionNames]
    .sort((a, b) => a.localeCompare(b))
    .map(name => {
      const source = sourceByName[name] ?? ''
      const hasCors = source.includes('Access-Control-Allow-Origin')
      const cors = /\bcorsHeadersFor\s*\(/.test(source)
        ? 'allowlist'
        : !hasCors
          ? 'none'
          : /Access-Control-Allow-Origin['"]?\s*[:=]\s*['"]\*['"]/.test(source) ? 'wildcard' : 'restricted'
      const budget = /\bcheckBudget\s*\(/.test(source)
      const durable = /\bconsumeRateLimit\s*\(/.test(source)
      return {
        name,
        verifyJwt: explicitModes.get(name) ?? true,
        cors,
        rateLimit: budget && durable ? 'ai-budget+durable' : durable ? 'durable' : budget ? 'ai-budget' : 'none',
      }
    })
}

function exactCoverage(discoveredNames, classifiedNames, label) {
  const discovered = new Set(discoveredNames)
  const classified = new Set(classifiedNames)
  for (const name of [...discovered].sort()) {
    if (!classified.has(name)) throw new Error(`missing ${label} classification: ${name}`)
  }
  for (const name of [...classified].sort()) {
    if (!discovered.has(name)) throw new Error(`stale ${label} classification: ${name}`)
  }
}

function classifiedMap(rows, classification, label) {
  exactCoverage(rows.map(row => row.name), Object.keys(classification), label)
  return rows.map(row => ({ name: row.name, ...classification[row.name] }))
}

export function findServiceRpcPermissionFindings(rpcs, migrationSql, remediationByName = {}) {
  const normalizedSql = migrationSql.toLowerCase().replace(/\s+/g, ' ')
  return rpcs
    .filter(rpc => rpc.authOwner === 'service-role')
    .filter(rpc => {
      const signature = String(rpc.signature ?? '').toLowerCase().replace(/\s+/g, ' ')
      if (!signature) throw new Error(`missing RPC signature classification: ${rpc.name}`)
      const revoke = `revoke all on function ${signature} from public, anon, authenticated`
      const schemaQualifiedRevoke = `revoke all on function public.${signature} from public, anon, authenticated`
      return !normalizedSql.includes(revoke) && !normalizedSql.includes(schemaQualifiedRevoke)
    })
    .map(rpc => ({
      id: `SEC-RPC-PUBLIC-EXECUTE-${rpc.name}`,
      severity: 'high',
      surface: `rpc:${rpc.name}`,
      summary: 'Service-only SECURITY DEFINER RPC lacks an explicit PUBLIC/anon/authenticated revoke',
      remediation: remediationByName[rpc.name] ?? 'unassigned',
    }))
}

export function validateFindingRemediations(findings, remediationByName = {}) {
  for (const finding of findings) {
    if (finding.severity === 'high' && finding.remediation === 'unassigned') {
      throw new Error(`unassigned high finding: ${finding.id}`)
    }
  }
  const activeRpcNames = new Set(findings
    .filter(finding => finding.surface.startsWith('rpc:'))
    .map(finding => finding.surface.slice('rpc:'.length)))
  for (const name of Object.keys(remediationByName)) {
    if (!activeRpcNames.has(name)) throw new Error(`stale RPC remediation: ${name}`)
  }
}

export function buildSecurityInventory(discovered, classification) {
  if (classification.version !== 1) throw new Error('unsupported classification version')

  const tableRules = classification.tables ?? {}
  const publicReference = new Set(tableRules.publicReference ?? [])
  const serviceOnly = new Set(tableRules.serviceOnly ?? [])
  const credentialTables = new Set(tableRules.credentialTables ?? [])
  const ownerOverrides = tableRules.ownerColumnOverrides ?? {}
  const allTableRuleNames = [
    ...publicReference, ...serviceOnly, ...credentialTables, ...Object.keys(ownerOverrides),
  ]
  for (const name of allTableRuleNames) {
    if (!discovered.tables.some(table => table.name === name)) {
      throw new Error(`stale table classification: ${name}`)
    }
  }

  const tables = discovered.tables.map(table => {
    if (publicReference.has(table.name)) {
      return {
        name: table.name, ownerColumn: null, authOwner: 'public-read/service-write',
        dataSensitivity: 'public', exposure: 'public-reference',
      }
    }
    if (serviceOnly.has(table.name)) {
      return {
        name: table.name, ownerColumn: null, authOwner: 'service-role',
        dataSensitivity: 'internal', exposure: 'service-only',
      }
    }
    const ownerColumn = ownerOverrides[table.name] ?? (table.columns.includes('user_id') ? 'user_id' : null)
    if (!ownerColumn) throw new Error(`missing table classification: ${table.name}`)
    return {
      name: table.name,
      ownerColumn,
      authOwner: `rls:${ownerColumn}`,
      dataSensitivity: credentialTables.has(table.name) ? 'credential' : 'health',
      exposure: 'user-owned',
    }
  })

  const views = classifiedMap(discovered.views, classification.views ?? {}, 'view')
  const rpcs = classifiedMap(discovered.rpcs, classification.rpcs ?? {}, 'RPC')
  const edgeFunctions = classifiedMap(discovered.edgeFunctions, classification.edgeFunctions ?? {}, 'edge function')
    .map((surface, index) => {
      const discoveredSurface = discovered.edgeFunctions[index]
      const verifyJwt = discoveredSurface.verifyJwt
      if (!verifyJwt && !String(surface.authOwner).startsWith('handler:')) {
        throw new Error(`verify_jwt=false function lacks handler auth owner: ${surface.name}`)
      }
      for (const field of ['cors', 'rateLimit']) {
        if (surface[field] !== discoveredSurface[field]) {
          throw new Error(`stale edge function ${field}: ${surface.name} expected ${discoveredSurface[field]}`)
        }
      }
      return { ...surface, verifyJwt, cors: discoveredSurface.cors, rateLimit: discoveredSurface.rateLimit }
    })
  const buckets = Object.entries(classification.buckets ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, metadata]) => ({ name, ...metadata }))

  return {
    version: 1,
    sources: ['packages/shared/src/database.types.ts', 'supabase/config.toml', 'supabase/functions/', 'security/inventory-classification.json'],
    counts: {
      tables: tables.length,
      views: views.length,
      rpcs: rpcs.length,
      buckets: buckets.length,
      edgeFunctions: edgeFunctions.length,
    },
    surfaces: { tables, views, rpcs, buckets, edgeFunctions },
  }
}
