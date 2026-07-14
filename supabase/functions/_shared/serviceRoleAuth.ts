import { secretMatches } from './auth.ts'

// Trusted infrastructure calls (cron and telegram-bot) authenticate with the
// service-role credential in Authorization plus the target user's x-user-id.
// Accept the caller-controlled user ID only after a complete credential match.
export function isServiceRoleCall(req: Request, expected: string | undefined): boolean {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.get('Authorization') ?? '')
  return secretMatches(match?.[1], expected)
}
