import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { startBackgroundDelivery, stopBackgroundDelivery, subscribeToHealthChanges } from './health/background'
import { isSyncEnabled, lastSyncOutcome, onSyncEnabledChange, syncHealth } from './health/sync'

/**
 * Не чаще раза в полчаса: возвращение в приложение — событие частое (свернул,
 * ответил на сообщение, вернулся), а данные Здоровья за минуту не меняются.
 * Отправка при этом остаётся гарантией — пропущенный день зарастает окном в
 * SYNC_DAYS, а не отдельным механизмом догона.
 */
const MIN_INTERVAL_MS = 30 * 60 * 1000

function dueForSync(now: number): boolean {
  const last = lastSyncOutcome()
  // После неудачи пробуем при следующем же открытии: интервал бережёт от
  // лишней работы, а не от повторной попытки после ошибки.
  if (!last || !last.ok) return true
  return now - new Date(last.at).getTime() > MIN_INTERVAL_MS
}

/**
 * Синхронизация при открытии приложения — та самая гарантия из спеки: фоновая
 * доставка iOS ненадёжна по устройству, поэтому корректность держится на
 * догоне при выходе на передний план. Фоновая доставка идёт довеском и лишь
 * сокращает задержку.
 */
export function useForegroundSync(active: boolean): void {
  const [enabled, setEnabled] = useState(isSyncEnabled)

  useEffect(() => onSyncEnabledChange(() => { setEnabled(isSyncEnabled()) }), [])

  useEffect(() => {
    if (!active || !enabled) return
    const run = () => { if (dueForSync(Date.now())) void syncHealth() }
    run()
    const sub = AppState.addEventListener('change', state => { if (state === 'active') run() })
    return () => { sub.remove() }
  }, [active, enabled])

  useEffect(() => {
    if (!active || !enabled) {
      // Выключили отправку — снимаем и фоновые пробуждения: будить телефон
      // ради данных, которые никуда не поедут, незачем.
      void stopBackgroundDelivery()
      return
    }
    void startBackgroundDelivery()
    const unsubscribe = subscribeToHealthChanges(() => { if (dueForSync(Date.now())) void syncHealth() })
    return () => { unsubscribe() }
  }, [active, enabled])
}
