import { describe, it, expect } from 'vitest'
import { sendChatMessage, loadChatHistory, loadNotesSummary } from './chat'

// Контекст ИИ теперь собирается на сервере (F2 smart-tonus) — его полноту
// фиксирует supabase/functions/_shared/healthContext.test.ts. Здесь — только
// что клиентская обвязка чата на месте.

describe('chat client', () => {
  it('exports the API surface', () => {
    expect(typeof sendChatMessage).toBe('function')
    expect(typeof loadChatHistory).toBe('function')
    expect(typeof loadNotesSummary).toBe('function')
  })
})
