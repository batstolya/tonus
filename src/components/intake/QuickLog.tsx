import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'

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
  { type: 'custom', label: '📝 Другое', unit: null, defaultAmount: null },
]

interface Props {
  user: User
  events: IntakeEvent[]
  onEventsChange: (events: IntakeEvent[]) => void
}

export function QuickLog({ user, events, onEventsChange }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedType, setSelectedType] = useState('coffee')
  const [amount, setAmount] = useState<string>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const preset = EVENT_TYPES.find(e => e.type === selectedType)!

  async function handleAdd() {
    setSaving(true)
    const { data, error } = await supabase.from('intake_events').insert({
      user_id: user.id,
      ts: new Date().toISOString(),
      type: selectedType,
      amount: amount ? Number(amount) : preset.defaultAmount,
      unit: preset.unit,
      note: note || null,
    }).select().single()

    if (!error && data) {
      onEventsChange([data as IntakeEvent, ...events])
      setNote('')
      setAmount('')
      setOpen(false)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('intake_events').delete().eq('id', id)
    onEventsChange(events.filter(e => e.id !== id))
  }

  const today = new Date().toISOString().slice(0, 10)
  const todayEvents = events.filter(e => e.ts.slice(0, 10) === today)

  return (
    <div className="quick-log">
      <div className="quick-log-header">
        <h3>Быстрый лог</h3>
        <button className="btn-add" onClick={() => setOpen(!open)}>
          {open ? '✕' : '+ Добавить'}
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
                {et.label}
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
            <input
              type="text"
              placeholder="Заметка (необязательно)"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="log-input"
            />
            <button className="btn-primary" onClick={handleAdd} disabled={saving}>
              {saving ? '…' : 'Записать'}
            </button>
          </div>
        </div>
      )}

      {todayEvents.length > 0 && (
        <div className="log-today">
          <p className="log-today-label">Сегодня</p>
          {todayEvents.map(ev => {
            const et = EVENT_TYPES.find(t => t.type === ev.type)
            return (
              <div key={ev.id} className="log-item">
                <span className="log-item-icon">{et?.label.split(' ')[0]}</span>
                <span className="log-item-text">
                  {et?.label.slice(et.label.indexOf(' ') + 1)}
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
      )}
    </div>
  )
}
