import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

describe('Vitest discovery', () => {
  it('keeps the Node-native README media test out of Vitest', () => {
    const config = fs.readFileSync('vitest.config.ts', 'utf8')
    expect(config).toContain("'scripts/readme-media-lib.test.mjs'")
  })
})
