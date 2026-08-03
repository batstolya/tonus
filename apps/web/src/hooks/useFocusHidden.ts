import { useCallback, useEffect, useState } from 'react'
import { FOCUS_HIDDEN_KEY, isHidden, nextMorning } from '../lib/focusVisibility'

// The card and the topbar badge are two halves of one behaviour but live in
// different trees, so they cannot share React state through a parent without
// dragging the flag through the whole dashboard. They share it through
// localStorage plus this event instead: whoever flips the flag tells everyone
// else, and each consumer re-reads.
const CHANGED = 'tonus:focus-visibility'

function read(): boolean {
  try {
    return isHidden(new Date(), localStorage.getItem(FOCUS_HIDDEN_KEY))
  } catch {
    // Private mode and blocked storage land here. Showing the card is the
    // right answer when we cannot tell.
    return false
  }
}

export function useFocusHidden() {
  const [hidden, setHidden] = useState(read)

  useEffect(() => {
    const sync = () => setHidden(read())
    window.addEventListener(CHANGED, sync)
    // 'storage' fires for other tabs only, which is exactly the case the
    // custom event above cannot cover.
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGED, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const hide = useCallback(() => {
    try {
      localStorage.setItem(FOCUS_HIDDEN_KEY, nextMorning(new Date()).toISOString())
    } catch { /* storage unavailable: the card simply stays put */ }
    window.dispatchEvent(new Event(CHANGED))
  }, [])

  const show = useCallback(() => {
    try {
      localStorage.removeItem(FOCUS_HIDDEN_KEY)
    } catch { /* as above */ }
    window.dispatchEvent(new Event(CHANGED))
  }, [])

  return { hidden, hide, show }
}
