import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { loadHairEntries, saveHairEntry, uploadHairPhoto, getPhotoUrl, type HairEntry } from '../../lib/concerns'

interface Props { user: User }

const METRIC_LABELS: { key: keyof HairEntry; label: string; desc: string }[] = [
  { key: 'shedding_level', label: 'Выпадение', desc: '1 — минимальное, 5 — сильное' },
  { key: 'density_rating', label: 'Густота', desc: '1 — очень редкие, 5 — густые' },
  { key: 'hairline_rating', label: 'Линия роста', desc: '1 — сильно отступила, 5 — без изменений' },
]

const ANGLES = [
  { key: 'photo_top' as const, label: 'Макушка', icon: '⬆️' },
  { key: 'photo_hairline' as const, label: 'Линия роста', icon: '↔️' },
  { key: 'photo_temples' as const, label: 'Виски', icon: '↖️' },
]

function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(v => (
        <button key={v}
          className={`severity-btn${value === v ? ' active' : ''}`}
          style={{ '--sev-color': value === v ? 'var(--accent)' : 'var(--text-muted)' } as any}
          onClick={() => onChange(v)}
        >{v}</button>
      ))}
    </div>
  )
}

function TrendLine({ entries, metricKey }: { entries: HairEntry[]; metricKey: keyof HairEntry }) {
  const pts = [...entries].reverse().filter(e => e[metricKey] != null).slice(-12)
  if (pts.length < 2) return null
  const W = 300, H = 56, pad = 8
  const xs = pts.map((_, i) => pad + (i / (pts.length - 1)) * (W - pad * 2))
  const ys = pts.map(e => H - pad - (((e[metricKey] as number) - 1) / 4) * (H - pad * 2))
  const d = pts.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {[1, 3, 5].map(v => {
        const y = H - pad - ((v - 1) / 4) * (H - pad * 2)
        return <line key={v} x1={pad} x2={W - pad} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5" />
      })}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((_, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r="3" fill="var(--accent)" />
      ))}
    </svg>
  )
}

function PhotoSlot({ label, icon, onFile, url }: {
  label: string; icon: string; path?: string | null; onFile: (f: File) => void; url?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="hair-photo-slot" onClick={() => ref.current?.click()}>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      {url ? (
        <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
      ) : (
        <div className="hair-photo-empty">
          <span style={{ fontSize: 24 }}>{icon}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
        </div>
      )}
    </div>
  )
}

