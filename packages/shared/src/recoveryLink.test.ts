import { describe, expect, it } from 'vitest'
import { parseRecoveryLink } from './recoveryLink'

// Обе формы взяты из настоящих ответов Supabase, а не придуманы: ошибочный
// фрагмент скопирован с живой просроченной ссылки из письма. Придуманный
// вариант («токены есть, но плохие») в первой версии обработчика увёл в
// сторону — в реальности просроченная ссылка приходит вообще без токенов.
describe('parseRecoveryLink', () => {
  it('reads a session out of a valid link', () => {
    const link = parseRecoveryLink('tonus://reset#access_token=abc&refresh_token=def&type=recovery')
    expect(link).toEqual({ kind: 'session', accessToken: 'abc', refreshToken: 'def' })
  })

  it('recognises the real expired-link fragment Supabase sends', () => {
    const link = parseRecoveryLink(
      'tonus://reset#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=',
    )
    expect(link.kind).toBe('error')
    expect(link).toMatchObject({ message: expect.stringContaining('устарела') })
  })

  it('falls back to the server description for codes it does not know', () => {
    const link = parseRecoveryLink('tonus://reset#error_code=server_on_fire&error_description=Something+specific')
    expect(link).toEqual({ kind: 'error', message: 'Something specific' })
  })

  it('treats a half-filled token pair as an error rather than a session', () => {
    // Один токен без второго — не сессия. Отдать такое в setSession значило бы
    // получить невнятный отказ вместо понятного сообщения.
    expect(parseRecoveryLink('tonus://reset#access_token=abc').kind).not.toBe('session')
  })

  it('ignores links that are not about recovery at all', () => {
    expect(parseRecoveryLink('tonus://reset').kind).toBe('unrelated')
    expect(parseRecoveryLink('tonus://something#foo=bar').kind).toBe('unrelated')
    expect(parseRecoveryLink(null).kind).toBe('unrelated')
  })
})
