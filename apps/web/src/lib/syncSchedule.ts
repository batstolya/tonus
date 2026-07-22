// Решает, пора ли запускать фоновую синхронизацию: прошло ли >= интервала с прошлого раза.
// Используется для авто-синка Google Calendar при открытии приложения (раз в день).

export const DAY_MS = 24 * 60 * 60 * 1000

export function shouldAutoSync(
  lastSyncIso: string | null | undefined,
  now: Date = new Date(),
  intervalMs: number = DAY_MS,
): boolean {
  if (!lastSyncIso) return true
  const last = Date.parse(lastSyncIso)
  if (Number.isNaN(last)) return true
  return now.getTime() - last >= intervalMs
}
