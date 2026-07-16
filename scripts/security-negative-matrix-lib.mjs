export function assertIsolatedTarget(targetUrl, productionProjectRef) {
  const url = new URL(targetUrl)
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return
  const match = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i)
  if (!match) throw new Error(`unsupported Supabase target host: ${url.hostname}`)
  if (match[1] === productionProjectRef) {
    throw new Error(`refusing production project: ${productionProjectRef}`)
  }
}

export function buildRelationReadTargets(inventory) {
  return [
    ...inventory.surfaces.tables.map(surface => ({ kind: 'table', ...surface })),
    ...inventory.surfaces.views.map(surface => ({ kind: 'view', ...surface })),
  ]
    .filter(surface => surface.exposure !== 'public-reference')
    .map(({ kind, name, exposure, ownerColumn }) => ({ kind, name, exposure, ownerColumn: ownerColumn ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind))
}

export function assertReadOutcome(status, rows, expectVisible, label) {
  if (expectVisible) {
    if (status !== 200 || !Array.isArray(rows) || rows.length === 0) {
      throw new Error(`${label} positive control returned no row`)
    }
    return
  }
  if (status === 401 || status === 403) return
  if (status !== 200) throw new Error(`${label} returned unexpected status ${status}`)
  if (!Array.isArray(rows) || rows.length !== 0) throw new Error(`${label} exposed a protected row`)
}

function invalidCredential(credentialType) {
  switch (credentialType) {
    case 'cron-secret':
      return { headers: { 'x-cron-secret': 'invalid' }, query: '' }
    case 'user-jwt-or-cron-secret':
      return { headers: { authorization: 'Bearer invalid', 'x-cron-secret': 'invalid' }, query: '' }
    case 'user-or-service-role':
      return { headers: { authorization: 'Bearer invalid' }, query: '' }
    case 'ingest-token':
      return { headers: {}, query: '?token=invalid' }
    case 'widget-token':
      return { headers: {}, query: '?token=invalid' }
    case 'admin-secret':
      return { headers: { 'x-admin-secret': 'invalid' }, query: '' }
    case 'telegram-webhook-secret':
      return { headers: { 'x-telegram-bot-api-secret-token': 'invalid' }, query: '' }
    default:
      throw new Error(`unmapped custom credential type: ${credentialType}`)
  }
}

export function buildCredentialProbes(functions) {
  return functions
    .filter(surface => surface.verifyJwt === false)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(surface => {
      const invalid = invalidCredential(surface.credentialType)
      return [
        { functionName: surface.name, variant: 'missing', headers: {}, query: '' },
        { functionName: surface.name, variant: 'invalid', ...invalid },
      ]
    })
}
