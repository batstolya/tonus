import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

// Анимированный счётчик: число «доезжает» от 0 до value при появлении.
// Уважает prefers-reduced-motion — тогда сразу показывает финальное значение.
export function CountUp({ value, duration = 0.9, className, style }: {
  value: number
  duration?: number
  className?: string
  style?: CSSProperties
}) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)
  const text = useTransform(mv, v => Math.round(v).toString())

  useEffect(() => {
    if (reduce) { mv.set(value); return }
    const controls = animate(mv, value, { duration, ease: 'easeOut' })
    return () => controls.stop()
  }, [value, duration, reduce, mv])

  return <motion.span className={className} style={style}>{text}</motion.span>
}
