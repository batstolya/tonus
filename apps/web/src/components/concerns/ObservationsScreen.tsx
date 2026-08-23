import { useState, useCallback, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  loadObservations, addObservation, deleteObservation,
  OBSERVATION_TAGS, OBSERVATION_TAG_LABEL,
  type Observation, type ObservationTag,
} from '../../lib/observations'
import { formatLogTime } from '../../lib/concerns'
import { useT } from '../../lib/i18n'
import { LoadError } from '../ui/LoadError'
import { startEffect } from '../../lib/startEffect'
import { ConcernsSubtabs, type ConcernsTab } from './ConcernsSubtabs'

// Free-form observations: what the user noticed, with a tag and a time, filed
// under nothing. Concerns are for things watched over time on a scale; this is
// the note written in passing that still has to reach the doctor report.
// Spec: docs/superpowers/specs/2026-08-23-observations-design.md

const localDate = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const localTime = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(11, 16)

export function ObservationsScreen({ user, onNavigate }: {
  user: User
  onNavigate?: (tab: ConcernsTab) => void
}) {
  const { t } = useT()
  const [items, setItems] = useState<Observation[]>([])
  const [note, setNote] = useState('')
  const [tag, setTag] = useState<ObservationTag>('other')
  const [date, setDate] = useState(() => localDate(new Date()))
  const [time, setTime] = useState(() => localTime(new Date()))
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const reload = useCallback(async () => {
    try {
      setItems(await loadObservations(user.id))
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [user.id])

  useEffect(() => { startEffect(reload) }, [reload])

  async function handleAdd() {
    const text = note.trim()
    if (!text || saving) return
    setSaving(true)
    const created = await addObservation(user.id, {
      date,
      // An empty time input means the moment is unknown — stored as null so it
      // sorts to the end of its day instead of pretending to be midnight.
      at_time: time || null,
      tag,
      note: text,
    })
    if (created) {
      setItems(prev => [created, ...prev.filter(o => o.id !== created.id)]
        .sort((a, b) => b.date.localeCompare(a.date)
          || formatLogTime(b.at_time).localeCompare(formatLogTime(a.at_time))))
    }
    setNote('')
    const now = new Date()
    setDate(localDate(now))
    setTime(localTime(now))
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setItems(prev => prev.filter(o => o.id !== id))
    await deleteObservation(id)
  }

  // Entries grouped by day, newest day first; inside a day the order comes
  // from the query (latest first, untimed last).
  const byDay: { date: string; entries: Observation[] }[] = []
  for (const o of items) {
    const last = byDay[byDay.length - 1]
    if (last && last.date === o.date) last.entries.push(o)
    else byDay.push({ date: o.date, entries: [o] })
  }

  return (
    <div className="screen">
      {onNavigate && <ConcernsSubtabs active="observations" onNavigate={onNavigate} />}

      <div className="goals-header">
        <h2>{t('Наблюдения')}</h2>
      </div>
      <p className="empty-hint" style={{ marginTop: -8 }}>
        {t('Записи «сегодня заметил, что…» — попадают в отчёт врачу')}
      </p>

      {loadError && <LoadError onRetry={reload} />}

      <div className="obs-form">
        <textarea
          className="log-input obs-note"
          rows={2}
          placeholder={t('Что заметил?')}
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd() }}
        />
        <div className="obs-tags">
          {OBSERVATION_TAGS.map(tg => (
            <button
              key={tg}
              className={`obs-tag${tg === tag ? ' active' : ''}`}
              onClick={() => setTag(tg)}
            >
              {t(OBSERVATION_TAG_LABEL[tg])}
            </button>
          ))}
        </div>
        <div className="obs-form-row">
          <input type="date" className="log-input obs-when" value={date} max={localDate(new Date())}
            onChange={e => setDate(e.target.value)} />
          <input type="time" className="log-input obs-when" value={time}
            onChange={e => setTime(e.target.value)} />
          <button className="btn-primary" onClick={handleAdd} disabled={saving || !note.trim()}>
            {saving ? t('Сохранение…') : t('Добавить')}
          </button>
        </div>
      </div>

      {!items.length && !loadError && (
        <p className="empty-hint">{t('Наблюдений пока нет.')}</p>
      )}

      <div className="obs-list">
        {byDay.map(day => (
          <div key={day.date} className="obs-day">
            <div className="obs-day-date">{day.date}</div>
            {day.entries.map(o => (
              <div key={o.id} className="obs-item">
                <div className="obs-item-head">
                  <span className="obs-item-time">{formatLogTime(o.at_time) || '—'}</span>
                  <span className="obs-item-tag">{t(OBSERVATION_TAG_LABEL[o.tag])}</span>
                  <button className="supp-delete obs-item-del" onClick={() => handleDelete(o.id)} title={t('Удалить')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                  </button>
                </div>
                <div className="obs-item-note">{o.note}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
