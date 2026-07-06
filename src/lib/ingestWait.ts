// Ожидание первого приёма данных авто-синка: поллим last_ingest_at,
// успех — когда появилось значение, отличное от baseline (снятого до начала теста).
// Поллер инъектируется, чтобы модуль не тянул supabase и тестировался в node.

export interface WaitOpts {
  baseline: string | null
  timeoutMs?: number
  intervalMs?: number
}

export async function waitForFirstIngest(
  poll: () => Promise<string | null>,
  { baseline, timeoutMs = 120_000, intervalMs = 5_000 }: WaitOpts,
): Promise<'ok' | 'timeout'> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const last = await poll()
    if (last != null && last !== baseline) return 'ok'
    const nextPollTime = Date.now() + intervalMs
    if (nextPollTime > deadline) return 'timeout'
    await new Promise(r => setTimeout(r, intervalMs))
  }
}
