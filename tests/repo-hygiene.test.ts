import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

// Runtime artifacts (Chromium cookies/cache/history, PID, state snapshot) must
// never be tracked. Spec §4.1 / acceptance "repository test".
describe('repo hygiene', () => {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n')

  it('does not track the claude-monitor browser profile', () => {
    const leaked = tracked.filter(f => f.startsWith('claude-monitor/browser-profile/'))
    expect(leaked).toEqual([])
  })

  it('does not track runtime pid or state snapshots', () => {
    const leaked = tracked.filter(
      f => f.endsWith('.pid') || f === 'claude-monitor/data/state.json',
    )
    expect(leaked).toEqual([])
  })
})
