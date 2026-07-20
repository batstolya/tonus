import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../../lib/i18n'
import { getProfileLocation, saveProfileLocation, updateLocationLabel } from '../../../lib/api/settings'
import { callFunction } from '../../../lib/edgeFunctions'
import { ArchiveBtn, type SectionProps } from './ArchiveBtn'

type LocResult = { name: string; country?: string; admin1?: string; latitude: number; longitude: number }

export function EnvironmentSection({ archived, onArchive, user }: SectionProps & { user: User }) {
  const { t, lang } = useT()
  const [envSyncing, setEnvSyncing] = useState(false)
  const [envMsg, setEnvMsg] = useState<string | null>(null)
  const [locLabel, setLocLabel] = useState<string | null>(null)
  const [locQuery, setLocQuery] = useState('')
  const [locResults, setLocResults] = useState<LocResult[]>([])
  const [locSearching, setLocSearching] = useState(false)
  const [locLocating, setLocLocating] = useState(false)
  const [locMsg, setLocMsg] = useState<string | null>(null)
  const [editingLoc, setEditingLoc] = useState(false)

  async function handleSyncEnvironment() {
    setEnvSyncing(true)
    setEnvMsg(null)
    try {
      const json = await callFunction<{ synced?: number }>('fetch-environment', {})
      setEnvMsg(json.synced ? `✅ ${t('Синхронизировано')} ${json.synced} ${t('дн')}` : t('Ошибка'))
    } catch (e) {
      setEnvMsg(`${t('Ошибка')}: ${(e as Error).message}`)
    }
    setEnvSyncing(false)
  }

  async function handleLocationSearch() {
    const q = locQuery.trim()
    if (!q) return
    setLocSearching(true); setLocMsg(null); setLocResults([])
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=${lang}&format=json`)
      const data = await res.json()
      const results = (data.results ?? []).map((r: LocResult) => ({ name: r.name, country: r.country, admin1: r.admin1, latitude: r.latitude, longitude: r.longitude }))
      setLocResults(results)
      if (!results.length) setLocMsg(t('Город не найден'))
    } catch {
      setLocMsg(t('Ошибка'))
    }
    setLocSearching(false)
  }

  async function handleLocationPick(r: LocResult) {
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ')
    const err = await saveProfileLocation(user.id, { latitude: r.latitude, longitude: r.longitude, label })
    if (err) { setLocMsg(`${t('Ошибка')}: ${err}`); return }
    setLocLabel(label); setLocResults([]); setLocQuery(''); setEditingLoc(false); setLocMsg(`✅ ${t('Локация определена')}`)
  }

  // Запрашиваем доступ к геолокации браузера и сами определяем место (обратный геокодер)
  function handleUseMyLocation() {
    if (!navigator.geolocation) { setLocMsg(t('Геолокация недоступна в браузере')); return }
    setLocLocating(true); setLocMsg(t('Запрашиваю доступ к геолокации…')); setLocResults([])
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        let label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`
        try {
          // BigDataCloud reverse-geocode — бесплатно, без ключа, CORS-friendly
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=${lang}`)
          const g = await res.json()
          const parts = [g.city || g.locality, g.principalSubdivision, g.countryName].filter(Boolean)
          if (parts.length) label = parts.join(', ')
        } catch { /* без названия — оставим координаты */ }
        const err = await saveProfileLocation(user.id, { latitude, longitude, label })
        setLocLocating(false)
        if (err) { setLocMsg(`${t('Ошибка')}: ${err}`); return }
        setLocLabel(label); setLocResults([]); setLocQuery(''); setEditingLoc(false); setLocMsg(`✅ ${t('Локация определена')}`)
      },
      (err) => {
        setLocLocating(false)
        setLocMsg(err.code === err.PERMISSION_DENIED ? t('Доступ к геолокации запрещён') : t('Не удалось определить местоположение'))
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  }

  // Локация: сразу показываем сохранённую подпись, затем освежаем её в текущем
  // языке интерфейса по сохранённым координатам. Раньше подпись сохранялась на
  // языке момента (напр. русском) и «застревала» на нём при смене языка.
  useEffect(() => {
    let cancelled = false
    getProfileLocation(user.id).then(async data => {
      if (cancelled || !data) return
      if (data.location_label) setLocLabel(data.location_label)
      if (data.latitude == null || data.longitude == null) return
      try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${data.latitude}&longitude=${data.longitude}&localityLanguage=${lang}`)
        const g = await res.json()
        const parts = [g.city || g.locality, g.principalSubdivision, g.countryName].filter(Boolean)
        const label = parts.join(', ')
        if (!cancelled && label && label !== data.location_label) {
          setLocLabel(label)
          await updateLocationLabel(user.id, label)
        }
      } catch { /* нет сети/геокодера — оставляем сохранённую подпись */ }
    })
    return () => { cancelled = true }
  }, [user.id, lang])

  return (
    <section className={`settings-section${archived ? ' is-archived' : ''}`}>
      <ArchiveBtn id="environment" onArchive={onArchive} />
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 14.9"/></svg>
        {t('Данные среды')}
      </h3>
      <p className="settings-muted" style={{ marginBottom: 12 }}>
        {t('Погода, воздух и магнитные бури для корреляций — обновляются автоматически раз в сутки.')}
      </p>

      {locLabel && !editingLoc ? (
        // Локация уже выбрана — показываем только её и кнопку синхронизации
        <>
          <div className="rep-setting">
            <span className="settings-label">{t('Локация')}</span>
            <span style={{ fontSize: 14 }}>
              <b>{locLabel}</b>
              {' · '}
              <button className="link-btn" onClick={() => { setEditingLoc(true); setLocMsg(null) }}>{t('Изменить')}</button>
            </span>
          </div>
          <div className="rep-setting">
            <span className="settings-label">{t('Синхронизация')}</span>
            <button className="btn-secondary" onClick={handleSyncEnvironment} disabled={envSyncing}>
              {envSyncing ? t('Синхронизирую…') : t('Обновить сейчас')}
            </button>
          </div>
        </>
      ) : (
        // Локация не выбрана (или режим изменения) — показываем выбор
        <>
          <button className="btn-primary" style={{ marginBottom: 8 }} onClick={handleUseMyLocation} disabled={locLocating}>
            {locLocating ? t('Определяю…') : `📍 ${t('Определить автоматически')}`}
          </button>
          <div className="settings-muted" style={{ marginBottom: 6, fontSize: 12 }}>{t('…или найди город вручную:')}</div>
          <div className="settings-ics-row" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="settings-input" style={{ flex: 1 }} placeholder={t('Введите город')}
                value={locQuery} onChange={e => setLocQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLocationSearch() }} />
              <button className="btn-secondary" onClick={handleLocationSearch} disabled={locSearching || !locQuery.trim()}>
                {locSearching ? t('Ищу…') : t('Найти')}
              </button>
            </div>
            {locResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {locResults.map((r, i) => (
                  <button key={i} className="btn-secondary" style={{ textAlign: 'left' }} onClick={() => handleLocationPick(r)}>
                    {[r.name, r.admin1, r.country].filter(Boolean).join(', ')}
                  </button>
                ))}
              </div>
            )}
          </div>
          {locLabel && editingLoc && (
            <button className="link-btn" onClick={() => { setEditingLoc(false); setLocResults([]); setLocQuery('') }}>{t('Отмена')}</button>
          )}
        </>
      )}
      {locMsg && <p className="settings-muted" style={{ marginTop: 6 }}>{locMsg}</p>}
      {envMsg && <p className="settings-muted" style={{ marginTop: 6 }}>{envMsg}</p>}
    </section>
  )
}
