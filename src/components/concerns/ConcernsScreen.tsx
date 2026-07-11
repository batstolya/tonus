import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  loadAllConcerns, addConcern, updateConcern,
  loadLogs, addLog, deleteLog, uploadConcernPhoto, getPhotoUrl,
  CATEGORIES, STATUS_LABELS,
  type HealthConcern, type ConcernLog,
} from '../../lib/concerns'
import { LoadError } from '../ui/LoadError'
import { useT } from '../../lib/i18n'
import { isMasked, loadPinHash, unlock } from '../../lib/privacy'

interface Props { user: User; onNavigateHair?: () => void }

const SEVERITY_LABELS = ['', '1 — Почти нет', '2 — Слабо', '3 — Умеренно', '4 — Сильно', '5 — Очень сильно']
const SEVERITY_COLOR = ['', 'var(--green)', '#84cc16', '#f59e0b', '#f97316', 'var(--red)']

function SeverityDot({ v }: { v: number }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: SEVERITY_COLOR[v] ?? 'var(--border)', flexShrink: 0 }} />
}

function TrendChart({ logs }: { logs: ConcernLog[] }) {
  const pts = logs.filter(l => l.severity).slice(-20)
  if (pts.length < 2) return null
  const W = 280, H = 60, pad = 8
  const xs = pts.map((_, i) => pad + (i / (pts.length - 1)) * (W - pad * 2))
  const ys = pts.map(l => H - pad - ((l.severity! - 1) / 4) * (H - pad * 2))
  const d = pts.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: W }}>
      {[1, 2, 3, 4, 5].map(v => {
        const y = H - pad - ((v - 1) / 4) * (H - pad * 2)
        return <line key={v} x1={pad} x2={W - pad} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5" />
      })}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((l, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r="3.5" fill={SEVERITY_COLOR[l.severity!]} />
      ))}
    </svg>
  )
}

function ConcernDetail({ concern, userId, onBack, onUpdate }: {
  concern: HealthConcern; userId: string; onBack: () => void; onUpdate: (c: HealthConcern) => void
}) {
  const { t } = useT()
  const [logs, setLogs] = useState<ConcernLog[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [severity, setSeverity] = useState(3)
  const [note, setNote] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  const reload = useCallback(async () => {
    const l = await loadLogs(concern.id)
    setLogs(l)
    const urls: Record<string, string> = {}
    for (const entry of l) {
      if (entry.photo_path) urls[entry.id] = await getPhotoUrl(entry.photo_path)
    }
    setPhotoUrls(urls)
  }, [concern.id])

  useEffect(() => { reload() }, [reload])

  async function handleSave() {
    setSaving(true)
    let photo_path: string | null = null
    if (photoFile) photo_path = await uploadConcernPhoto(userId, photoFile)
    await addLog(userId, {
      concern_id: concern.id, date: new Date().toISOString().slice(0, 10),
      severity, note: note.trim() || null, photo_path,
    })
    setNote(''); setPhotoFile(null); setSeverity(3)
    await reload()
    setSaving(false)
  }

  async function handleStatusChange(status: HealthConcern['status']) {
    await updateConcern(concern.id, { status })
    onUpdate({ ...concern, status })
  }

  return (
    <div>
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
        ← {t('Назад')}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>{concern.name}</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t(CATEGORIES[concern.category] ?? concern.category)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['active', 'improving', 'resolved'] as const).map(s => (
            <button key={s}
              className={concern.status === s ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: 12, padding: '5px 12px', ...(concern.status === s ? { background: STATUS_LABELS[s].color, borderColor: STATUS_LABELS[s].color } : {}) }}
              onClick={() => handleStatusChange(s)}
            >
              {t(STATUS_LABELS[s].label)}
            </button>
          ))}
        </div>
      </div>

      {logs.length >= 2 && (
        <div className="concern-chart-wrap">
          <div className="concern-chart-label">{t('Динамика выраженности')}</div>
          <TrendChart logs={logs} />
        </div>
      )}

      {/* Add log */}
      <div className="concern-log-form">
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{t('Новое наблюдение')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('Выраженность:')}</span>
          {[1, 2, 3, 4, 5].map(v => (
            <button key={v} className={`severity-btn${severity === v ? ' active' : ''}`}
              style={{ '--sev-color': SEVERITY_COLOR[v] } as any}
              onClick={() => setSeverity(v)}
            >
              {v}
            </button>
          ))}
          <span style={{ fontSize: 12, color: SEVERITY_COLOR[severity] }}>{t(SEVERITY_LABELS[severity])}</span>
        </div>
        <textarea className="log-input" rows={2} placeholder={t('Заметка (необязательно)…')}
          value={note} onChange={e => setNote(e.target.value)}
          style={{ width: '100%', marginBottom: 10, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="btn-secondary" style={{ cursor: 'pointer', fontSize: 13 }}>
            📷 {photoFile ? photoFile.name : t('Фото')}
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} />
          </label>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('Сохранение…') : t('Добавить')}
          </button>
        </div>
      </div>

      {/* Log list */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{t('Журнал наблюдений')}</span>
          {logs.length > 5 && (
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowResolved(s => !s)}>
              {showResolved ? t('Показать последние') : `${t('Все')} ${logs.length}`}
            </button>
          )}
        </div>
        {(showResolved ? logs : logs.slice(-5)).reverse().map(l => (
          <div key={l.id} className="concern-log-item">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {l.severity && <SeverityDot v={l.severity} />}
              <span style={{ fontSize: 13, fontWeight: 600 }}>{l.date}</span>
              {l.severity && <span style={{ fontSize: 12, color: SEVERITY_COLOR[l.severity] }}>{l.severity}/5</span>}
              <button className="supp-delete" style={{ marginLeft: 'auto' }}
                onClick={() => { deleteLog(l.id); setLogs(ls => ls.filter(x => x.id !== l.id)) }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
              </button>
            </div>
            {l.note && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, paddingLeft: 18 }}>{l.note}</div>}
            {photoUrls[l.id] && (
              <img src={photoUrls[l.id]} alt="фото" style={{ marginTop: 8, maxWidth: 200, borderRadius: 8, paddingLeft: 18 }} />
            )}
          </div>
        ))}
        {logs.length === 0 && <p className="empty-hint">{t('Наблюдений пока нет.')}</p>}
      </div>
    </div>
  )
}

