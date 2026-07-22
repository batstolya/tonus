export function isResetUrl(search: string): boolean {
  return new URLSearchParams(search).has('reset')
}

export type UnauthedView = 'landing' | 'auth'

// reset-ссылка минует лендинг, чтобы он не мигал до старта recovery-сессии.
export function unauthedView(opts: { isResetUrl: boolean; showAuth: boolean }): UnauthedView {
  if (opts.isResetUrl) return 'auth'
  if (opts.showAuth) return 'auth'
  return 'landing'
}
