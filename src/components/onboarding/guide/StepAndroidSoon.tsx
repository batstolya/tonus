import { useT } from '../../../lib/i18n'

export function StepAndroidSoon({ onCsv }: { onCsv: () => void }) {
  const { t } = useT()
  return (
    <div className="guide-content">
      <h2>{t('Авто-синхронизация для Android скоро')}</h2>
      <p>{t('Пока используй разовый импорт CSV с account.xiaomi.com — мы сообщим, когда авто-синк будет готов.')}</p>
      <button className="guide-cta" style={{ border: 'none', cursor: 'pointer' }} onClick={onCsv}>
        {t('Разовый импорт CSV')}
      </button>
    </div>
  )
}
