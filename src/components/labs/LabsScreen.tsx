import React, { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../lib/i18n'
import { loadLabFiles, loadLabResults, deleteLabFile, uploadAndExtract, type LabFile, type LabResult } from '../../lib/labs'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  user: User
}

function groupByMarker(results: LabResult[]): Record<string, { date: string; value: number; unit: string | null }[]> {
  const map: Record<string, { date: string; value: number; unit: string | null }[]> = {}
  for (const r of results) {
    if (!map[r.marker]) map[r.marker] = []
    map[r.marker].push({ date: r.date, value: r.value, unit: r.unit })
  }
  return map
}

const COLORS = ['var(--accent)', 'var(--green)', '#e88c3b', '#a78bfa', '#f472b6']

export function LabsScreen({ user }: Props) {
  const { t } = useT()
  const [files, setFiles] = useState<LabFile[]>([])
  const [results, setResults] = useState<LabResult[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [consented, setConsented] = useState(() => localStorage.getItem('lab_ai_consent') === '1')
  const [showConsent, setShowConsent] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingFile = useRef<File | null>(null)

  useEffect(() => {
    Promise.all([loadLabFiles(user.id), loadLabResults(user.id)]).then(([f, r]) => {
      setFiles(f); setResults(r)
    })
  }, [user.id])

  function handleFileClick() {
    if (!consented) { setShowConsent(true); return }
    fileRef.current?.click()
  }

  function handleConsent() {
    localStorage.setItem('lab_ai_consent', '1')
    setConsented(true)
    setShowConsent(false)
    if (pendingFile.current) {
      doUpload(pendingFile.current)
      pendingFile.current = null
    } else {
      fileRef.current?.click()
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!consented) { pendingFile.current = file; setShowConsent(true); return }
    doUpload(file)
  }

  async function doUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const labFile = await uploadAndExtract(user.id, file, uploadDate)
      if (labFile) {
        setFiles(prev => [labFile, ...prev])
        // Reload results in case biomarkers were extracted
        const updated = await loadLabResults(user.id)
        setResults(updated)
      }
    } catch (e: any) {
      setError(e.message ?? t('Ошибка загрузки'))
    }
    setUploading(false)
  }

  async function handleDelete(id: string) {
    await deleteLabFile(id)
    setFiles(prev => prev.filter(f => f.id !== id))
    const updated = await loadLabResults(user.id)
    setResults(updated)
  }

  const markerGroups = groupByMarker(results)
  const markers = Object.keys(markerGroups).sort()

  return (
    <div className="screen">
      {showConsent && (
        <div className="ai-consent-overlay" onClick={() => setShowConsent(false)}>
          <div className="ai-consent-card" onClick={e => e.stopPropagation()}>
            <h3>{t('Обработка анализов через ИИ')}</h3>
            <p>{t('Содержимое загруженного файла (PDF или фото) будет отправлено в Google Gemini для извлечения текста и биомаркеров. Это самая чувствительная категория данных.')}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('Нажимая «Согласен», ты подтверждаешь отправку медицинских документов во внешний сервис.')}</p>
            <div className="ai-consent-btns">
              <button className="btn-primary" onClick={handleConsent}>{t('Согласен')}</button>
              <button className="btn-ghost" onClick={() => setShowConsent(false)}>{t('Отмена')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="labs-header">
        <h2>{t('Анализы')}</h2>
        <div className="labs-upload-row">
          <input
            type="date"
            className="supp-input"
            style={{ minWidth: 140 }}
            value={uploadDate}
            onChange={e => setUploadDate(e.target.value)}
          />
          <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          <button className="btn-primary" onClick={handleFileClick} disabled={uploading}>
            {uploading ? (
              <><span className="ai-spinner" /> {t('Извлекаем…')}</>
            ) : `+ ${t('Загрузить анализ')}`}
          </button>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {/* Biomarker trends */}
      {markers.length > 0 && (
        <div className="labs-section">
          <h3>{t('Тренды биомаркеров')}</h3>
          <div className="labs-trends">
            {markers.map((marker, idx) => {
              const pts = markerGroups[marker].sort((a, b) => a.date.localeCompare(b.date))
              if (pts.length < 2) return null
              return (
                <div key={marker} className="labs-trend-card">
                  <div className="labs-trend-title">{marker} <span className="labs-unit">{pts[0].unit}</span></div>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={pts} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke={COLORS[idx % COLORS.length]} dot strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            })}
          </div>
          {markers.some(m => markerGroups[m].length < 2) && (
            <p className="chart-hint">{t('Тренд появится когда будет ≥2 анализов с одним показателем.')}</p>
          )}
        </div>
      )}

      {/* File list */}
      <div className="labs-section">
        <h3>{t('Загруженные анализы')}</h3>
        {files.length === 0 ? (
          <p className="empty-hint">{t('Нет загруженных анализов. Загрузи PDF или фото бланка.')}</p>
        ) : (
          <div className="labs-list">
            {files.map(f => (
              <div key={f.id} className="labs-file-card">
                <div className="labs-file-header" onClick={() => setExpandedId(e => e === f.id ? null : f.id)}>
                  <div className="labs-file-info">
                    <span className="labs-file-name">{f.file_name}</span>
                    {f.date && <span className="labs-file-date">{f.date}</span>}
                    <span className="labs-file-type">{f.file_type?.split('/')[1]?.toUpperCase() ?? t('файл')}</span>
                  </div>
                  <div className="labs-file-actions">
                    <button className="ai-card-delete" onClick={e => { e.stopPropagation(); handleDelete(f.id) }} title={t('Удалить')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                    <span className="ai-card-chevron">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        {expandedId === f.id ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                      </svg>
                    </span>
                  </div>
                </div>
                {expandedId === f.id && f.extracted_text && (
                  <div className="labs-file-text">
                    <pre>{f.extracted_text.replace(/```json[\s\S]*?```/g, '').trim()}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="caveat">{t('Данные анализов обрабатываются через Google Gemini. Это медицинские документы — храни их с осторожностью.')}</p>
    </div>
  )
}
