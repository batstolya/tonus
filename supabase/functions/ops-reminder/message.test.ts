import { describe, expect, it } from 'vitest'
import { backupReminderMessage } from './message.ts'

describe('backupReminderMessage', () => {
  const msg = backupReminderMessage()

  it('tells where the archives live and what to copy', () => {
    expect(msg).toContain('~/TonusBackups')
    expect(msg).toContain('tonus-*.tar.gz.enc')
    expect(msg).toContain('iCloud')
  })

  it('reassures that the archive is encrypted and names the key', () => {
    expect(msg).toContain('AES-256')
    expect(msg).toContain('tonus-backup-key')
  })

  it('includes the quarterly decrypt-check commands', () => {
    expect(msg).toContain('security find-generic-password -s tonus-backup-key -w')
    expect(msg).toContain('openssl enc -d -aes-256-cbc -pbkdf2')
    expect(msg).toContain('rm /tmp/key')
  })

  it('fits a single Telegram message', () => {
    expect(msg.length).toBeLessThan(4000)
  })
})
