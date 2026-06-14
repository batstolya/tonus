import { useRef } from 'react'
import { UploadZone } from './UploadZone'
import { parseICS } from '../../parsers/icsParser'
import type { ParseProgress, CalendarEvent } from '../../types'

interface Props {
  onProgress: (p: ParseProgress) => void
  onDone: (daily: import('../../types').DailyMetrics[], samples: import('../../types').HeartRateSample[], filename?: string) => void
  onEvents: (events: CalendarEvent[]) => void
  onError: (msg: string) => void
  progress: ParseProgress | null
  error: string | null
}

export function UploadScreen({ onProgress, onDone, onEvents, onError, progress, error }: Props) {
  const workerRef = useRef<Worker | null>(null)

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

  function handleICSFile(file: File) {
    file.text().then(text => {
      try {
        onEvents(parseICS(text))
      } catch {
        onError('Не удалось прочитать .ics файл')
      }
    })
  }

  return (
    <div className="upload-screen">
      <div className="upload-header">
        <h1>Tonus</h1>
        <p className="upload-desc">
          Загрузите выгрузку Apple Health и (по желанию) файл календаря.<br />
          <strong>Все данные обрабатываются только в вашем браузере и никуда не передаются.</strong>
        </p>
      </div>

      <div className="upload-zones">
        <UploadZone
          accept=".zip,.xml"
          label="Перетащите export.zip или export.xml"
          sublabel="Выгрузка Apple Health"
          onFile={handleHealthFile}
        />
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

      <p className="upload-hint">
        Чтобы экспортировать данные: iPhone → Здоровье → аватар → Экспортировать данные о здоровье
      </p>
    </div>
  )
}
