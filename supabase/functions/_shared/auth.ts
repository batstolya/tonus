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

// Trusted infrastructure calls (cron and telegram-bot) authenticate with the
// service-role credential in Authorization plus the target user's x-user-id.
// Accept the caller-controlled user ID only after a complete credential match.
export function isServiceRoleCall(req: Request, expected: string | undefined): boolean {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.get('Authorization') ?? '')
  return secretMatches(match?.[1], expected)
}
