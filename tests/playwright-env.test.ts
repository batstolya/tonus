import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

describe('Playwright environment', () => {
  it('disables VITE_DEMO so a local .env.local cannot bypass the landing smoke test', () => {
    const config = fs.readFileSync('playwright.config.ts', 'utf8')
    expect(config).toContain("VITE_DEMO: ''")
  })
})
