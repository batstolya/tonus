import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../../lib/i18n'
import { loadProfileBasics, saveProfileBasics, type Sex } from '../../../lib/api/settings'
import { getAvatarUrl, uploadAvatar, removeAvatar } from '../../../lib/api/avatar'
import { Avatar } from '../../ui/Avatar'
import { AVATAR_CHANGED } from '../../../lib/avatarEvent'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

interface Props extends SectionProps { user?: User }

// Birth year rather than age: an age would silently rot, and a full birth date
// is more identifying data than the doctor report needs.
export function ProfileSection({ archived, onArchive, user }: Props) {
  const { t } = useT()
  const [year, setYear] = useState('')
  const [sex, setSex] = useState<Sex | ''>('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    loadProfileBasics(user.id).then(p => {
      if (!p) return
      setYear(p.birth_year ? String(p.birth_year) : '')
      setSex(p.sex ?? '')
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    getAvatarUrl(user.id).then(setAvatar)
  }, [user])

  // The topbar draws the same photo from its own copy, so tell it to re-read
  // rather than leave a stale face on screen until the next page load.
  function announce() {
    window.dispatchEvent(new Event(AVATAR_CHANGED))
  }

  async function handlePick(file: File | undefined) {
    if (!user || !file) return
    setBusy(true)
    const url = await uploadAvatar(user.id, file)
    if (url) { setAvatar(url); announce() }
    setBusy(false)
  }

  async function handleRemove() {
    if (!user) return
    setBusy(true)
    if (await removeAvatar(user.id)) { setAvatar(null); announce() }
    setBusy(false)
  }

  function commitYear() {
    if (!user) return
    const n = year.length === 4 ? Number(year) : null
    void saveProfileBasics(user.id, { birth_year: n })
  }

  function commitSex(value: Sex | '') {
    setSex(value)
    if (user) void saveProfileBasics(user.id, { sex: value || null })
  }

  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="profile" onArchive={onArchive} />
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        {t('Профиль')}
      </h3>
      <p className="settings-muted" style={{ marginBottom: 14, fontSize: 13 }}>
        {t('Возраст и пол попадают в отчёт для врача — по ним читаются референсные диапазоны анализов.')}
      </p>
      <div className="profile-photo-row">
        <Avatar url={avatar} size={64} alt={t('Фото профиля')} />
        <div className="profile-photo-actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={e => { void handlePick(e.target.files?.[0]); e.target.value = '' }}
          />
          <button className="btn-secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {avatar ? t('Заменить фото') : t('Добавить фото')}
          </button>
          {avatar && (
            <button className="btn-ghost" disabled={busy} onClick={() => void handleRemove()}>
              {t('Убрать')}
            </button>
          )}
        </div>
      </div>

      <div className="rep-setting">
        <label className="settings-label" htmlFor="profile-birth-year">{t('Год рождения')}</label>
        <input
          id="profile-birth-year"
          className="settings-input"
          style={{ width: 110 }}
          type="text"
          inputMode="numeric"
          placeholder="1990"
          value={year}
          onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onBlur={commitYear}
        />
      </div>
      <div className="rep-setting" style={{ marginBottom: 0 }}>
        <label className="settings-label" htmlFor="profile-sex">{t('Пол')}</label>
        <select
          id="profile-sex"
          className="settings-input"
          style={{ width: 160 }}
          value={sex}
          onChange={e => commitSex(e.target.value as Sex | '')}
        >
          <option value="">{t('Не указан')}</option>
          <option value="male">{t('Мужской')}</option>
          <option value="female">{t('Женский')}</option>
        </select>
      </div>
    </section>
  )
}
