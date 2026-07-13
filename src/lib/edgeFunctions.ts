import { supabase } from './supabase'

// Единый вызов Supabase Edge Functions с авторизацией и обработкой ошибок.
// Заменяет повторяющийся бойлерплейт (getSession + fetch + headers) в 12 местах.
//
// Раньше каждый экран делал это вручную, и половина не проверяла res.ok —
// при 500 от функции код молча получал undefined вместо ошибки.

export class EdgeFunctionError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'EdgeFunctionError'
    this.status = status
  }
}

const BASE = import.meta.env.VITE_SUPABASE_URL as string

// Вызывает edge-функцию POST'ом, возвращает распарсенный JSON.
// Бросает EdgeFunctionError при не-2xx или { error } в теле ответа.
export async function callFunction<T = unknown>(name: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new EdgeFunctionError('Не авторизован', 401)

  const res = await fetch(`${BASE}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let json: { error?: string; message?: string } | null = null
  try { json = await res.json() } catch { /* пустое тело — ок для некоторых функций */ }

  if (!res.ok) {
    const msg = json?.error || json?.message || `Ошибка сервера (${res.status})`
    throw new EdgeFunctionError(msg, res.status)
  }
  // некоторые функции возвращают { error } даже со статусом 200
  if (json?.error) throw new EdgeFunctionError(json.error, res.status)

  return json as unknown as T
}
