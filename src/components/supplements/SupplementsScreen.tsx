import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  loadSupplements, addSupplement, deleteSupplement, updateStock,
  loadLogsForMonth, toggleLog,
  loadReminders, saveReminder,
  type Supplement, type SupplementLog, type ReminderSetting,
} from '../../lib/supplements'
import { useT } from '../../lib/i18n'
import { describeNextReminder } from '../../lib/reminderTime'
import { TreatmentTracker } from './TreatmentTracker'
import { SupplementSchedule } from './SupplementSchedule'
import { AdherenceBlock } from './AdherenceBlock'
import { LoadError } from '../ui/LoadError'

interface Props {
  user: User
}

const DAYS_OF_WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month - 1, 1)
  while (d.getMonth() === month - 1) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function compliance(logs: SupplementLog[], supplementId: string, days: Date[]): number {
  const taken = days.filter(d => {
    const ds = toDateStr(d)
    return logs.some(l => l.supplement_id === supplementId && l.date === ds && l.taken)
  }).length
  return days.length ? Math.round((taken / days.length) * 100) : 0
}

export function SupplementsScreen({ user }: Props) {
  const { t, locale } = useT()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [supplements, setSupplements] = useState<Supplement[]>([])
  const [logs, setLogs] = useState<SupplementLog[]>([])
  const [newName, setNewName] = useState('')
  const [newDose, setNewDose] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingStock, setEditingStock] = useState<string | null>(null)
  const [stockInput, setStockInput] = useState('')
  const [stockError, setStockError] = useState<string | null>(null)
  const [reminders, setReminders] = useState<Record<string, ReminderSetting>>({})
  const [remOpen, setRemOpen] = useState<string | null>(null)
  const [remError, setRemError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const days = getDaysInMonth(year, month)
  const todayStr = toDateStr(now)

  const reload = useCallback(async () => {
    try {
      const [sups, ls] = await Promise.all([
        loadSupplements(user.id),
        loadLogsForMonth(user.id, year, month),
      ])
      setSupplements(sups)
      setLogs(ls)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [user.id, year, month])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    loadReminders(user.id).then(setReminders).catch(() => {})
  }, [user.id])

  async function handleReminderSave(supplementId: string, patch: Partial<ReminderSetting>) {
    const prev = reminders[supplementId] ?? { supplement_id: supplementId, times: [], weekdays: [1,2,3,4,5,6,7], timezone: '', quiet_until: null, enabled: true }
    const next = { ...prev, ...patch }
    setReminders(r => ({ ...r, [supplementId]: next }))
    const ok = await saveReminder(user.id, supplementId, patch)
    if (!ok) setRemError('Запусти миграцию reminders.sql в Supabase SQL Editor')
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
  }

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    const sup = await addSupplement(user.id, newName.trim(), newDose.trim() || undefined, newUnit.trim() || undefined)
    if (sup) setSupplements(prev => [...prev, sup])
    setNewName(''); setNewDose(''); setNewUnit(''); setShowForm(false)
    setAdding(false)
  }

  async function handleStock(id: string, delta: number) {
    const sup = supplements.find(s => s.id === id)!
    const next = Math.max(0, (sup.stock_count ?? 0) + delta)
    setSupplements(prev => prev.map(s => s.id === id ? { ...s, stock_count: next } : s))
    const ok = await updateStock(id, next)
    if (!ok) setStockError('Запусти SQL: alter table supplements add column if not exists stock_count integer default null;')
  }

  async function handleStockSet(id: string) {
    const val = parseInt(stockInput)
    if (!isNaN(val) && val >= 0) {
      setSupplements(prev => prev.map(s => s.id === id ? { ...s, stock_count: val } : s))
      const ok = await updateStock(id, val)
      if (!ok) setStockError('Запусти SQL: alter table supplements add column if not exists stock_count integer default null;')
    }
    setEditingStock(null)
    setStockInput('')
  }

  async function handleDelete(id: string) {
    await deleteSupplement(id)
    setSupplements(prev => prev.filter(s => s.id !== id))
  }

  async function handleToggle(supplementId: string, date: string) {
    const existing = logs.find(l => l.supplement_id === supplementId && l.date === date && l.taken)
    const nextTaken = !existing
    setLogs(prev => {
      const filtered = prev.filter(l => !(l.supplement_id === supplementId && l.date === date))
      if (nextTaken) return [...filtered, { id: crypto.randomUUID(), supplement_id: supplementId, date, taken: true, dose: null, note: null }]
      return filtered
    })
    await toggleLog(user.id, supplementId, date, nextTaken)

    // Auto-decrement stock when marking as taken (only for today)
    if (nextTaken && date === todayStr) {
      const sup = supplements.find(s => s.id === supplementId)
      if (sup && sup.stock_count !== null && sup.stock_count > 0) {
        const next = sup.stock_count - 1
        setSupplements(prev => prev.map(s => s.id === supplementId ? { ...s, stock_count: next } : s))
        await updateStock(supplementId, next)
      }
    }
  }

  const monthName = new Date(year, month - 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  // Calculate first day offset (Monday = 0)
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7

  return (
    <div className="screen">
      <div className="supp-header">
        <h2>{t('Препараты и добавки')}</h2>
        <button className="btn-primary" onClick={() => setShowForm(s => !s)}>{t('+ Добавить')}</button>
      </div>

      {loadError && <LoadError onRetry={reload} />}

      {showForm && (
        <div className="supp-form">
          <input
            className="supp-input"
            placeholder={t('Название (напр. Витамин D)')}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <input
            className="supp-input supp-input-sm"
            placeholder={t('Доза (напр. 5000)')}
            value={newDose}
            onChange={e => setNewDose(e.target.value)}
          />
          <input
            className="supp-input supp-input-sm"
            placeholder={t('Ед. (напр. IU)')}
            value={newUnit}
            onChange={e => setNewUnit(e.target.value)}
          />
          <button className="btn-primary" onClick={handleAdd} disabled={adding || !newName.trim()}>
            {adding ? '…' : t('Сохранить')}
          </button>
          <button className="btn-ghost" onClick={() => setShowForm(false)}>{t('Отмена')}</button>
        </div>
      )}

      {supplements.length === 0 && !showForm && (
        !loadError && <p className="empty-hint">{t('Нет препаратов. Нажми «+ Добавить» чтобы начать.')}</p>
      )}

      {stockError && (
        <div className="auth-error" style={{ marginBottom: 12, fontSize: 13 }}>
          ⚠️ {t('Колонка не найдена в БД. Запусти в Supabase SQL Editor:')}<br/>
          <code style={{ fontSize: 11 }}>alter table supplements add column if not exists stock_count integer default null;</code>
          <button style={{ marginLeft: 8, fontSize: 11, cursor: 'pointer' }} onClick={() => setStockError(null)}>✕</button>
        </div>
      )}

      {remError && (
        <div className="auth-error" style={{ marginBottom: 12, fontSize: 13 }}>
          ⚠️ {remError}
          <button style={{ marginLeft: 8, fontSize: 11, cursor: 'pointer' }} onClick={() => setRemError(null)}>✕</button>
        </div>
      )}

      {supplements.length > 0 && (
        <div className="supp-stock-panel">
          <div className="supp-stock-title">{t('Запасы')}</div>
          <div className="supp-stock-grid">
            {supplements.map(sup => {
              const stock = sup.stock_count
              const low = stock !== null && stock <= 7
              return (
                <div key={sup.id} className={`supp-stock-item${low ? ' low' : ''}`}>
                  <div className="supp-stock-info">
                    <div className="supp-stock-name">{sup.name}</div>
                    <div className="supp-stock-dose">{sup.default_dose ? `${sup.default_dose}${sup.unit ? ` ${sup.unit}` : ''}` : ''}</div>
                    {low && <div className="supp-stock-warn">⚠ {t('Заканчивается')}</div>}
                  </div>
                  <div className="supp-stock-split">
                    <button
                      className="supp-split-half supp-split-minus"
                      onClick={() => handleStock(sup.id, -1)}
                      disabled={(stock ?? 0) <= 0}
                    >
                      <span className="supp-split-sign">−</span>
                    </button>
                    <div
                      className="supp-split-center"
                      onClick={() => { setEditingStock(sup.id); setStockInput(String(stock ?? 0)) }}
                      title={t('Нажми чтобы ввести вручную')}
                    >
                      {editingStock === sup.id ? (
                        <input
                          className="supp-stock-input"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={stockInput}
                          autoFocus
                          onChange={e => setStockInput(e.target.value.replace(/\D/g, ''))}
                          onBlur={() => handleStockSet(sup.id)}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => { if (e.key === 'Enter') handleStockSet(sup.id); if (e.key === 'Escape') { setEditingStock(null); setStockInput('') } }}
                        />
                      ) : (
                        <span className="supp-split-count">{stock === null ? '—' : stock}<span className="supp-stock-unit">{t('шт')}</span></span>
                      )}
                    </div>
                    <button
                      className="supp-split-half supp-split-plus"
                      onClick={() => handleStock(sup.id, +1)}
                    >
                      <span className="supp-split-sign">+</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 🕐 Идеальное время приёма — AI schedule ───────────── */}
      <AdherenceBlock supplements={supplements} />

      <SupplementSchedule user={user} supplements={supplements} />

      <div className="supp-month-nav">
        <button className="preset" onClick={prevMonth}>‹</button>
        <span className="supp-month-label">{monthName}</span>
        <button className="preset" onClick={nextMonth}>›</button>
      </div>

      {supplements.map(sup => {
        const pct = compliance(logs, sup.id, days)
        return (
          <div key={sup.id} className="supp-card">
            <div className="supp-card-header">
              <div>
                <span className="supp-name">{sup.name}</span>
                {sup.default_dose && (
                  <span className="supp-dose">{sup.default_dose} {sup.unit}</span>
                )}
              </div>
              <div className="supp-card-actions">
                <span className={`supp-pct ${pct >= 80 ? 'good' : pct >= 50 ? 'ok' : 'bad'}`}>{pct}%</span>
                <button
                  className={`supp-bell${reminders[sup.id]?.enabled && reminders[sup.id]?.times.length ? ' active' : ''}`}
                  onClick={() => setRemOpen(o => o === sup.id ? null : sup.id)}
                  title={t('Напоминания')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                </button>
                <button className="supp-delete" onClick={() => handleDelete(sup.id)} title={t('Удалить')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            </div>

            {remOpen === sup.id && (
              <ReminderEditor
                setting={reminders[sup.id]}
                onSave={patch => handleReminderSave(sup.id, patch)}
              />
            )}

            <div className="supp-grid">
              {/* Day-of-week headers */}
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="supp-dow">{t(d)}</div>
              ))}
              {/* Empty cells before first day */}
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`empty-${i}`} className="supp-cell empty" />
              ))}
              {/* Day cells */}
              {days.map(day => {
                const ds = toDateStr(day)
                const taken = logs.some(l => l.supplement_id === sup.id && l.date === ds && l.taken)
                const isToday = ds === todayStr
                const isFuture = ds > todayStr
                return (
                  <button
                    key={ds}
                    className={`supp-cell${taken ? ' taken' : ''}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}`}
                    onClick={() => !isFuture && handleToggle(sup.id, ds)}
                    title={ds}
                    disabled={isFuture}
                  >
                    <span className="supp-day-num">{day.getDate()}</span>
                    {taken && (
                      <svg className="supp-check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* ── 🔬 Работает ли? — Treatment tracker ───────────────── */}
      <TreatmentTracker user={user} />
    </div>
  )
}

// ── Reminder editor ──────────────────────────────────────────────────────────

const WD = [['Пн',1],['Вт',2],['Ср',3],['Чт',4],['Пт',5],['Сб',6],['Вс',7]] as const

function ReminderEditor({ setting, onSave }: {
  setting?: ReminderSetting
  onSave: (patch: Partial<ReminderSetting>) => void
}) {
  const { t } = useT()
  const times = setting?.times ?? []
  const weekdays = setting?.weekdays ?? [1,2,3,4,5,6,7]
  const enabled = setting?.enabled ?? true
  const quietUntil = setting?.quiet_until ?? ''
  const [newTime, setNewTime] = useState('22:00')

  function addTime() {
    if (!/^\d{2}:\d{2}$/.test(newTime) || times.includes(newTime)) return
    onSave({ times: [...times, newTime].sort() })
  }
  function removeTime(t: string) {
    onSave({ times: times.filter(x => x !== t) })
  }
  function toggleWd(d: number) {
    const next = weekdays.includes(d) ? weekdays.filter(x => x !== d) : [...weekdays, d].sort()
    onSave({ weekdays: next })
  }

  return (
    <div className="rem-editor">
      <div className="rem-row">
        <label className="rem-toggle">
          <input type="checkbox" checked={enabled} onChange={e => onSave({ enabled: e.target.checked })} />
          <span>{t('Напоминать в Telegram')}</span>
        </label>
      </div>

      <div className="rem-times">
        {times.map(tm => (
          <span key={tm} className="rem-time-chip">
            {tm}
            <button onClick={() => removeTime(tm)} title={t('Убрать')}>✕</button>
          </span>
        ))}
        <span className="rem-time-add">
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} />
          <button onClick={addTime}>+ {t('время')}</button>
        </span>
      </div>

      {enabled && times.length > 0 && (() => {
        const next = describeNextReminder(times, weekdays)
        if (!next) return null
        const label = next.offsetDays === 0
          ? t('Ближайшее: сегодня в {time}', { time: next.time })
          : next.offsetDays === 1
            ? t('Ближайшее: завтра в {time}', { time: next.time })
            : t('Ближайшее: через {n} дн в {time}', { n: next.offsetDays, time: next.time })
        return <div className="rem-next">⏰ {label}</div>
      })()}

      <div className="rem-weekdays">
        {WD.map(([label, d]) => (
          <button
            key={d}
            className={`rem-wd${weekdays.includes(d) ? ' on' : ''}`}
            onClick={() => toggleWd(d)}
          >{t(label)}</button>
        ))}
      </div>

      <div className="rem-row rem-quiet">
        <span>{t('Не позже')}</span>
        <input
          type="time"
          value={quietUntil}
          onChange={e => onSave({ quiet_until: e.target.value || null })}
        />
        <span className="rem-hint">{t('тихие часы — после этого времени не напоминать')}</span>
      </div>
    </div>
  )
}
