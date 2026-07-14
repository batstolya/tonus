// Границы авторизации Tonus. Fail closed: пустой/незаданный секрет = отказ.
// Чистый модуль (без Deno-URL импортов) → тестируется vitest.
// Спека: docs/superpowers/specs/architecture-hardening/2026-07-09-security-boundaries-design.md §2, §3.

// Сравнение постоянного времени (не зависит от места первого различия).
// Разная длина → сразу false, но без раннего выхода по содержимому.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Единственная точка правды для «этот секрет верный?».
export function secretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!expected) return false // нет секрета в runtime → отказ (fail closed)
  if (!provided) return false
  return timingSafeEqual(provided, expected)
}

export function isValidCronSecret(req: Request, expected: string | undefined): boolean {
  return secretMatches(req.headers.get('x-cron-secret'), expected)
}

export function isValidTelegramSecret(req: Request, expected: string | undefined): boolean {
  return secretMatches(req.headers.get('x-telegram-bot-api-secret-token'), expected)
}

export function isValidAdminSecret(req: Request, expected: string | undefined): boolean {
  return secretMatches(req.headers.get('x-admin-secret'), expected)
}

// Вызов от нашей же инфраструктуры (cron, telegram-bot) с service-role ключом в
// Authorization и x-user-id — доверять этой паре можно ТОЛЬКО при полном
// совпадении ключа.
//
// Раньше здесь было `authHeader.includes(SERVICE_KEY.slice(0, 20))`. Первые 20
// символов service-ключа — это base64 заголовка HS256-JWT ('eyJhbGciOiJIUzI1NiIs'),
// то есть константа, общая с публичным anon-ключом и с access-токеном любого
// юзера. Любой запрос с любым Supabase-JWT проходил проверку и получал
// service-role доступ к данным юзера из подставленного x-user-id.
export function isServiceRoleCall(req: Request, expected: string | undefined): boolean {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : header
  return secretMatches(token, expected)
}
