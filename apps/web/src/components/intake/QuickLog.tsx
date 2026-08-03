import { useState } from 'react'
import { createIntakeEvent, deleteIntakeEvent, type IntakeEvent } from '../../lib/api/intake'
import { isDemoActive } from '../../lib/demo'
import { demoInsert, demoRemove, demoId } from '../../lib/demoDb'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../lib/i18n'
import { Icon, type IconName } from '../../lib/icons'
import { dayKey, logDays } from '../../lib/intakeDays'

// The icon is a separate field from the label, not the label's first
// character. It used to be baked into the translation key itself (the emoji
// prefixed the Russian word), which is why this was the one screen the icon
// rollout skipped: t() looks the whole string up, so editing a label without
// editing every dictionary would have dropped uk/en users back to the Russian
// source silently.
const EVENT_TYPES: { type: string; icon: IconName; label: string; unit: string | null; defaultAmount: number | null }[] = [
  { type: 'coffee',  icon: 'coffee',        label: 'Кофе',       unit: 'мл', defaultAmount: 200 },
  { type: 'alcohol', icon: 'alcohol',       label: 'Алкоголь',   unit: 'мл', defaultAmount: 150 },
  { type: 'meal',    icon: 'meal',          label: 'Еда',        unit: null, defaultAmount: null },
  { type: 'water',   icon: 'water',         label: 'Вода',       unit: 'мл', defaultAmount: 250 },
  { type: 'meds',    icon: 'meds',          label: 'Лекарства',  unit: null, defaultAmount: null },
  { type: 'workout', icon: 'sportGym',      label: 'Тренировка', unit: null, defaultAmount: null },
  { type: 'illness', icon: 'illness',       label: 'Болезнь',    unit: null, defaultAmount: null },
  { type: 'stress',  icon: 'stressAnxious', label: 'Стресс',     unit: null, defaultAmount: null },
  { type: 'travel',  icon: 'travel',        label: 'Поездка',    unit: null, defaultAmount: null },
  { type: 'custom',  icon: 'note',          label: 'Другое',     unit: null, defaultAmount: null },
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
  const { t, locale } = useT()
  const [open, setOpen] = useState(false)
  const [selectedType, setSelectedType] = useState('coffee')
  const [amount, setAmount] = useState<string>('')
  const [note, setNote] = useState('')
  const [time, setTime] = useState(nowTimeStr)
  const [customDt, setCustomDt] = useState('') // datetime-local: 'YYYY-MM-DDTHH:MM'
  const [saving, setSaving] = useState(false)
  const [dayIndex, setDayIndex] = useState(0)

  const preset = EVENT_TYPES.find(e => e.type === selectedType)!

  function buildTs() {
    if (customDt) return new Date(customDt).toISOString()
    return new Date(`${dayKey(new Date())}T${time}:00`).toISOString()
  }

  function localDtNow() {
    const d = new Date()
    const off = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - off).toISOString().slice(0, 16)
  }

  async function handleAdd() {
    setSaving(true)
    if (isDemoActive()) {
      const row = demoInsert('intake_events', {
        id: demoId('demo-intake'), user_id: user.id, ts: buildTs(), type: selectedType,
        amount: amount ? Number(amount) : preset.defaultAmount,
        unit: preset.unit, note: note || null,
        calories: null, protein_g: null, carbs_g: null, fat_g: null, source: null,
      })
      onEventsChange([row as IntakeEvent, ...events])
      setNote(''); setAmount(''); setTime(nowTimeStr()); setCustomDt(''); setOpen(false); setDayIndex(0)
      setSaving(false)
      return
    }
    const created = await createIntakeEvent(user.id, {
      ts: buildTs(),
      type: selectedType,
      amount: amount ? Number(amount) : preset.defaultAmount,
      unit: preset.unit,
      note: note || null,
    })

    if (created) {
      onEventsChange([created, ...events])
      setNote('')
      setAmount('')
      setTime(nowTimeStr())
      setCustomDt('')
      setOpen(false)
      setDayIndex(0)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (isDemoActive()) demoRemove('intake_events', id)
    else await deleteIntakeEvent(id)
    onEventsChange(events.filter(e => e.id !== id))
  }

  const today = dayKey(new Date())
  const yesterday = dayKey(new Date(new Date().getTime() - 864e5))

  // One day at a time: the whole history at once turned the panel into a wall
  // of rows. days[0] is always today, so dayIndex 0 is the writing day.
  const days = logDays(events, today)
  const viewDay = days[Math.min(dayIndex, days.length - 1)]
  const items = events.filter(e => dayKey(new Date(e.ts)) === viewDay)

  function dayLabel(date: string) {
    if (date === today) return t('Сегодня')
    if (date === yesterday) return t('Вчера')
    return new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  }

  // Caffeine model: 80mg per 200ml, half-life 5.5h
  function caffeineNow(): number {
    const nowMs = new Date().getTime()
    return events
      .filter(e => e.type === 'coffee' && dayKey(new Date(e.ts)) === today)
      .reduce((total, ev) => {
        const dose = ((ev.amount ?? 200) / 200) * 80
        const hoursElapsed = (nowMs - new Date(ev.ts).getTime()) / 3600000
        return total + dose * Math.pow(0.5, hoursElapsed / 5.5)
      }, 0)
  }
  function caffeineAtBedtime(): number {
    const bedtime = new Date(); bedtime.setHours(23, 0, 0, 0)
    const targetMs = bedtime.getTime()
    return events
      .filter(e => e.type === 'coffee' && dayKey(new Date(e.ts)) === today)
      .reduce((total, ev) => {
        const dose = ((ev.amount ?? 200) / 200) * 80
        const hoursElapsed = (targetMs - new Date(ev.ts).getTime()) / 3600000
        if (hoursElapsed < 0) return total
        return total + dose * Math.pow(0.5, hoursElapsed / 5.5)
      }, 0)
  }

  const todayCoffee = events.filter(e => e.type === 'coffee' && dayKey(new Date(e.ts)) === today)
  const cafNow = Math.round(caffeineNow())
  const cafBed = Math.round(caffeineAtBedtime())

  return (
    <div className="quick-log">
      <div className="quick-log-header">
        <h3>{t('Быстрый лог')}</h3>
        <button className="btn-add" onClick={() => setOpen(!open)}>
          {open ? '✕' : t('+ Добавить')}
        </button>
      </div>

      {todayCoffee.length > 0 && cafNow > 10 && (
        <div className="caffeine-bar" title={t('Упрощённая модель: 80мг на 200мл, период полувыведения 5.5ч')}>
          <span className="caffeine-icon"><Icon name="coffee" /></span>
          <span className="caffeine-text">
            {t('Кофеин сейчас')}: <b style={{ color: cafNow > 50 ? 'var(--red)' : cafNow > 25 ? '#f59e0b' : 'var(--green)' }}>{cafNow}{t('мг')}</b>
            {' · '}{t('к 23:00')}: <b style={{ color: cafBed > 30 ? 'var(--red)' : cafBed > 15 ? '#f59e0b' : 'var(--text-muted)' }}>{cafBed}{t('мг')}</b>
            {cafBed > 30 && <span className="caffeine-warn"> {t('— может мешать сну')}</span>}
          </span>
        </div>
      )}

      {open && (
        <div className="quick-log-form">
          <div className="type-grid">
            {EVENT_TYPES.map(et => (
              <button
                key={et.type}
                className={`type-btn${selectedType === et.type ? ' active' : ''}`}
                onClick={() => setSelectedType(et.type)}
              >
                <Icon name={et.icon} /> {t(et.label)}
              </button>
            ))}
          </div>

          <div className="quick-log-inputs">
            {preset.unit && (
              <input
                type="number"
                placeholder={`${preset.defaultAmount ?? ''} ${t(preset.unit)}`}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="log-input"
              />
            )}
            <div className="time-chips">
              {[0, 30, 60, 120, 180].map(mins => {
                const d = new Date(new Date().getTime() - mins * 60000)
                const val = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                const label = mins === 0 ? t('Сейчас') : mins < 60 ? `${mins}${t('м')}` : `${mins/60}${t('ч')}`
                return (
                  <button
                    key={mins}
                    className={`time-chip${!customDt && time === val ? ' active' : ''}`}
                    onClick={() => { setTime(val); setCustomDt('') }}
                    type="button"
                  >
                    <span className="time-chip-main">{label}</span>
                    <span className="time-chip-sub">{val}</span>
                  </button>
                )
              })}
              <button
                className={`time-chip${customDt ? ' active' : ''}`}
                onClick={() => setCustomDt(c => c ? '' : localDtNow())}
                type="button"
              >
                <span className="time-chip-main"><Icon name="calendar" size={14} /> {t('Дата')}</span>
                <span className="time-chip-sub">{t('выбрать')}</span>
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

      <div className="log-day-nav">
        <button
          type="button"
          className="log-day-arrow"
          onClick={() => setDayIndex(i => i + 1)}
          disabled={dayIndex >= days.length - 1}
          aria-label={t('Предыдущий день')}
        >‹</button>
        <span className="log-day-label">{dayLabel(viewDay)}</span>
        <button
          type="button"
          className="log-day-arrow"
          onClick={() => setDayIndex(i => Math.max(0, i - 1))}
          disabled={dayIndex === 0}
          aria-label={t('Следующий день')}
        >›</button>
      </div>

      <div className="log-today">
        {items.length === 0 && <p className="log-day-empty">{t('Пока ничего не записано')}</p>}
        {items.map(ev => {
            const et = EVENT_TYPES.find(x => x.type === ev.type)
            return (
              <div key={ev.id} className="log-item">
                <span className="log-item-icon">{et && <Icon name={et.icon} />}</span>
                <span className="log-item-text">
                  {et ? t(et.label) : ''}
                  {ev.amount ? ` — ${ev.amount}${ev.unit ?? ''}` : ''}
                  {ev.note ? ` · ${ev.note}` : ''}
                </span>
                <span className="log-item-time">
                  {new Date(ev.ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button className="log-delete" onClick={() => handleDelete(ev.id)}>×</button>
              </div>
            )
        })}
      </div>
    </div>
  )
}
