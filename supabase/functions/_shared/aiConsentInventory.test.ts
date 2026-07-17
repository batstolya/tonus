import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const supabaseDir = resolve(functionsDir, '..')
const providerMarker = ':generateContent?key='

function geminiFunctions(): { name: string; source: string }[] {
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== '_shared')
    .flatMap(entry => {
      // Scan every module of the function, not just index.ts — the telegram-bot
      // split moved its Gemini calls into ai.ts and egress must stay visible.
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

describe('Gemini egress inventory', () => {
  it('keeps the current Gemini function inventory explicit', () => {
    expect(geminiFunctions().map(item => item.name)).toEqual([
      'analyze-health',
      'biweekly-report',
      'chat-health',
      'classify-meal',
      'coach-profile',
      'coach-weekly',
      'deep-research',
      'extract-lab',
      'generate-recommendations',
      'suggest-experiments',
      'supplement-schedule',
      'telegram-bot',
    ])
  })

  it('routes every direct Gemini request through the shared consent boundary', () => {
    for (const { name, source } of geminiFunctions()) {
      const egressCount = source.split(providerMarker).length - 1
      const guardedCount = source.match(/await fetchGeminiWithConsent\(/g)?.length ?? 0

      expect(source, `${name} must import the shared boundary`).toMatch(
        /import\s*\{[^}]*fetchGeminiWithConsent[^}]*\}\s*from\s*['"]\.\.\/_shared\/aiConsent\.ts['"]/s,
      )
      expect(guardedCount, `${name} has an unguarded Gemini request`).toBe(egressCount)
      expect(source, `${name} still calls Gemini with fetch directly`).not.toMatch(
        /await fetch\([\s\S]{0,160}:generateContent\?key=/,
      )
      expect(source, `${name} must bind consent to the authenticated or target user`).toMatch(
        /fetchGeminiWithConsent\(\s*(?:supabase|client),\s*(?:user\.id|userId),/s,
      )
    }
  })

  it('keeps policy-version history, owner RLS, and scheduled denial guidance explicit', () => {
    const migration = readFileSync(resolve(supabaseDir, 'migrations/20260716010000_ai_processing_consents.sql'), 'utf8')
    expect(migration).toMatch(/primary key \(user_id, provider, purpose, policy_version\)/i)
    expect(migration).toMatch(/enable row level security/i)
    expect(migration).toMatch(/for select to authenticated[\s\S]*auth\.uid\(\) = user_id/i)
    expect(migration).toMatch(/for insert to authenticated[\s\S]*auth\.uid\(\) = user_id/i)
    expect(migration).toMatch(/for update to authenticated[\s\S]*auth\.uid\(\) = user_id/i)

    const reminders = readFileSync(resolve(functionsDir, 'send-reminders/index.ts'), 'utf8')
    expect(reminders).toContain("body?.error === 'ai_consent_required'")
    expect(reminders).toContain('telegram_chat_id')
    expect(reminders).toContain('Обработка данных ИИ')
  })
})
