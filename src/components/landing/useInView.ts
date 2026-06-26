import { useEffect, useRef, useState } from 'react'

// [ref, inView]. inView → true, когда элемент впервые попал во вьюпорт.
// Деградация: нет IntersectionObserver или reduce-motion → сразу true.
export function useInView<T extends HTMLElement = HTMLDivElement>(opts?: {
  threshold?: number
  once?: boolean
}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  const once = opts?.once ?? true
  const threshold = opts?.threshold ?? 0.25

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setInView(true)
      return
    }
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
      { threshold },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [once, threshold])

  return [ref, inView] as const
}
