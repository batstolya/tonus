import { useEffect, useState } from 'react'

// Анимирует число 0 → value за duration секунд, старт через delay секунд.
// className пробрасывается наружу (TelegramDemo передаёт "tg-counter" ради своих стилей).
export function Counter({
  value,
  delay = 0,
  duration = 1.2,
  className,
}: {
  value: number
  delay?: number
  duration?: number
  className?: string
}) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined
    const startId = setTimeout(() => {
      let current = 0
      const increment = value / (duration * 60) // ~60fps
      intervalId = setInterval(() => {
        current += increment
        if (current >= value) {
          setDisplay(value)
          if (intervalId) clearInterval(intervalId)
        } else {
          setDisplay(Math.floor(current))
        }
      }, 1000 / 60)
    }, delay * 1000)

    return () => {
      clearTimeout(startId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [value, delay, duration])

  return <span className={className}>{display}</span>
}

export default Counter