export function ConcernsScreen({ user, onNavigateHair }: Props) {
  const { t } = useT()
  const [concerns, setConcerns] = useState<HealthConcern[]>([])
  const [selected, setSelected] = useState<HealthConcern | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('skin')
  const [startedAt, setStartedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [saving, setSaving] = useState(false)

  // Приватность: PIN задан? какая карточка ждёт разблокировки?
  const [pinSet, setPinSet] = useState(false)
  const [unlockFor, setUnlockFor] = useState<HealthConcern | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)

  const [loadError, setLoadError] = useState(false)
  const reload = useCallback(async () => {
    try {
      const [cs, hash] = await Promise.all([loadAllConcerns(user.id), loadPinHash(user.id)])
      setConcerns(cs)
      setPinSet(!!hash)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [user.id])

  useEffect(() => { reload() }, [reload])

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true)
    const c = await addConcern(user.id, {
      name: name.trim(), category, status: 'active',
      started_at: startedAt || null, notes: notes.trim() || null,
      is_private: isPrivate && pinSet,
    })
    if (c) setConcerns(prev => [c, ...prev])
    setName(''); setNotes(''); setStartedAt(''); setIsPrivate(false); setShowForm(false)
    setSaving(false)
  }

  async function handleUnlock() {
    if (await unlock(user.id, pinInput)) {
      const c = unlockFor
      setUnlockFor(null); setPinInput(''); setPinError(false)
      if (c) setSelected(c)
    } else {
      setPinError(true)
    }
  }

  if (selected) {
    return <ConcernDetail
      concern={selected}
      userId={user.id}
      onBack={() => { setSelected(null); reload() }}
      onUpdate={c => setSelected(c)}
    />
  }

  const active = concerns.filter(c => c.status !== 'resolved')
  const resolved = concerns.filter(c => c.status === 'resolved')

  return (
    <div className="screen">
      {onNavigateHair && (
        <div className="concerns-subtabs">
          <button className="concerns-subtab active">{t('Проблемы')}</button>
          <button className="concerns-subtab" onClick={onNavigateHair}>{t('Волосы')}</button>
        </div>
      )}
      <div className="goals-header">
        <h2>{t('Проблемы и симптомы')}</h2>
        <button className="btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? t('Отмена') : t('+ Добавить')}
        </button>
      </div>

      {loadError && <LoadError onRetry={reload} />}

      {showForm && (
        <div className="goals-form" style={{ marginBottom: 24 }}>
          <div className="goals-form-row">
            <div className="goals-form-field">
              <label className="settings-label">{t('Название')}</label>
              <input className="log-input" placeholder={t('Напр. Прыщи на спине')} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            </div>
            <div className="goals-form-field">
              <label className="settings-label">{t('Категория')}</label>
              <select className="log-input" value={category} onChange={e => setCategory(e.target.value)}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
              </select>
            </div>
          </div>
          <div className="goals-form-row">
            <div className="goals-form-field">
              <label className="settings-label">{t('Началось (приблизительно)')}</label>
              <input className="log-input" type="date" value={startedAt} onChange={e => setStartedAt(e.target.value)} style={{ minWidth: 140 }} />
            </div>
            <div className="goals-form-field">
              <label className="settings-label">{t('Заметка')}</label>
              <input className="log-input" placeholder={t('Необязательно')} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: pinSet ? 'pointer' : 'default', opacity: pinSet ? 1 : 0.6 }}>
            <input type="checkbox" checked={isPrivate && pinSet} disabled={!pinSet}
              onChange={e => setIsPrivate(e.target.checked)} />
            🔒 {t('Приватная — скрывать за PIN')}
            {!pinSet && <span className="settings-muted" style={{ fontSize: 12 }}>({t('сначала задай PIN в Настройках')})</span>}
          </label>
          <button className="btn-primary" onClick={handleAdd} disabled={saving || !name.trim()}>
            {saving ? t('Сохранение…') : t('Добавить проблему')}
          </button>
        </div>
      )}

      {active.length === 0 && !showForm && !loadError && (
        <p className="empty-hint">{t('Проблем не добавлено. Нажми «+ Добавить» чтобы начать отслеживать.')}</p>
      )}

      {unlockFor && (
        <div className="goals-form" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>🔒 {t('Введи PIN, чтобы открыть запись')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="log-input" type="password" inputMode="numeric" autoFocus
              placeholder="PIN" value={pinInput} style={{ width: 120 }}
              onChange={e => { setPinInput(e.target.value); setPinError(false) }}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()} />
            <button className="btn-primary" onClick={handleUnlock} disabled={!pinInput}>{t('Открыть')}</button>
            <button className="btn-ghost" onClick={() => { setUnlockFor(null); setPinInput('') }}>{t('Отмена')}</button>
          </div>
          {pinError && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{t('Неверный PIN')}</p>}
        </div>
      )}

      <div className="concerns-list">
        {active.map(c => {
          const masked = isMasked(c.is_private, pinSet)
          return (
            <button key={c.id} className={`concern-card${masked ? ' concern-card-masked' : ''}`}
              onClick={() => masked ? (setUnlockFor(c), setPinError(false)) : setSelected(c)}>
              <div className="concern-card-top">
                <span className="concern-name">{masked ? `🔒 ${t('Скрытая запись')}` : <>{c.is_private && '🔒 '}{c.name}</>}</span>
                {!masked && (
                  <span className="concern-status" style={{ color: STATUS_LABELS[c.status]?.color }}>
                    {t(STATUS_LABELS[c.status]?.label ?? '')}
                  </span>
                )}
              </div>
              <div className="concern-card-bottom">
                {masked
                  ? <span className="concern-cat">{t('Нажми, чтобы ввести PIN')}</span>
                  : <>
                      <span className="concern-cat">{t(CATEGORIES[c.category] ?? c.category)}</span>
                      {c.started_at && <span className="concern-since">{t('с')} {c.started_at}</span>}
                    </>}
                <span className="concern-arrow">›</span>
              </div>
            </button>
          )
        })}
      </div>

      {resolved.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button className="btn-ghost" style={{ fontSize: 13, marginBottom: 8 }} onClick={() => setShowResolved(s => !s)}>
            {showResolved ? t('Скрыть решённые') : `${t('Решённые')} (${resolved.length})`}
          </button>
          {showResolved && (
            <div className="concerns-list">
              {resolved.map(c => {
                const masked = isMasked(c.is_private, pinSet)
                return (
                  <button key={c.id} className={`concern-card resolved${masked ? ' concern-card-masked' : ''}`}
                    onClick={() => masked ? (setUnlockFor(c), setPinError(false)) : setSelected(c)}>
                    <div className="concern-card-top">
                      <span className="concern-name">{masked ? `🔒 ${t('Скрытая запись')}` : c.name}</span>
                      {!masked && (
                        <span className="concern-status" style={{ color: STATUS_LABELS[c.status]?.color }}>
                          {STATUS_LABELS[c.status]?.label}
                        </span>
                      )}
                    </div>
                    <div className="concern-card-bottom">
                      <span className="concern-cat">{masked ? t('Нажми, чтобы ввести PIN') : (CATEGORIES[c.category] ?? c.category)}</span>
                      <span className="concern-arrow">›</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
