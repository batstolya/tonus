import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  loadSupplements, addSupplement, deleteSupplement, updateStock,
  loadLogsForMonth, toggleLog,
  type Supplement, type SupplementLog,
} from '../../lib/supplements'

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

  const days = getDaysInMonth(year, month)
  const todayStr = toDateStr(now)

  const reload = useCallback(async () => {
    const [sups, ls] = await Promise.all([
      loadSupplements(user.id),
      loadLogsForMonth(user.id, year, month),
    ])
    setSupplements(sups)
    setLogs(ls)
  }, [user.id, year, month])

  useEffect(() => { reload() }, [reload])

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
    await updateStock(id, next)
  }

  async function handleStockSet(id: string) {
    const val = parseInt(stockInput)
    if (!isNaN(val) && val >= 0) {
      setSupplements(prev => prev.map(s => s.id === id ? { ...s, stock_count: val } : s))
      await updateStock(id, val)
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

  const monthName = new Date(year, month - 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  // Calculate first day offset (Monday = 0)
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7

  return (
    <div className="screen">
      <div className="supp-header">
        <h2>Препараты и добавки</h2>
        <button className="btn-primary" onClick={() => setShowForm(s => !s)}>+ Добавить</button>
      </div>

      {showForm && (
        <div className="supp-form">
          <input
            className="supp-input"
            placeholder="Название (напр. Витамин D)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <input
            className="supp-input supp-input-sm"
            placeholder="Доза (напр. 5000)"
            value={newDose}
            onChange={e => setNewDose(e.target.value)}
          />
          <input
            className="supp-input supp-input-sm"
            placeholder="Ед. (напр. IU)"
            value={newUnit}
            onChange={e => setNewUnit(e.target.value)}
          />
          <button className="btn-primary" onClick={handleAdd} disabled={adding || !newName.trim()}>
            {adding ? '…' : 'Сохранить'}
          </button>
          <button className="btn-ghost" onClick={() => setShowForm(false)}>Отмена</button>
        </div>
      )}

      {supplements.length === 0 && !showForm && (
        <p className="empty-hint">Нет препаратов. Нажми «+ Добавить» чтобы начать.</p>
      )}

      {supplements.length > 0 && (
        <div className="supp-stock-panel">
          <div className="supp-stock-title">Запасы</div>
          <div className="supp-stock-grid">
            {supplements.map(sup => {
              const stock = sup.stock_count
              const low = stock !== null && stock <= 7
              return (
                <div key={sup.id} className={`supp-stock-item${low ? ' low' : ''}`}>
                  <div className="supp-stock-name">{sup.name}</div>
                  <div className="supp-stock-dose">{sup.default_dose ? `${sup.default_dose}${sup.unit ? ` ${sup.unit}` : ''}` : ''}</div>
                  <div className="supp-stock-controls">
                    <button className="supp-stock-btn" onClick={() => handleStock(sup.id, -1)} disabled={!stock}>−</button>
                    {editingStock === sup.id ? (
                      <input
                        className="supp-stock-input"
                        type="number"
                        min="0"
                        value={stockInput}
                        autoFocus
                        onChange={e => setStockInput(e.target.value)}
                        onBlur={() => handleStockSet(sup.id)}
                        onKeyDown={e => { if (e.key === 'Enter') handleStockSet(sup.id); if (e.key === 'Escape') { setEditingStock(null); setStockInput('') } }}
                      />
                    ) : (
                      <button
                        className="supp-stock-count"
                        onClick={() => { setEditingStock(sup.id); setStockInput(String(stock ?? 0)) }}
                        title="Нажми чтобы изменить"
                      >
                        {stock === null ? '—' : stock}
                        <span className="supp-stock-unit">шт</span>
                      </button>
                    )}
                    <button className="supp-stock-btn" onClick={() => handleStock(sup.id, +1)}>+</button>
                  </div>
                  {low && <div className="supp-stock-warn">⚠ Заканчивается</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

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
                <button className="supp-delete" onClick={() => handleDelete(sup.id)} title="Удалить">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            </div>

            <div className="supp-grid">
              {/* Day-of-week headers */}
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="supp-dow">{d}</div>
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
    </div>
  )
}
