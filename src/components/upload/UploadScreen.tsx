import { useRef, useState } from 'react'
import { UploadZone } from './UploadZone'
import { parseICS } from '../../parsers/icsParser'
import { parseCalBookings } from '../../parsers/calBookingsParser'
import { parseXiaomiCSV } from '../../parsers/xiaomiParser'
import type { ParseProgress, CalendarEvent } from '../../types'
import type { DeviceType } from '../../store/appStore'
import { useT } from '../../lib/i18n'

interface Props {
  onProgress: (p: ParseProgress) => void
  onDone: (daily: import('../../types').DailyMetrics[], samples: import('../../types').HeartRateSample[], filename?: string) => void
  onEvents: (events: CalendarEvent[]) => void
  onError: (msg: string) => void
  progress: ParseProgress | null
  error: string | null
  deviceType: DeviceType | null
}

export function UploadScreen({ onProgress, onDone, onEvents, onError, progress, error, deviceType }: Props) {
  const { t } = useT()
  const workerRef = useRef<Worker | null>(null)
  const [xiaomiWarnings, setXiaomiWarnings] = useState<string[]>([])

  function handleHealthFile(file: File) {
    if (workerRef.current) workerRef.current.terminate()
    const worker = new Worker(
      new URL('../../workers/healthParser.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'progress') onProgress(msg.payload)
      else if (msg.type === 'done') { onDone(msg.payload.daily, msg.payload.heartRateSamples, file.name); worker.terminate() }
      else if (msg.type === 'error') { onError(msg.payload); worker.terminate() }
    }
    worker.onerror = (e) => { onError(e.message); worker.terminate() }
    worker.postMessage({ type: 'parseFile', payload: file })
  }

  async function handleXiaomiFile(file: File) {
    onProgress({ phase: 'reading', percent: 10, message: t('Читаем архив Xiaomi…') })
    try {
      let files: { name: string; text: string }[] = []

      if (file.name.endsWith('.zip')) {
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(file)
        onProgress({ phase: 'parsing', percent: 40, message: t('Разбираем CSV файлы…') })
        const entries = Object.entries(zip.files).filter(([n]) => n.toLowerCase().endsWith('.csv') && !zip.files[n].dir)
        for (const [name, entry] of entries) {
          const text = await entry.async('string')
          files.push({ name, text })
        }
      } else if (file.name.endsWith('.csv')) {
        const text = await file.text()
        files = [{ name: file.name, text }]
      } else {
        onError(t('Ожидается .zip или .csv файл экспорта Xiaomi'))
        return
      }

      onProgress({ phase: 'parsing', percent: 70, message: t('Формируем метрики…') })
      const { daily, warnings } = parseXiaomiCSV(files)

      if (daily.length === 0) {
        onError(t('Не удалось найти данные в файле Xiaomi. Убедитесь что экспортируете данные через account.xiaomi.com → Privacy → Manage.'))
        return
      }

      setXiaomiWarnings(warnings)
      onProgress({ phase: 'done', percent: 100, message: t('Готово') })
      onDone(daily, [], file.name)
    } catch (e) {
      onError(`${t('Ошибка разбора файла Xiaomi')}: ${(e as Error)?.message ?? String(e)}`)
    }
  }

  function handleICSFile(file: File) {
    file.text().then(text => {
      try {
        onEvents(parseICS(text))
      } catch {
        onError(t('Не удалось прочитать .ics файл'))
      }
    })
  }

  function handleCalBookingsFile(file: File) {
    file.text().then(text => {
      try {
        onEvents(parseCalBookings(text))
      } catch {
        onError(t('Не удалось прочитать .ics файл'))
      }
    })
  }

  const isXiaomi = deviceType === 'xiaomi'

  return (
    <div className="upload-screen">
      <div className="upload-header">
        <h1>Tonus</h1>
        {isXiaomi ? (
          <p className="upload-desc">
            {t('Загрузите экспорт данных Xiaomi (zip или CSV).')}<br />
            <strong>{t('Все данные обрабатываются только в вашем браузере и никуда не передаются.')}</strong>
          </p>
        ) : (
          <p className="upload-desc">
            {t('Загрузите выгрузку Apple Health и (по желанию) файл календаря.')}<br />
            <strong>{t('Все данные обрабатываются только в вашем браузере и никуда не передаются.')}</strong>
          </p>
        )}
      </div>

      <div className="upload-zones">
        {isXiaomi ? (
          <UploadZone
            accept=".zip,.csv"
            label={t('Перетащите экспорт Xiaomi (.zip или .csv)')}
            sublabel={t('Данные Mi Fitness / Mi Band')}
            onFile={handleXiaomiFile}
          />
        ) : (
          <UploadZone
            accept=".zip,.xml"
            label={t('Перетащите export.zip или export.xml')}
            sublabel={t('Выгрузка Apple Health')}
            onFile={handleHealthFile}
          />
        )}
        <UploadZone
          accept=".ics"
          label={t('Перетащите файл календаря .ics')}
          sublabel={t('Для карты стресса')}
          optional
          onFile={handleICSFile}
        />
        <UploadZone
          accept=".json"
          label={t('Перетащите cal_bookings.json')}
          sublabel={t('Экспорт Cal.com')}
          optional
          onFile={handleCalBookingsFile}
        />
      </div>

      {progress && progress.phase !== 'done' && (
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${progress.percent}%` }} />
          <span>{progress.message}</span>
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}

      {xiaomiWarnings.length > 0 && (
        <div className="upload-warnings">
          {xiaomiWarnings.map((w, i) => <p key={i}>⚠️ {w}</p>)}
        </div>
      )}

      {isXiaomi ? (
        <div className="upload-hint-block">
          <p className="upload-hint">{t('Как получить файл экспорта:')}</p>
          <ol className="upload-hint-steps">
            <li>{t('Откройте')} <strong>account.xiaomi.com</strong> {t('в браузере')}</li>
            <li>{t('Перейдите в')} <strong>Privacy → Manage my data</strong></li>
            <li>{t('Запросите экспорт данных о здоровье и скачайте zip')}</li>
          </ol>
        </div>
      ) : (
        <p className="upload-hint">
          {t('Чтобы экспортировать данные: iPhone → Здоровье → аватар → Экспортировать данные о здоровье')}
        </p>
      )}
    </div>
  )
}
