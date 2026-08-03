import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { DailyMetrics } from '../../types'
import { loadFocus, loadCheckins, loadFocusInputs, inferFocusCheck, type CoachFocus } from '../../lib/coach'
import { evaluateFocus } from '../../lib/focusAdherence'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'
import { useFocusHidden } from '../../hooks/useFocusHidden'

interface Props {
  user: User
  daily: DailyMetrics[]
  intake?: { ts: string; type: string }[]
}

// What the focus card collapses into. It renders only while the card is
// hidden, so the two never load in parallel and nothing has to be lifted into
// a shared parent — the flag is the only thing they share.
//
// No popover here on purpose: the point of hiding the card is to get it out of
// the way, not to read it in miniature. The progress stays visible on the
// badge, and one click brings the card back.
export function FocusBadge({ user, daily, intake = [] }: Props) {
  const { t } = useT()
  const { hidden, show } = useFocusHidden()
  const [focus, setFocus] = useState<CoachFocus | null>(null)
  const [checkins, setCheckins] = useState<string[]>([])
  const [inputs, setInputs] = useState<{ intake: { ts: string; type: string }[]; wellbeingByDate: Record<string, number> } | null>(null)

  useEffect(() => {
    if (!hidden) return
    loadFocus(user.id).then(f => {
      setFocus(f)
      if (!f) return
      const eff = f.check ?? inferFocusCheck(f.text)
      if (eff) loadFocusInputs(user.id, f.set_at.slice(0, 10)).then(setInputs)
      else loadCheckins(user.id, f.set_at).then(setCheckins)
    })
  }, [user.id, hidden])

  if (!hidden || !focus) return null

  const effectiveCheck = focus.check ?? inferFocusCheck(focus.text)
  let count: string
  if (effectiveCheck) {
    const p = evaluateFocus(effectiveCheck, focus.set_at, {
      daily, intake: inputs?.intake ?? intake, wellbeingByDate: inputs?.wellbeingByDate ?? {},
    })
    count = p.mode === 'weekly' ? `${p.daysMet}/${p.denom}` : `${p.daysMet}/7`
  } else {
    count = `${checkins.length}/7`
  }

  return (
    <button
      type="button"
      className="topbar-badge focus-badge"
      onClick={show}
      title={focus.text}
      aria-label={`${t('Фокус недели')}: ${count}. ${t('Показать карточку')}`}
    >
      <Icon name="focus" size={16} />
      <span className="focus-badge-count">{count}</span>
    </button>
  )
}
