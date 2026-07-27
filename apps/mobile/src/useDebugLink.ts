import { useEffect, useState } from 'react'
import * as Linking from 'expo-linking'

/**
 * Вход на отладочные экраны по ссылке: `tonus://health`.
 *
 * Нужен не для красоты. Без него единственный путь на экран — тап пальцем, а
 * значит его нельзя ни снять в CI, ни проверить автоматикой: остаётся ручная
 * проверка при каждом изменении. Со ссылкой macOS-джоба открывает экран сама и
 * кладёт скриншот в артефакты.
 *
 * Отладочные ссылки безопасны: они ничего не меняют и ведут на экран, который
 * только читает и показывает.
 */
export function useDebugLink(): { health: boolean; close: () => void } {
  const [health, setHealth] = useState(false)

  useEffect(() => {
    function handle(url: string | null) {
      if (!url) return
      // Схема одна (tonus://), различаем по хосту: tonus://health.
      const { hostname, path } = Linking.parse(url)
      if (hostname === 'health' || path === 'health') setHealth(true)
    }
    void Linking.getInitialURL().then(handle)
    const sub = Linking.addEventListener('url', event => { handle(event.url) })
    return () => { sub.remove() }
  }, [])

  return { health, close: () => { setHealth(false) } }
}
