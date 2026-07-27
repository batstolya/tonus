// Разбор ссылки восстановления пароля, которую Supabase открывает в приложении
// (tonus://reset#...). Живёт в shared, а не в apps/mobile, потому что это
// чистый разбор строки — и потому что вариантов у фрагмента больше одного, а
// ошибиться в них легко: см. историю ниже.
//
// Supabase кладёт во фрагмент ЛИБО токены сессии, ЛИБО описание ошибки:
//   #access_token=…&refresh_token=…&type=recovery
//   #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
//
// Первая версия обработчика знала только про токены и на ошибочном фрагменте
// молча ничего не делала. Проверено вживую: просроченная ссылка из настоящего
// письма приходит ИМЕННО во втором виде, так что «молча ничего» и было её
// обычным поведением.

/** Что несёт ссылка восстановления. */
export type RecoveryLink =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }
  | { kind: 'unrelated' }

const EXPIRED = 'Ссылка для сброса пароля устарела или уже использована. Запросите новую.'

/** Коды, для которых у нас есть человеческая формулировка. */
const KNOWN_CODES: Record<string, string> = {
  otp_expired: EXPIRED,
  access_denied: EXPIRED,
}

export function parseRecoveryLink(url: string | null): RecoveryLink {
  const fragment = url?.split('#')[1]
  if (!fragment) return { kind: 'unrelated' }

  const params = new URLSearchParams(fragment)

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (accessToken && refreshToken) {
    return { kind: 'session', accessToken, refreshToken }
  }

  const code = params.get('error_code')
  const error = params.get('error')
  if (code || error) {
    // error_description приходит с плюсами вместо пробелов; URLSearchParams
    // это уже разворачивает. Свой текст показываем только для знакомых кодов,
    // остальное отдаём как есть — лучше английская правда, чем наша выдумка.
    const description = params.get('error_description')
    return {
      kind: 'error',
      message: KNOWN_CODES[code ?? ''] ?? KNOWN_CODES[error ?? ''] ?? description ?? EXPIRED,
    }
  }

  return { kind: 'unrelated' }
}
