import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const criticalHandlers = [
  ['ingest-health', 'edge.ingest_health'],
  ['send-reminders', 'edge.send_reminders'],
  ['telegram-bot', 'edge.telegram_bot'],
] as const

describe('observability inventory', () => {
  it.each(criticalHandlers)('%s uses the shared correlated failure wrapper', (directory, operation) => {
    const source = readFileSync(`supabase/functions/${directory}/index.ts`, 'utf8')

    expect(source).toContain("import { withObservability } from '../_shared/observability.ts'")
    expect(source).toContain(`serve(withObservability('${operation}', handler))`)
    expect(source.match(/withObservability\(/g)).toHaveLength(1)
  })

  it('keeps the client reporter behind both gateway and handler authentication', () => {
    const config = readFileSync('supabase/config.toml', 'utf8')
    const source = readFileSync('supabase/functions/report-client-error/index.ts', 'utf8')

    expect(config).toMatch(/\[functions\.report-client-error\]\s+verify_jwt = true/)
    expect(source).toContain('authClient.auth.getUser()')
    expect(source.indexOf('authClient.auth.getUser()')).toBeLessThan(source.indexOf('req.json()'))
    expect(source).toContain('payload.environment !== TONUS_ENVIRONMENT')
    expect(source).toContain('payload.release !== TONUS_RELEASE_SHA')
    expect(source.indexOf('payload.release !== TONUS_RELEASE_SHA')).toBeLessThan(
      source.indexOf('captureClientReportedFailure(payload)'),
    )
  })

  it('propagates one request ID from the browser call into its failure report', () => {
    const source = readFileSync('src/lib/edgeFunctions.ts', 'utf8')

    expect(source).toContain("'x-request-id': requestId")
    expect(source).toContain("captureClientFailure('web.edge_function_failure', 'edge_request_failed', requestId)")
  })

  it('provides no storage columns for arbitrary or identifying payloads', () => {
    const migration = readFileSync(
      'supabase/migrations/20260716020000_observability_events.sql',
      'utf8',
    )
    const tableDefinition = migration.slice(
      migration.indexOf('create table'),
      migration.indexOf(');') + 2,
    )

    for (const prohibitedColumn of [
      'user_id', 'email', 'telegram', 'message', 'stack', 'body',
      'prompt', 'health', 'lab', 'medication', 'token',
    ]) {
      expect(tableDefinition).not.toMatch(new RegExp(`\\b${prohibitedColumn}\\b`))
    }
  })
})
