import { describe, it, expect, vi } from 'vitest'
import { runChatLoop, type ChatLoopMessage } from './chatToolLoop'

const baseContents: ChatLoopMessage[] = [{ role: 'user', parts: [{ text: 'привет' }] }]

describe('runChatLoop', () => {
  it('returns the reply immediately when there is no function call', async () => {
    const callGemini = vi.fn().mockResolvedValue({ parts: [{ text: 'Твой сон в норме.' }], tokensUsed: 120 })
    const executeTool = vi.fn()
    const result = await runChatLoop(baseContents, callGemini, executeTool)
    expect(result.reply).toBe('Твой сон в норме.')
    expect(result.totalTokens).toBe(120)
    expect(callGemini).toHaveBeenCalledTimes(1)
    expect(executeTool).not.toHaveBeenCalled()
  })

  it('executes a tool call and feeds the response back for a second round', async () => {
    const callGemini = vi.fn()
      .mockResolvedValueOnce({ parts: [{ functionCall: { name: 'get_sleep_range', args: { start_date: '2026-06-01', end_date: '2026-06-30' } } }], tokensUsed: 80 })
      .mockResolvedValueOnce({ parts: [{ text: 'В июне ты в среднем засыпал в 23:40.' }], tokensUsed: 150 })
    const executeTool = vi.fn().mockResolvedValue({ rows: [{ date: '2026-06-01', bedtime: '2026-05-31T21:40:00Z' }] })
    const result = await runChatLoop(baseContents, callGemini, executeTool)
    expect(result.reply).toBe('В июне ты в среднем засыпал в 23:40.')
    expect(result.totalTokens).toBe(230)
    expect(executeTool).toHaveBeenCalledWith('get_sleep_range', { start_date: '2026-06-01', end_date: '2026-06-30' })
    expect(callGemini).toHaveBeenCalledTimes(2)
    // второй вызов должен получить историю с functionResponse: v1beta REST API
    // требует role 'user' для functionResponse-хода (role 'function' не принимается)
    const secondCallContents = callGemini.mock.calls[1][0]
    const fnResponseMsg = secondCallContents.find((m: ChatLoopMessage) =>
      m.parts.some((p) => p.functionResponse))
    expect(fnResponseMsg?.role).toBe('user')
  })

  it('caps at 2 extra rounds and forces a final call without tools', async () => {
    const callGemini = vi.fn().mockResolvedValue({ parts: [{ functionCall: { name: 'get_metrics_range', args: {} } }], tokensUsed: 50 })
    const executeTool = vi.fn().mockResolvedValue({ rows: [] })
    const result = await runChatLoop(baseContents, callGemini, executeTool)
    // 3 вызова максимум: initial + 2 доп. раунда; последний — withTools=false
    expect(callGemini).toHaveBeenCalledTimes(3)
    expect(callGemini.mock.calls[2][1]).toBe(false)
    expect(result.totalTokens).toBe(150)
    expect(result.reply).toBe('Не удалось получить ответ.')
  })

  it('does not throw when executeTool rejects, and passes the error back to the model', async () => {
    const callGemini = vi.fn()
      .mockResolvedValueOnce({ parts: [{ functionCall: { name: 'get_lab_history', args: { marker: 'Ферритин' } } }], tokensUsed: 60 })
      .mockResolvedValueOnce({ parts: [{ text: 'Не смог получить историю анализов.' }], tokensUsed: 90 })
    const executeTool = vi.fn().mockRejectedValue(new Error('db down'))
    const result = await runChatLoop(baseContents, callGemini, executeTool)
    expect(result.reply).toBe('Не смог получить историю анализов.')
    const secondCallContents = callGemini.mock.calls[1][0]
    const functionMsg = secondCallContents.find((m: ChatLoopMessage) =>
      m.parts.some((p) => p.functionResponse))
    expect(JSON.stringify(functionMsg)).toContain('db down')
  })
})
