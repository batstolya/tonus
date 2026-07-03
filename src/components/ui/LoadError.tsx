import { useT } from '../../lib/i18n'
import { isDemoActive } from '../../lib/demo'

// Баннер «не удалось загрузить» с повтором — чтобы сетевые ошибки
// не выглядели как «данных ещё нет».
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useT()
  // В демо-режиме запросы к базе ожидаемо не работают — пустые экраны это норма.
  if (isDemoActive()) return null
  return (
    <div className="load-error">
      <span>{t('⚠️ Не удалось загрузить данные — проверь соединение')}</span>
      <button className="load-error-retry" onClick={onRetry}>{t('Повторить')}</button>
    </div>
  )
}
