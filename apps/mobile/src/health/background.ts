import {
  UpdateFrequency,
  disableAllBackgroundDelivery,
  enableBackgroundDelivery,
  subscribeToChanges,
} from '@kingstinct/react-native-healthkit'
import type { SampleTypeIdentifier } from '@kingstinct/react-native-healthkit'
import { HEALTH_READ_TYPES } from '@tonus/shared'

// Фоновая доставка: iOS будит приложение, когда в Здоровье появляются новые
// записи, и мы отправляем их, не дожидаясь, пока человек откроет приложение.
//
// Это ДОПОЛНЕНИЕ, а не гарантия. iOS душит фоновые пробуждения по своим
// правилам — по заряду, по тому, как часто приложением пользуются, по режиму
// энергосбережения, — и никакой договорённости о том, что доставка вообще
// случится, у нас нет. Поэтому корректность держится на догоне при открытии
// (useForegroundSync с окном в SYNC_DAYS), а фон лишь сокращает задержку.

/**
 * Ежечасно, а не `immediate`. Мгновенная доставка на каждый шаг разбудила бы
 * приложение десятки раз в день ради данных, которые всё равно агрегируются по
 * суткам, — и первым, что заметил бы человек, стал бы севший аккумулятор.
 */
const FREQUENCY = UpdateFrequency.hourly

export interface BackgroundDeliveryState { enabled: number; failed: number }

// Результат последней попытки — для отладочного экрана. Фон невидим по своей
// природе: и работающий, и молча отвалившийся выглядят одинаково — ничего не
// происходит. Одна строка на экране избавляет от гадания, особенно на чужом
// телефоне, куда отладчиком не дотянуться.
let lastResult: BackgroundDeliveryState | null = null
const stateListeners = new Set<() => void>()

export function backgroundDeliveryState(): BackgroundDeliveryState | null {
  return lastResult
}

export function onBackgroundDeliveryChange(listener: () => void): () => void {
  stateListeners.add(listener)
  return () => { stateListeners.delete(listener) }
}

function publish(result: BackgroundDeliveryState | null): void {
  lastResult = result
  for (const listener of stateListeners) listener()
}

/**
 * Включает фоновую доставку по всем типам, которые мы читаем. Возвращает,
 * сколько типов согласилось: без этого «работает» и «тихо упало» выглядят
 * одинаково — оба ничего не делают и ни на что не жалуются.
 */
export async function startBackgroundDelivery(): Promise<BackgroundDeliveryState> {
  let enabled = 0
  let failed = 0
  for (const type of HEALTH_READ_TYPES) {
    // Тип за типом, а не Promise.all: отказ по одному типу (нет доступа,
    // тип недоступен на этом устройстве) не должен отменять остальные.
    try {
      if (await enableBackgroundDelivery(type as SampleTypeIdentifier, FREQUENCY)) enabled++
      else failed++
    } catch (e) {
      failed++
      // Падать из-за фона нельзя, но и терять причину не стоит: на симуляторе
      // и на устройстве без доступа отказ выглядит одинаково, а разбираться
      // потом придётся по этой строке.
      if (__DEV__) console.warn(`[health] background delivery refused for ${type}:`, e)
    }
  }
  publish({ enabled, failed })
  return { enabled, failed }
}

export async function stopBackgroundDelivery(): Promise<void> {
  try {
    await disableAllBackgroundDelivery()
  } catch {
    // См. выше: выключение тоже best-effort.
  }
  publish(null)
}

/**
 * Подписка на изменения. Возвращает функцию отписки; вызывать её обязательно —
 * иначе наблюдатели HealthKit копятся при каждом пересоздании компонента.
 */
export function subscribeToHealthChanges(onChange: () => void): () => void {
  const subscriptions = HEALTH_READ_TYPES.map(type => {
    try {
      return subscribeToChanges(type as SampleTypeIdentifier, () => { onChange() })
    } catch {
      return null
    }
  })
  return () => {
    for (const sub of subscriptions) {
      // Библиотека отдаёт объект с remove(); версия сигнатуры менялась между
      // релизами, поэтому проверяем, а не полагаемся на форму.
      const remove = (sub as { remove?: () => void } | null)?.remove
      if (typeof remove === 'function') remove.call(sub)
    }
  }
}
