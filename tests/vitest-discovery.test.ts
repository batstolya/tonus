import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

describe('Vitest discovery', () => {
  it('keeps Node-native script tests (node:test) out of Vitest', () => {
    // scripts/*.test.mjs are node:test suites run via `npm run test:scripts`;
    // Vitest must exclude the whole scripts dir so it never tries to run them.
    const config = fs.readFileSync('apps/web/vitest.config.ts', 'utf8')
    expect(config).toContain("'scripts/**'")
  })
})
