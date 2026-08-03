import type { User } from '@supabase/supabase-js'
import { useState, useEffect } from 'react'
import type { DailyMetrics } from '../../types'
import { loadFocus, loadCheckins, checkInToday, removeCheckinToday, loadFocusInputs, inferFocusCheck, type CoachFocus } from '../../lib/coach'
import { evaluateFocus, type FocusData } from '../../lib/focusAdherence'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'
import { useFocusHidden } from '../../hooks/useFocusHidden'

// The weekly focus is the first thing on the dashboard, which is right in the
// morning and in the way for the rest of the day. Hiding it moves it to a
// badge in the topbar (FocusBadge) until the next morning. Card and badge are
// two halves of one behaviour and are mutually exclusive, so each loads its
// own data and only the flag is shared.

function HideButton({ onHide, label }: { onHide: () => void; label: string }) {
  return (
    <button type="button" className="coach-focus-hide" onClick={onHide} title={label} aria-label={label}>
      <Icon name="collapse" size={14} />
    </button>
  )
}

export function CoachFocusCard({ user, daily }: { user: User; daily: DailyMetrics[] }) {
  const { t } = useT()
  const { hidden, hide } = useFocusHidden()
  const [focus, setFocus] = useState<CoachFocus | null>(null)
  const [checkins, setCheckins] = useState<string[]>([])
  const [inputs, setInputs] = useState<{ intake: { ts: string; type: string }[]; wellbeingByDate: Record<string, number> } | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    // Card and badge are mutually exclusive, so the hidden one must not fetch:
    // otherwise both load the same focus while the card is put away.
    if (hidden) return
    loadFocus(user.id).then(f => {
      setFocus(f)
      if (!f) return
      const eff = f.check ?? inferFocusCheck(f.text)
      if (eff) loadFocusInputs(user.id, f.set_at.slice(0, 10)).then(setInputs)
      else loadCheckins(user.id, f.set_at).then(setCheckins)
    })
  }, [user.id, hidden])

  if (!focus || hidden) return null

  // Машинное условие от коуча в приоритете; иначе — выводим из текста цели.
  const effectiveCheck = focus.check ?? inferFocusCheck(focus.text)

  // ── Авто-режим: есть машинное условие ──
  if (effectiveCheck) {
    const data: FocusData = { daily, intake: inputs?.intake ?? [], wellbeingByDate: inputs?.wellbeingByDate ?? {} }
    const p = evaluateFocus(effectiveCheck, focus.set_at, data)
    const count = p.mode === 'weekly' ? `${p.daysMet}/${p.denom} ${t('за неделю')}` : `${p.daysMet}/7`
    return (
      <div className="coach-focus-card">
        <div className="coach-focus-head">
          <span className="coach-focus-label"><Icon name="focus" size={14} /> {t('Фокус недели')}</span>
          <span className="coach-focus-count">{count}</span>
          <HideButton onHide={hide} label={t('Скрыть до утра')} />
        </div>
        <div className="coach-focus-text">{focus.text}</div>
        <div className="coach-focus-dots" style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {p.perDay.map((d, i) => (
            <span key={i} style={{ opacity: d.future ? 0.3 : 1 }}>
              <Icon name={d.met ? 'dayMet' : 'dayMissed'} size={14} title={`${d.date} — ${d.met ? t('выполнено') : t('не выполнено')}`} />
            </span>
          ))}
        </div>
        <div className="coach-focus-auto" style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}><Icon name="auto" size={14} /> {t('по данным')}</div>
      </div>
    )
  }

  // ── Ручной fallback: цель не выражается через данные ──
  const doneToday = checkins.includes(today)
  async function toggle() {
    if (doneToday) {
      setCheckins(c => c.filter(d => d !== today))
      await removeCheckinToday(user.id)
    } else {
      setCheckins(c => [today, ...c])
      await checkInToday(user.id)
    }
  }
  return (
    <div className="coach-focus-card">
      <div className="coach-focus-head">
        <span className="coach-focus-label"><Icon name="focus" size={14} /> {t('Фокус недели')}</span>
        <span className="coach-focus-count">{checkins.length} {t('из 7 дней')}</span>
        <HideButton onHide={hide} label={t('Скрыть до утра')} />
      </div>
      <div className="coach-focus-text">{focus.text}</div>
      <button className={`coach-focus-btn${doneToday ? ' done' : ''}`} onClick={toggle}>
        {doneToday ? `✓ ${t('Сегодня держусь')}` : t('Отметить сегодня')}
      </button>
    </div>
  )
}