export function HairScreen({ user }: Props) {
  const [entries, setEntries] = useState<HairEntry[]>([])
  const [mode, setMode] = useState<'list' | 'add' | 'compare'>('list')
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  // Form state
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [shedding, setShedding] = useState(3)
  const [density, setDensity] = useState(3)
  const [hairline, setHairline] = useState(3)
  const [scalpNote, setScalpNote] = useState('')
  const [entryNotes, setEntryNotes] = useState('')
  const [photoFiles, setPhotoFiles] = useState<Partial<Record<typeof ANGLES[number]['key'], File>>>({})
  const [saving, setSaving] = useState(false)

  // Compare state
  const [cmpA, setCmpA] = useState<string>('')
  const [cmpB, setCmpB] = useState<string>('')
  const [cmpAngle, setCmpAngle] = useState<typeof ANGLES[number]['key']>('photo_top')

  const reload = useCallback(async () => {
    const data = await loadHairEntries(user.id)
    setEntries(data)
    // Load urls for latest 6
    const urls: Record<string, string> = {}
    for (const e of data.slice(0, 6)) {
      for (const a of ANGLES) {
        const p = e[a.key] as string | null
        if (p) urls[`${e.id}_${a.key}`] = await getPhotoUrl(p)
      }
    }
    setPhotoUrls(urls)
  }, [user.id])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (entries.length >= 2 && !cmpA && !cmpB) {
      setCmpA(entries[0].id)
      setCmpB(entries[Math.min(1, entries.length - 1)].id)
    }
  }, [entries])

  async function handleSave() {
    setSaving(true)
    const photos: Partial<HairEntry> = {}
    for (const a of ANGLES) {
      const f = photoFiles[a.key]
      if (f) {
        const path = await uploadHairPhoto(user.id, f, a.key)
        if (path) photos[a.key] = path
      }
    }
    await saveHairEntry(user.id, {
      date, shedding_level: shedding, density_rating: density,
      hairline_rating: hairline, scalp_note: scalpNote.trim() || null,
      notes: entryNotes.trim() || null, ...photos,
    })
    setPhotoFiles({}); setScalpNote(''); setEntryNotes(''); setMode('list')
    await reload()
    setSaving(false)
  }

  // Compare mode: get URL for an entry+angle
  async function getCmpUrl(entryId: string, angleKey: typeof ANGLES[number]['key']): Promise<string> {
    const key = `${entryId}_${angleKey}`
    if (photoUrls[key]) return photoUrls[key]
    const entry = entries.find(e => e.id === entryId)
    const path = entry?.[angleKey] as string | null
    if (!path) return ''
    const url = await getPhotoUrl(path)
    setPhotoUrls(prev => ({ ...prev, [key]: url }))
    return url
  }

  const entryA = entries.find(e => e.id === cmpA)
  const entryB = entries.find(e => e.id === cmpB)

  return (
    <div className="screen">
      <div className="goals-header">
        <h2>Волосы</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {entries.length >= 2 && (
            <button className="btn-secondary" onClick={() => setMode(m => m === 'compare' ? 'list' : 'compare')}>
              {mode === 'compare' ? 'К списку' : '↔ Сравнить'}
            </button>
          )}
          <button className="btn-primary" onClick={() => setMode(m => m === 'add' ? 'list' : 'add')}>
            {mode === 'add' ? 'Отмена' : '+ Запись'}
          </button>
        </div>
      </div>

      {/* Hint */}
      {entries.length === 0 && mode !== 'add' && (
        <div className="empty-hint">
          <p>Добавляй записи раз в месяц — одни и те же ракурсы, похожий свет.</p>
          <p>Так динамика будет честной и сравнимой.</p>
        </div>
      )}

      {/* Add form */}
      {mode === 'add' && (
        <div className="goals-form">
          <div className="goals-form-row">
            <div className="goals-form-field" style={{ maxWidth: 160 }}>
              <label className="settings-label">Дата</label>
              <input className="log-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ minWidth: 140 }} />
            </div>
          </div>

          <div>
            <div className="settings-label" style={{ marginBottom: 10 }}>Фото по ракурсам</div>
            <div className="hair-photos-row">
              {ANGLES.map(a => (
                <PhotoSlot key={a.key} label={a.label} icon={a.icon} path={null}
                  url={photoFiles[a.key] ? URL.createObjectURL(photoFiles[a.key]!) : undefined}
                  onFile={f => setPhotoFiles(prev => ({ ...prev, [a.key]: f }))} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Совет: то же место, тот же свет, что и в прошлый раз
            </div>
          </div>

          {METRIC_LABELS.map(m => (
            <div key={m.key}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span className="settings-label">{m.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.desc}</span>
              </div>
              <RatingInput
                value={(m.key === 'shedding_level' ? shedding : m.key === 'density_rating' ? density : hairline)}
                onChange={v => m.key === 'shedding_level' ? setShedding(v) : m.key === 'density_rating' ? setDensity(v) : setHairline(v)}
              />
            </div>
          ))}

          <div>
            <label className="settings-label">Кожа головы / заметки</label>
            <textarea className="log-input" rows={2} value={scalpNote} onChange={e => setScalpNote(e.target.value)}
              placeholder="Сухость, перхоть, зуд…" style={{ width: '100%', marginTop: 6, resize: 'vertical' }} />
          </div>
          <div>
            <label className="settings-label">Общая заметка</label>
            <textarea className="log-input" rows={2} value={entryNotes} onChange={e => setEntryNotes(e.target.value)}
              placeholder="Что изменилось, самочувствие, лечение…" style={{ width: '100%', marginTop: 6, resize: 'vertical' }} />
          </div>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить запись'}
          </button>
        </div>
      )}

      {/* Compare mode */}
      {mode === 'compare' && entries.length >= 2 && (
        <div className="hair-compare-wrap">
          <div className="hair-compare-controls">
            <select className="log-input" value={cmpA} onChange={e => setCmpA(e.target.value)}>
              {entries.map(e => <option key={e.id} value={e.id}>{e.date}</option>)}
            </select>
            <span style={{ color: 'var(--text-muted)' }}>vs</span>
            <select className="log-input" value={cmpB} onChange={e => setCmpB(e.target.value)}>
              {entries.map(e => <option key={e.id} value={e.id}>{e.date}</option>)}
            </select>
            <div className="hair-angle-tabs">
              {ANGLES.map(a => (
                <button key={a.key} className={`goals-dur-btn${cmpAngle === a.key ? ' active' : ''}`}
                  onClick={() => setCmpAngle(a.key)}>{a.label}</button>
              ))}
            </div>
          </div>
          <div className="hair-compare-photos">
            {[{ id: cmpA, entry: entryA }, { id: cmpB, entry: entryB }].map(({ id, entry }) => {
              if (!entry) return null
              const urlKey = `${id}_${cmpAngle}`
              const url = photoUrls[urlKey]
              if (!url && (entry[cmpAngle] as string)) getCmpUrl(id, cmpAngle)
              return (
                <div key={id} className="hair-compare-col">
                  <div className="hair-compare-date">{entry.date}</div>
                  {url ? (
                    <img src={url} alt={entry.date} style={{ width: '100%', borderRadius: 12, objectFit: 'cover', aspectRatio: '3/4' }} />
                  ) : (
                    <div className="hair-photo-empty" style={{ aspectRatio: '3/4', borderRadius: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Нет фото</span>
                    </div>
                  )}
                  <div className="hair-compare-metrics">
                    {METRIC_LABELS.map(m => {
                      const v = entry[m.key] as number | null
                      return v != null ? <span key={m.key} style={{ fontSize: 12 }}>{m.label}: <b>{v}/5</b></span> : null
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* List mode */}
      {mode === 'list' && entries.length > 0 && (
        <>
          {/* Trend charts */}
          {entries.length >= 3 && (
            <div className="hair-trends">
              {METRIC_LABELS.map(m => (
                <div key={m.key} className="hair-trend-card">
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{m.label}</div>
                  <TrendLine entries={entries} metricKey={m.key} />
                </div>
              ))}
            </div>
          )}

          <h3 className="goals-section-title">Записи</h3>
          <div className="hair-entries-list">
            {entries.map(e => {
              const topUrl = photoUrls[`${e.id}_photo_top`]
              return (
                <div key={e.id} className="hair-entry-card">
                  {topUrl && <img src={topUrl} alt={e.date} className="hair-entry-thumb" />}
                  <div className="hair-entry-body">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{e.date}</div>
                    <div className="hair-entry-metrics">
                      {e.shedding_level && <span>Выпадение: {e.shedding_level}/5</span>}
                      {e.density_rating && <span>Густота: {e.density_rating}/5</span>}
                      {e.hairline_rating && <span>Линия: {e.hairline_rating}/5</span>}
                    </div>
                    {e.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{e.notes}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
