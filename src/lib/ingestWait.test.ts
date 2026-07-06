import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitForFirstIngest } from './ingestWait'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('waitForFirstIngest', () => {
  it('успех, когда поллер вернул значение новее baseline', async () => {
    const values = [null, null, '2026-07-06T10:00:00Z']
    const poll = vi.fn(async () => values.shift() as string | null)
    const p = waitForFirstIngest(poll, { baseline: null, intervalMs: 5000, timeoutMs: 60000 })
    await vi.advanceTimersByTimeAsync(15000)
    await expect(p).resolves.toBe('ok')
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('значение, равное baseline — не успех (старый приём до гайда)', async () => {
    const poll = vi.fn(async () => '2026-07-01T00:00:00Z')
    const p = waitForFirstIngest(poll, { baseline: '2026-07-01T00:00:00Z', intervalMs: 5000, timeoutMs: 12000 })
    await vi.advanceTimersByTimeAsync(20000)
    await expect(p).resolves.toBe('timeout')
  })

  it('таймаут, если данные так и не пришли', async () => {
    const poll = vi.fn(async () => null)
    const p = waitForFirstIngest(poll, { baseline: null, intervalMs: 5000, timeoutMs: 12000 })
    await vi.advanceTimersByTimeAsync(20000)
    await expect(p).resolves.toBe('timeout')
    // 0мс, 5с, 10с — дальше дедлайн 12с
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('ошибка поллера не роняет ожидание — ретраит и добивается успеха', async () => {
    let calls = 0
    const poll = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('network down')
      return '2026-07-06T12:00:00Z'
    })
    const p = waitForFirstIngest(poll, { baseline: null, intervalMs: 5000, timeoutMs: 60000 })
    await vi.advanceTimersByTimeAsync(5000)
    await expect(p).resolves.toBe('ok')
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('успех на первой же проверке — без ожидания интервала', async () => {
    const poll = vi.fn(async () => '2026-07-06T11:00:00Z')
    const p = waitForFirstIngest(poll, { baseline: null, intervalMs: 5000, timeoutMs: 60000 })
    await vi.advanceTimersByTimeAsync(0)
    await expect(p).resolves.toBe('ok')
    expect(poll).toHaveBeenCalledTimes(1)
  })
})
