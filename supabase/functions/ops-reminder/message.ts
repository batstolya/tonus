// Fixed monthly ops reminder (product content — Russian). Pure module so the
// instruction text is vitest-tested; the function shell only gates and sends.

export function backupReminderMessage(): string {
  return [
    '🗄️ Ежемесячный чек бэкапов',
    '',
    'Ночные бэкапы делаются сами, но одна копия должна жить вне Mac:',
    '',
    '1. Открой Finder → ~/TonusBackups',
    '2. Возьми самый свежий tonus-*.tar.gz.enc',
    '3. Скопируй его в iCloud Drive (папка TonusBackups)',
    '',
    'Архив зашифрован (AES-256) — в облаке он в безопасности. Ключ tonus-backup-key лежит в Keychain и в менеджере паролей.',
    '',
    'Раз в квартал проверь, что архив расшифровывается:',
    'security find-generic-password -s tonus-backup-key -w > /tmp/key',
    'openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/tmp/key -in <архив> | tar tz | head',
    'rm /tmp/key',
  ].join('\n')
}
