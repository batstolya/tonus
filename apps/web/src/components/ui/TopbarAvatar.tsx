import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getAvatarUrl } from '../../lib/api/avatar'
import { AVATAR_CHANGED } from '../../lib/avatarEvent'
import { useT } from '../../lib/i18n'
import { Avatar } from './Avatar'

// Reads the photo itself rather than taking it as a prop: settings is the only
// place that changes it, and it announces the change on the window. Keeping the
// two independent avoids threading the URL through the whole shell for a
// picture that changes about once a year.
export function TopbarAvatar({ user, onOpen }: { user: User; onOpen: () => void }) {
  const { t } = useT()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const read = () => { void getAvatarUrl(user.id).then(u => { if (live) setUrl(u) }) }
    read()
    window.addEventListener(AVATAR_CHANGED, read)
    return () => { live = false; window.removeEventListener(AVATAR_CHANGED, read) }
  }, [user.id])

  return (
    <button className="topbar-avatar" onClick={onOpen} title={t('Профиль')} aria-label={t('Профиль')}>
      <Avatar url={url} size={28} />
    </button>
  )
}
