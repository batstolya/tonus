import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../../lib/i18n'
import { loadProfileBasics, saveProfileBasics, type Sex } from '../../../lib/api/settings'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

interface Props extends SectionProps { user?: User }

// Birth year rather than age: an age would silently rot, and a full birth date
// is more identifying data than the doctor report needs.
export function ProfileSection({ archived, onArchive, user }: Props) {
  const { t } = useT()
  const [year, setYear] = useState('')
  const [sex, setSex] = useState<Sex | ''>('')

  useEffect(() => {
    if (!user) return
    loadProfileBasics(user.id).then(p => {
      if (!p) return
      setYear(p.birth_year ? String(p.birth_year) : '')
      setSex(p.sex ?? '')
    })
  }, [user])

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
      <h3 className="settings-section-title">{t('Профиль')}</h3>
      <p className="settings-hint">{t('Возраст и пол попадают в отчёт для врача — по ним читаются референсные диапазоны анализов.')}</p>
      <div className="rep-seg" style={{ gap: 8 }}>
        <label>
          {t('Год рождения')}
          <input
            className="supp-input supp-input-sm"
            type="text"
            inputMode="numeric"
            value={year}
            onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onBlur={commitYear}
          />
        </label>
        <label>
          {t('Пол')}
          <select
            className="supp-input supp-input-sm"
            value={sex}
            onChange={e => commitSex(e.target.value as Sex | '')}
          >
            <option value="">{t('Не указан')}</option>
            <option value="male">{t('Мужской')}</option>
            <option value="female">{t('Женский')}</option>
          </select>
        </label>
      </div>
    </section>
  )
}
