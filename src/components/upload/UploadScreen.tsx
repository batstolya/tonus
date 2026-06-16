import { useRef, useState } from 'react'
import { UploadZone } from './UploadZone'
import { parseICS } from '../../parsers/icsParser'
import { parseXiaomiCSV } from '../../parsers/xiaomiParser'
import type { ParseProgress, CalendarEvent } from '../../types'
import type { DeviceType } from '../../store/appStore'

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
    onProgress({ phase: 'reading', percent: 10, message: 'Читаем архив Xiaomi…' })
    try {
      let files: { name: string; text: string }[] = []

      if (file.name.endsWith('.zip')) {
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(file)
        onProgress({ phase: 'parsing', percent: 40, message: 'Разбираем CSV файлы…' })
        const entries = Object.entries(zip.files).filter(([n]) => n.toLowerCase().endsWith('.csv') && !zip.files[n].dir)
        for (const [name, entry] of entries) {
          const text = await entry.async('string')
          files.push({ name, text })
        }
      } else if (file.name.endsWith('.csv')) {
        const text = await file.text()
        files = [{ name: file.name, text }]
      } else {
        onError('Ожидается .zip или .csv файл экспорта Xiaomi')
        return
      }

      onProgress({ phase: 'parsing', percent: 70, message: 'Формируем метрики…' })
      const { daily, warnings } = parseXiaomiCSV(files)

      if (daily.length === 0) {
        onError('Не удалось найти данные в файле Xiaomi. Убедитесь что экспортируете данные через account.xiaomi.com → Privacy → Manage.')
        return
      }

      setXiaomiWarnings(warnings)
      onProgress({ phase: 'done', percent: 100, message: 'Готово' })
      onDone(daily, [], file.name)
    } catch (e: any) {
      onError(`Ошибка разбора файла Xiaomi: ${e?.message ?? e}`)
    }
  }

  function handleICSFile(file: File) {
    file.text().then(text => {
      try {
        onEvents(parseICS(text))
      } catch {
        onError('Не удалось прочитать .ics файл')
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
            Загрузите экспорт данных Xiaomi (zip или CSV).<br />
            <strong>Все данные обрабатываются только в вашем браузере и никуда не передаются.</strong>
          </p>
        ) : (
          <p className="upload-desc">
            Загрузите выгрузку Apple Health и (по желанию) файл календаря.<br />
            <strong>Все данные обрабатываются только в вашем браузере и никуда не передаются.</strong>
          </p>
        )}
      </div>

      <div className="upload-zones">
        {isXiaomi ? (
          <UploadZone
            accept=".zip,.csv"
            label="Перетащите экспорт Xiaomi (.zip или .csv)"
            sublabel="Данные Mi Fitness / Mi Band"
            onFile={handleXiaomiFile}
          />
        ) : (
          <UploadZone
            accept=".zip,.xml"
            label="Перетащите export.zip или export.xml"
            sublabel="Выгрузка Apple Health"
            onFile={handleHealthFile}
          />
        )}
        <UploadZone
          accept=".ics"
          label="Перетащите файл календаря .ics"
          sublabel="Для карты стресса"
          optional
          onFile={handleICSFile}
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
          <p className="upload-hint">Как получить файл экспорта:</p>
          <ol className="upload-hint-steps">
            <li>Откройте <strong>account.xiaomi.com</strong> в браузере</li>
            <li>Перейдите в <strong>Privacy → Manage my data</strong></li>
            <li>Запросите экспорт данных о здоровье и скачайте zip</li>
          </ol>
        </div>
      ) : (
        <p className="upload-hint">
          Чтобы экспортировать данные: iPhone → Здоровье → аватар → Экспортировать данные о здоровье
        </p>
      )}
    </div>
  )
}
