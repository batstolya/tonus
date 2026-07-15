export const HISTORICAL_WARNING = '> [!CAUTION]\n> Historical execution record. Do not run deployment commands from this file.\n> Use `docs/guides/edge-function-deployments.md` and `npm run deploy:functions`.'

export const HISTORICAL_DEPLOY_ALLOWLIST = new Set([
  'docs/superpowers/plans/2026-06-20-cal-auto-sync.md',
  'docs/superpowers/plans/2026-06-20-meal-ai-web.md',
  'docs/superpowers/plans/2026-06-21-environment-correlations.md',
  'docs/superpowers/plans/2026-06-21-levers-wellbeing.md',
  'docs/superpowers/plans/2026-06-26-repo-tidy.md',
  'docs/superpowers/plans/2026-07-06-ai-chat-context-completeness.md',
  'docs/superpowers/plans/2026-07-06-connect-guide.md',
  'docs/superpowers/plans/2026-07-08-chat-debug-reason.md',
  'docs/superpowers/plans/2026-07-10-security-boundaries.md',
  'docs/superpowers/plans/2026-07-11-workout-schedule.md',
  'docs/superpowers/plans/2026-07-12-readiness-forecast.md',
  'docs/superpowers/specs/2026-06-26-repo-tidy-design.md',
  'docs/superpowers/specs/2026-06-28-supplement-schedule-design.md',
  'docs/superpowers/specs/2026-07-05-smart-tonus-design.md',
  'docs/superpowers/specs/2026-07-08-chat-debug-reason-design.md',
  'docs/superpowers/specs/2026-07-11-kp-index-design.md',
  'supabase/migrations/20260704200000_football_reminders.sql',
  'supabase/migrations/20260705220000_health_alerts_anomaly.sql',
  'supabase/migrations/20260706000000_widget_tokens.sql',
])

const CANONICAL_SAFE_CONTEXT_PATHS = new Set([
  'docs/guides/edge-function-deployments.md',
  'docs/guides/security-secrets-runbook.md',
])

const RAW_DEPLOY_COMMAND = /\b(?:npx(?:\s+--yes)?\s+)?supabase(?:@[^\s`'"]+)?\s+functions\s+deploy\b/i
const JWT_MODE_OVERRIDE = /--no-verify-jwt\b/i

function ignoredSourcePath(path) {
  return path === 'scripts/edge-deploy-docs-lib.mjs'
    || /(?:^|\/)\w[^/]*\.test\.[cm]?[jt]s$/.test(path)
}

function isAllowedHistoricalFile(path, content, historicalAllowlist) {
  if (!historicalAllowlist.has(path)) return false
  if (path.startsWith('supabase/migrations/')) return true
  return content.includes(HISTORICAL_WARNING)
}

function isCanonicalNegativeReference(path, lines, index) {
  if (!CANONICAL_SAFE_CONTEXT_PATHS.has(path)) return false
  const context = lines.slice(Math.max(0, index - 1), index + 2).join(' ')
  return /\bdo not\b|\bnever\b|not release instructions/i.test(context)
}

export function findRawDeployInstructions(
  files,
  { historicalAllowlist = HISTORICAL_DEPLOY_ALLOWLIST } = {},
) {
  const findings = []

  for (const { path, content: input } of files) {
    if (ignoredSourcePath(path)) continue
    const content = String(input)
    if (isAllowedHistoricalFile(path, content, historicalAllowlist)) continue

    const lines = content.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (isCanonicalNegativeReference(path, lines, index)) return
      if (RAW_DEPLOY_COMMAND.test(line)) {
        findings.push({ path, line: index + 1, kind: 'raw_deploy_command' })
      }
      if (JWT_MODE_OVERRIDE.test(line)) {
        findings.push({ path, line: index + 1, kind: 'jwt_mode_override' })
      }
    })
  }

  return findings
}
