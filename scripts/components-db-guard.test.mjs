// Guard: components must not query the DB directly — use src/lib/api/* (or src/lib/*) modules.
// Ratchet: the allowlist below may only shrink. New `.from('table')` calls in
// src/components fail here; migrated files must be removed from the allowlist.
import { test } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'

const ALLOWLIST = new Set([
  'src/components/dashboard/HealthAlertBanner.tsx',
  'src/components/dashboard/NotificationBell.tsx',
  'src/components/dashboard/WorkoutPlanCard.tsx',
  'src/components/insights/CorrelationsBlock.tsx',
  'src/components/intake/QuickLog.tsx',
  'src/components/nutrition/MealLogger.tsx',
  'src/components/nutrition/NutritionScreen.tsx',
  'src/components/research/ExperimentsScreen.tsx',
  'src/components/supplements/AdherenceBlock.tsx',
  'src/components/supplements/TreatmentTracker.tsx',
])

const grep = () => {
  try {
    return execSync(
      String.raw`grep -rln --include='*.ts' --include='*.tsx' -E "\.from\(['\"]" src/components | grep -v '\.test\.'`,
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

test('direct DB queries in components only where allowlisted', () => {
  const offenders = grep()
  const fresh = offenders.filter((f) => !ALLOWLIST.has(f))
  assert.deepEqual(fresh, [], `direct .from() outside allowlist (move to src/lib/api/*): ${fresh.join(', ')}`)
  const stale = [...ALLOWLIST].filter((f) => !offenders.includes(f))
  assert.deepEqual(stale, [], `allowlist entries now clean — remove them: ${stale.join(', ')}`)
})
