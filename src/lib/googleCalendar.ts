import type { CalendarEvent } from '../types'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPES = 'https://www.googleapis.com/auth/calendar.events.readonly'

let tokenClient: google.accounts.oauth2.TokenClient | null = null
let accessToken: string | null = null

export function isGoogleCalendarAvailable() {
  return !!CLIENT_ID
}

function loadGoogleScript(): Promise<void> {
  if (document.getElementById('google-gsi')) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = 'google-gsi'
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => resolve()
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export async function connectGoogleCalendar(): Promise<CalendarEvent[]> {
  if (!CLIENT_ID) throw new Error('Google Client ID не настроен')

  await loadGoogleScript()

  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return }
        accessToken = resp.access_token
        try {
          const events = await fetchGoogleEvents(accessToken!)
          resolve(events)
        } catch (e) {
          reject(e)
        }
      },
    })
    tokenClient.requestAccessToken({ prompt: 'consent' })
  })
}

// Тихая синхронизация без попапа: работает, если у пользователя ещё активен
// грант Google. Если нужна интеракция — молча возвращает null (не показываем окно).
export async function silentGoogleCalendarSync(): Promise<CalendarEvent[] | null> {
  if (!CLIENT_ID) return null
  try {
    await loadGoogleScript()
  } catch { return null }

  return new Promise((resolve) => {
    let settled = false
    const done = (v: CalendarEvent[] | null) => { if (!settled) { settled = true; resolve(v) } }
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID!,
        scope: SCOPES,
        prompt: '',
        callback: async (resp) => {
          if (resp.error || !resp.access_token) { done(null); return }
          try { done(await fetchGoogleEvents(resp.access_token)) }
          catch { done(null) }
        },
        error_callback: () => done(null),
      })
      client.requestAccessToken({ prompt: '' })
    } catch { done(null) }
    // на всякий случай — не висеть дольше 15с
    setTimeout(() => done(null), 15000)
  })
}

async function fetchGoogleEvents(token: string): Promise<CalendarEvent[]> {
  const timeMin = new Date()
  timeMin.setFullYear(timeMin.getFullYear() - 2)

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', timeMin.toISOString())
  url.searchParams.set('timeMax', new Date().toISOString())
  url.searchParams.set('maxResults', '2500')
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error('Ошибка Google Calendar API')

  const json = await res.json()
  const items: CalendarEvent[] = (json.items ?? [])
    .filter((item: any) => item.status !== 'cancelled' && item.start?.dateTime)
    .map((item: any) => ({
      uid: item.id,
      title: item.summary ?? '(без названия)',
      start: new Date(item.start.dateTime),
      end: new Date(item.end?.dateTime ?? item.start.dateTime),
      description: item.description ?? undefined,
      location: item.location ?? undefined,
    }))

  return items
}

// Extend window types for Google Identity Services
declare global {
  namespace google.accounts.oauth2 {
    interface TokenClient {
      requestAccessToken(options?: { prompt?: string }): void
    }
    function initTokenClient(config: {
      client_id: string
      scope: string
      callback: (resp: { access_token: string; error?: string }) => void
    }): TokenClient
  }
}
