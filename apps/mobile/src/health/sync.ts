import { buildHaePayload, getEnv, ingestUrl, loadIngestToken, persistentStorage } from '@tonus/shared'
import { getSupabase } from '../supabase'
import { readHealthReadings } from './read'

// Отправка прочитанного на сервер. Приложение говорит на диалекте Health Auto
// Export и стучится в тот же `ingest-health` с тем же токеном, поэтому на
// сервере не меняется ничего — а какой отправитель принёс день, видно по полю
// source внутри payload'а.

/**
 * Окно отправки. Больше одного дня намеренно: пропущенный день (телефон был
 * выключен, сеть лежала) должен зарастать сам при следующем открытии, а не
 * ждать ручного вмешательства. Сервер апсертит по (user, date, metric), так
 * что повтор безобиден.
 */
export const SYNC_DAYS = 7

/**
 * Отправка включается вручную и по умолчанию выключена. Причина простая: на
 * симуляторе и на чужом устройстве в Здоровье лежат выдуманные записи, и
 * молчаливая автоотправка отравила бы ими боевую историю. Пока человек не
 * подтвердил «да, это мой телефон с моими данными», приложение только читает.
 */
const ENABLED_KEY = 'tonus.sync.enabled'
const LAST_KEY = 'tonus.sync.last'

export interface SyncOutcome {
  ok: boolean
  /** Готовая строка для экрана: что именно произошло. */
  message: string
  at: string
}

export function isSyncEnabled(): boolean {
  return persistentStorage.get(ENABLED_KEY) === '1'
}

// Переключатель живёт в хранилище, а на него завязана фоновая доставка в
// другом углу приложения. Без оповещения она включалась бы только со
// следующего запуска — и «включил, но ничего не происходит» выглядело бы
// поломкой.
const enabledListeners = new Set<() => void>()

export function setSyncEnabled(enabled: boolean): void {
  if (enabled) persistentStorage.set(ENABLED_KEY, '1')
  else persistentStorage.remove(ENABLED_KEY)
  for (const listener of enabledListeners) listener()
}

export function onSyncEnabledChange(listener: () => void): () => void {
  enabledListeners.add(listener)
  return () => { enabledListeners.delete(listener) }
}

export function lastSyncOutcome(): SyncOutcome | null {
  const raw = persistentStorage.get(LAST_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SyncOutcome
  } catch {
    return null
  }
}

function remember(outcome: SyncOutcome): SyncOutcome {
  persistentStorage.set(LAST_KEY, JSON.stringify(outcome))
  return outcome
}

/**
 * Адрес приёмника. В dev-сборке его можно увести на локальную заглушку — так
 * запрос проверяется целиком (URL, заголовки, тело) без единой выдуманной
 * записи в боевой базе. В релизной сборке переменная игнорируется.
 */
function endpoint(token: string): string {
  const override = process.env.EXPO_PUBLIC_INGEST_URL
  if (__DEV__ && override) return `${override}?token=${token}`
  return ingestUrl(getEnv().supabaseUrl, token)
}

/**
 * Хост получателя — для отладочного экрана. Видеть, куда именно уедут данные,
 * важнее, чем кажется: подменённый в dev-сборке адрес и боевой отличаются
 * только этой строкой, а цена ошибки — выдуманные записи в реальной истории.
 */
export function syncEndpointHost(): string {
  try {
    return new URL(endpoint('x')).host
  } catch {
    return '—'
  }
}

/**
 * Идёт ли отправка прямо сейчас. Триггеров несколько (открытие приложения,
 * событие AppState, изменение в Здоровье, кнопка), и все они спрашивают «пора
 * ли» у последнего результата — которого ещё нет, пока первая отправка не
 * закончилась. На симуляторе это дало три одинаковых POST'а на одно открытие;
 * на живом токене это был бы тройной трафик и лимит в 120 запросов в час.
 */
let inFlight: Promise<SyncOutcome> | null = null

/** Читает Здоровье за SYNC_DAYS и отправляет. Ошибки возвращает, а не бросает. */
export function syncHealth(): Promise<SyncOutcome> {
  inFlight ??= runSync().finally(() => { inFlight = null })
  return inFlight
}

async function runSync(): Promise<SyncOutcome> {
  const at = new Date().toISOString()
  try {
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return remember({ ok: false, at, message: 'Нужно войти в аккаунт.' })

    const token = await loadIngestToken(supabase, user.id)
    if (!token) {
      // Токен заводится на вебе, в разделе авто-синхронизации. Молча создать
      // его здесь можно, но тогда человек не увидит адрес вебхука и решит,
      // что HAE и телефон — это две разные синхронизации.
      return remember({ ok: false, at, message: 'Нет токена автосинка. Включи авто-синхронизацию в веб-версии.' })
    }

    const readings = await readHealthReadings(SYNC_DAYS)
    const payload = buildHaePayload(readings)
    if (!payload.data.metrics.length) {
      return remember({ ok: false, at, message: 'Отправлять нечего: Здоровье не дало данных.' })
    }

    const response = await fetch(endpoint(token.token), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 200)
      return remember({ ok: false, at, message: `Сервер ответил ${response.status}. ${body}`.trim() })
    }
    const days = new Set(payload.data.metrics.flatMap(m => m.data.map(d => d.date.slice(0, 10)))).size
    // Без склонений: «1 метрик» — это то, что не должно попадаться на глаза.
    return remember({ ok: true, at, message: `Отправлено метрик: ${payload.data.metrics.length}, дней: ${days}.` })
  } catch (e) {
    return remember({ ok: false, at, message: e instanceof Error ? e.message : String(e) })
  }
}
