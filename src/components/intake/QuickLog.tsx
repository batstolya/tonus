import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../lib/i18n'

interface IntakeEvent {
  id: string
  ts: string
  type: string
  amount: number | null
  unit: string | null
  note: string | null
}

const EVENT_TYPES = [
  { type: 'coffee', label: '☕ Кофе', unit: 'мл', defaultAmount: 200 },
  { type: 'alcohol', label: '🍷 Алкоголь', unit: 'мл', defaultAmount: 150 },
  { type: 'meal', label: '🍽 Еда', unit: null, defaultAmount: null },
  { type: 'water', label: '💧 Вода', unit: 'мл', defaultAmount: 250 },
  { type: 'meds', label: '💊 Лекарства', unit: null, defaultAmount: null },
  { type: 'workout', label: '🏋️ Тренировка', unit: null, defaultAmount: null },
  { type: 'illness', label: '🤒 Болезнь', unit: null, defaultAmount: null },
  { type: 'stress', label: '😰 Стресс', unit: null, defaultAmount: null },
  { type: 'travel', label: '🧳 Поездка', unit: null, defaultAmount: null },
  { type: 'custom', label: '📝 Другое', unit: null, defaultAmount: null },
]

interface Props {
  user: User
  events: IntakeEvent[]
  onEventsChange: (events: IntakeEvent[]) => void
}

function nowTimeStr() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export function QuickLog({ user, events, onEventsChange }: Props) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [selectedType, setSelectedType] = useState('coffee')
  const [amount, setAmount] = useState<string>('')
  const [note, setNote] = useState('')
  const [time, setTime] = useState(nowTimeStr)
  const [customDt, setCustomDt] = useState('') // datetime-local: 'YYYY-MM-DDTHH:MM'
  const [saving, setSaving] = useState(false)

  const preset = EVENT_TYPES.find(e => e.type === selectedType)!

  function buildTs() {
    if (customDt) return new Date(customDt).toISOString()
    const today = new Date().toISOString().slice(0, 10)
    return new Date(`${today}T${time}:00`).toISOString()
  }

  function localDtNow() {
    const d = new Date()
    const off = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - off).toISOString().slice(0, 16)
  }

  async function handleAdd() {
    setSaving(true)
    const { data, error } = await supabase.from('intake_events').insert({
      user_id: user.id,
      ts: buildTs(),
      type: selectedType,
      amount: amount ? Number(amount) : preset.defaultAmount,
      unit: preset.unit,
      note: note || null,
    }).select().single()

    if (!error && data) {
      onEventsChange([data as IntakeEvent, ...events])
      setNote('')
      setAmount('')
      setTime(nowTimeStr())
      setCustomDt('')
      setOpen(false)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('intake_events').delete().eq('id', id)
    onEventsChange(events.filter(e => e.id !== id))
  }

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)

  // Group events by date, show last 3 days
  const recentDays = [today, yesterday, new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)]
  const grouped = recentDays
    .map(date => ({ date, items: events.filter(e => e.ts.slice(0, 10) === date) }))
    .filter(g => g.items.length > 0)

  function dayLabel(date: string) {
    if (date === today) return 'Сегодня'
    if (date === yesterday) return t('Вчера')
    return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="quick-log">
      <div className="quick-log-header">
        <h3>{t('Быстрый лог')}</h3>
        <button className="btn-add" onClick={() => setOpen(!open)}>
          {open ? '✕' : t('+ Добавить')}
        </button>
      </div>

      {open && (
        <div className="quick-log-form">
          <div className="type-grid">
            {EVENT_TYPES.map(et => (
              <button
                key={et.type}
                className={`type-btn${selectedType === et.type ? ' active' : ''}`}
                onClick={() => setSelectedType(et.type)}
              >
                {t(et.label)}
              </button>
            ))}
          </div>

          <div className="quick-log-inputs">
            {preset.unit && (
              <input
                type="number"
                placeholder={`${preset.defaultAmount ?? ''} ${preset.unit}`}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="log-input"
              />
            )}
            <div className="time-chips">
              {[0, 30, 60, 120, 180].map(mins => {
                const d = new Date(Date.now() - mins * 60000)
                const val = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                const label = mins === 0 ? t('Сейчас') : mins < 60 ? `${mins}${t('м_сокр')}` : `${mins/60}${t('ч_сокр')}`
                return (
                  <button
                    key={mins}
                    className={`time-chip${!customDt && time === val ? ' active' : ''}`}
                    onClick={() => { setTime(val); setCustomDt('') }}
                    type="button"
                  >
                    {label}<span className="time-chip-sub">{val}</span>
                  </button>
                )
              })}
              <button
                className={`time-chip${customDt ? ' active' : ''}`}
                onClick={() => setCustomDt(c => c ? '' : localDtNow())}
                type="button"
              >
                📅 {t('Дата')}<span className="time-chip-sub">{t('выбрать')}</span>
              </button>
            </div>
            {customDt && (
              <input
                type="datetime-local"
                className="log-input"
                value={customDt}
                max={localDtNow()}
                onChange={e => setCustomDt(e.target.value)}
              />
            )}
            <input
              type="text"
              placeholder={t('Заметка (необязательно)')}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="log-input"
            />
            <button className="btn-primary" onClick={handleAdd} disabled={saving}>
              {saving ? '…' : t('Записать')}
            </button>
          </div>
        </div>
      )}

      {grouped.map(({ date, items }) => (
        <div key={date} className="log-today">
          <p className="log-today-label">{dayLabel(date)}</p>
          {items.map(ev => {
            const et = EVENT_TYPES.find(x => x.type === ev.type)
            const etLabel = et ? t(et.label) : ''
            return (
              <div key={ev.id} className="log-item">
                <span className="log-item-icon">{etLabel.split(' ')[0]}</span>
                <span className="log-item-text">
                  {etLabel.slice(etLabel.indexOf(' ') + 1)}
                  {ev.amount ? ` — ${ev.amount}${ev.unit ?? ''}` : ''}
                  {ev.note ? ` · ${ev.note}` : ''}
                </span>
                <span className="log-item-time">
                  {new Date(ev.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button className="log-delete" onClick={() => handleDelete(ev.id)}>×</button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
