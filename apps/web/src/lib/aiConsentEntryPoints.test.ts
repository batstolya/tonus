import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const entryPoints = [
  'src/components/dashboard/AiAnalysisBlock.tsx',
  'src/components/labs/LabsScreen.tsx',
]

describe('AI consent entry points', () => {
  it('use durable account consent and never browser storage as proof', () => {
    for (const file of entryPoints) {
      const source = readFileSync(resolve(file), 'utf8')
      expect(source, `${file} must load durable consent`).toContain('loadAiConsent')
      expect(source, `${file} must not trust localStorage consent`).not.toMatch(/localStorage|ai_consent|lab_ai_consent/)
    }
  })
})
