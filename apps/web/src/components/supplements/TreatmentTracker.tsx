import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  getTreatments, getSupplementOptions, getMetricDailyRows, createTreatment, deleteTreatment,
  type SupplementOption, type Treatment, type MetricRow,
} from '../../lib/api/supplements'
import { isDemoActive } from '../../lib/demo'
import { demoList, demoInsert, demoRemove, demoId } from '../../lib/demoDb'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'

interface MetricComparison {
  metric: string
  label: string
  unit: string
  before: number | null
  after: number | null
  delta: number | null
  pct: number | null
  higherIsBetter: boolean
}

const METRIC_META: Record<string, { label: string; unit: string; higherIsBetter: boolean }> = {
  hrv:              { label: 'HRV',        unit: 'мс',     higherIsBetter: true  },
  restingHeartRate: { label: 'Пульс покоя', unit: 'уд/мин', higherIsBetter: false },
  sleepHours:       { label: 'Сон',         unit: 'ч',      higherIsBetter: true  },
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay)
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

function avgOf(rows: MetricRow[], metric: string): number | null {
  const vals = rows.filter(r => r.metric === metric).map(r => r.avg_val)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

interface Props {
  user: User
}

export function TreatmentTracker({ user }: Props) {
  const { t } = useT()
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [supplements, setSupplements] = useState<SupplementOption[]>([])
  const [comparisons, setComparisons] = useState<Record<string, MetricComparison[]>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formSupId, setFormSupId] = useState<string>('')
  const [formCustomName, setFormCustomName] = useState('')
  const [formDate, setFormDate] = useState(toDateStr(new Date()))

  const today = toDateStr(new Date())

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [treatData, supData] = isDemoActive()
        ? [
          demoList('treatments').sort((a, b) => b.started_at.localeCompare(a.started_at)),
          demoList('supplements').map(s => ({ id: s.id, name: s.name })),
        ]
        : await Promise.all([getTreatments(user.id), getSupplementOptions(user.id)])
      const treats = treatData as Treatment[]
      setTreatments(treats)
      setSupplements(supData as SupplementOption[])

      // Fetch metric comparisons for treatments with 30+ days of data
      const comps: Record<string, MetricComparison[]> = {}
      for (const tr of treats) {
        const daysIn = daysBetween(tr.started_at, today)
        if (daysIn < 30) continue

        const beforeStart = addDays(tr.started_at, -30)
        const beforeEnd   = addDays(tr.started_at, -1)
        const afterEnd    = today

        const typedRows: MetricRow[] = await getMetricDailyRows(
          user.id, ['hrv', 'restingHeartRate', 'sleepHours'], beforeStart, afterEnd,
        )
        const beforeRows = typedRows.filter(r => r.date >= beforeStart && r.date <= beforeEnd)
        const afterRows  = typedRows.filter(r => r.date >= tr.started_at && r.date <= afterEnd)

        const result: MetricComparison[] = Object.entries(METRIC_META).map(([key, meta]) => {
          const before = avgOf(beforeRows, key)
          const after  = avgOf(afterRows,  key)
          const delta  = before !== null && after !== null ? after - before : null
          const pct    = before !== null && delta !== null && before !== 0
            ? (delta / before) * 100
            : null
          return {
            metric: key,
            label: meta.label,
            unit: meta.unit,
            higherIsBetter: meta.higherIsBetter,
            before,
            after,
            delta,
            pct,
          }
        })

        comps[tr.id] = result
      }
      setComparisons(comps)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  async function handleAdd() {
    const name = formSupId
      ? (supplements.find(s => s.id === formSupId)?.name ?? formCustomName.trim())
      : formCustomName.trim()
    if (!name || !formDate) return
    setSaving(true)
    if (isDemoActive()) {
      const row = demoInsert('treatments', {
        id: demoId('demo-treat'), user_id: user.id, supplement_id: formSupId || null,
        name, started_at: formDate, outcome_metrics: [], notes: null,
        created_at: new Date().toISOString(),
      })
      setTreatments(prev => [row as Treatment, ...prev])
      setShowForm(false); setFormSupId(''); setFormCustomName('')
      setFormDate(toDateStr(new Date())); setSaving(false)
      return
    }
    const created = await createTreatment(user.id, {
      supplement_id: formSupId || null,
      name,
      started_at: formDate,
    })
    if (created) {
      setTreatments(prev => [created, ...prev])
    }
    setShowForm(false)
    setFormSupId('')
    setFormCustomName('')
    setFormDate(toDateStr(new Date()))
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (isDemoActive()) demoRemove('treatments', id)
    else await deleteTreatment(id)
    setTreatments(prev => prev.filter(tr => tr.id !== id))
    setComparisons(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function deltaStyle(delta: number | null, higherIsBetter: boolean): React.CSSProperties {
    if (delta === null || delta === 0) return {}
    const positive = delta > 0
    const isGood = (positive && higherIsBetter) || (!positive && !higherIsBetter)
    return { color: isGood ? 'var(--green)' : 'var(--red)' }
  }

  if (loading) {
    return (
      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}><Icon name="microscope" size={16} /> {t('Работает ли?')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('Загрузка…')}</p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}><Icon name="microscope" size={16} /> {t('Работает ли?')}</h3>
        <button
          className="btn-primary"
          style={{ fontSize: 13, padding: '6px 14px' }}
          onClick={() => setShowForm(s => !s)}
        >
          {t('Добавить лечение')}
        </button>
      </div>

      {showForm && (
        <div className="tt-form">
          <div className="tt-form-fields">
            <label className="tt-field">
              <span className="tt-field-label">{t('Препарат')}</span>
              <select
                className="tt-input"
                value={formSupId}
                onChange={e => setFormSupId(e.target.value)}
              >
                <option value="">{t('Выбери препарат')}</option>
                {supplements.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            {!formSupId && (
              <label className="tt-field">
                <span className="tt-field-label">{t('Своё название')}</span>
                <input
                  className="tt-input"
                  placeholder={t('Своё название')}
                  value={formCustomName}
                  onChange={e => setFormCustomName(e.target.value)}
                />
              </label>
            )}

            <label className="tt-field">
              <span className="tt-field-label">{t('Дата начала')}</span>
              <input
                type="date"
                className="tt-input"
                value={formDate}
                max={today}
                onChange={e => setFormDate(e.target.value)}
              />
            </label>
          </div>

          <div className="tt-form-actions">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>{t('Отмена')}</button>
            <button
              className="btn-primary"
              onClick={handleAdd}
              disabled={saving || (!formSupId && !formCustomName.trim()) || !formDate}
            >
              {saving ? '…' : t('Сохранить')}
            </button>
          </div>
        </div>
      )}

      {treatments.length === 0 && !showForm && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('Нет препаратов. Нажми «+ Добавить» чтобы начать.')}
        </p>
      )}

      <div className="treatment-list">
        {treatments.map(tr => {
          const daysIn = daysBetween(tr.started_at, today)
          const comp   = comparisons[tr.id]
          const hasResults = daysIn >= 30 && comp && comp.some(c => c.before !== null || c.after !== null)

          return (
            <div key={tr.id} className="treatment-card">
              <div className="treatment-card-head">
                <div>
                  <div className="treatment-name">{tr.name}</div>
                  <div className="treatment-days">
                    {tr.started_at} · {daysIn} {t('дней в лечении')}
                  </div>
                </div>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 15,
                    padding: '2px 6px',
                    borderRadius: 6,
                  }}
                  onClick={() => handleDelete(tr.id)}
                  title={t('Удалить')}
                >
                  ✕
                </button>
              </div>

              {daysIn < 30 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {t('Недостаточно данных (нужно 30+ дней)')} — {t('осталось {n} дн.', { n: 30 - daysIn })}
                </div>
              )}

              {hasResults && comp && (
                <>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 8,
                  }}>
                    {t('До начала')} / {t('После начала')}
                  </div>

                  <div className="treatment-results">
                    {comp.map(c => {
                      if (c.before === null && c.after === null) return null
                      const pctStr = c.pct !== null
                        ? `${c.pct > 0 ? '+' : ''}${c.pct.toFixed(0)}%`
                        : null

                      return (
                        <div key={c.metric} className="treatment-metric">
                          <span className="treatment-metric-label">{c.label}</span>
                          <span className="treatment-metric-delta" style={deltaStyle(c.delta, c.higherIsBetter)}>
                            {c.before !== null ? c.before.toFixed(1) : '—'}
                            {' → '}
                            {c.after !== null ? c.after.toFixed(1) : '—'}
                            {' '}{c.unit}
                            {pctStr && (
                              <span style={{ marginLeft: 5, fontSize: 12, opacity: 0.85 }}>({pctStr})</span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="treatment-disclaimer">
                    {t('Данные на длинных окнах. Корреляция ≠ причинность. Консультируйся с врачом.')}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
