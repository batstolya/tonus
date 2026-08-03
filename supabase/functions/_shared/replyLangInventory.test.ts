import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Guard for the bug class that shipped in #179: the prompts were found by
// grepping for "На русском", so `generate-recommendations` — which never named
// a language and simply inherited Russian from its Russian prompt — was missed
// and kept answering Russian to Ukrainian users. A text search cannot see that
// absence; this inventory can.

const functionsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const providerMarker = ':generateContent?key='

// Functions that generate text for the user must name the reply language.
// Exempt, with reasons:
//   biweekly-report, telegram-bot — Telegram output stays Russian by product
//     decision (2026-08-02); revisit only if that decision changes.
//   extract-lab — digitises a lab form and must echo the document's own
//     wording, so imposing a language would corrupt the extracted data.
const EXEMPT = new Set(['biweekly-report', 'extract-lab', 'telegram-bot'])

function geminiFunctions(): { name: string; source: string }[] {
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== '_shared')
    .flatMap(entry => {
      const dir = resolve(functionsDir, entry.name)
      try {
        const source = readdirSync(dir)
          .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
          .sort()
          .map(f => readFileSync(resolve(dir, f), 'utf8'))
          .join('\n')
        return source.includes(providerMarker) ? [{ name: entry.name, source }] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

describe('reply language inventory', () => {
  it('makes every user-facing AI function name the reply language', () => {
    for (const { name, source } of geminiFunctions()) {
      if (EXEMPT.has(name)) continue
      expect(source, `${name} must build its prompt language via _shared/replyLang.ts`).toMatch(
        /import\s*\{[^}]*lang(Instruction|Nominative|Prepositional)[^}]*\}\s*from\s*['"]\.\.\/_shared\/replyLang\.ts['"]/s,
      )
    }
  })

  it('keeps no prompt hardcoding Russian as the answer language', () => {
    for (const { name, source } of geminiFunctions()) {
      if (EXEMPT.has(name)) continue
      expect(source, `${name} hardcodes Russian in a prompt`).not.toMatch(/[Нн]а русском/)
    }
  })

  it('lists the exemptions explicitly so they stay a decision, not an oversight', () => {
    const names = new Set(geminiFunctions().map(f => f.name))
    for (const name of EXEMPT) {
      expect(names, `exempt function ${name} no longer calls Gemini`).toContain(name)
    }
  })
})
