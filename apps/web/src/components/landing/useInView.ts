import { useEffect, useRef, useState } from 'react'

// Сразу видимо (без анимации по скроллу): нет IntersectionObserver или reduce-motion.
function immediatelyVisible(): boolean {
  if (typeof IntersectionObserver === 'undefined') return true
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// [ref, inView]. inView → true, когда элемент впервые попал во вьюпорт.
// Деградация (нет IO / reduce-motion) решается в инициализаторе состояния,
// поэтому эффект не вызывает setState синхронно.
// rootMargin позволяет сузить зону срабатывания (например, центральная полоса вьюпорта).
export function useInView<T extends HTMLElement = HTMLDivElement>(opts?: {
  threshold?: number
  once?: boolean
  rootMargin?: string
}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(immediatelyVisible)
  const once = opts?.once ?? true
  const threshold = opts?.threshold ?? 0.25
  const rootMargin = opts?.rootMargin

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (immediatelyVisible()) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true)
            if (once) obs.disconnect()
          } else if (!once) {
            setInView(false)
          }
        }
      },
      { threshold, rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [once, threshold, rootMargin])

  return [ref, inView] as const
}
