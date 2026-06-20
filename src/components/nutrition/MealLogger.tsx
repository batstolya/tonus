import { useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useT } from '../../lib/i18n'

interface MealResult {
  dish: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
}

interface Props {
  user: User
  onSaved: () => void
}

export function MealLogger({ user, onSaved }: Props) {
  const { t } = useT()
  const [tab, setTab] = useState<'photo' | 'text'>('photo')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [imageData, setImageData] = useState<{ base64: string; mime: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [editResult, setEditResult] = useState<MealResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() { setEditResult(null); setError(null) }

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setPreview(dataUrl)
      setImageData({ base64: dataUrl.split(',')[1], mime: file.type })
      reset()
    }
    reader.readAsDataURL(file)
  }

  async function handleAnalyze() {
    setLoading(true); reset()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const url = import.meta.env.VITE_SUPABASE_URL as string
      const body = tab === 'photo' && imageData
        ? { image: imageData, text: text || undefined }
        : { text }
      const res = await fetch(`${url}/functions/v1/classify-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session!.access_token}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error === 'not_food') { setError(t('На фото не видно еды. Попробуй другое фото.')); return }
      if (json.error) { setError(json.error); return }
      setEditResult(json)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleSave() {
    if (!editResult) return
    setSaving(true)
    await supabase.from('intake_events').insert({
      user_id: user.id,
      ts: new Date().toISOString(),
      type: 'meal',
      note: editResult.dish || text || t('Еда'),
      calories: editResult.calories,
      protein_g: editResult.protein_g,
      carbs_g: editResult.carbs_g,
      fat_g: editResult.fat_g,
    })
    setSaving(false)
    setEditResult(null); setPreview(null); setImageData(null); setText(''); setError(null)
    onSaved()
  }

  const switchTab = (t: 'photo' | 'text') => { setTab(t); reset() }
  const canAnalyze = tab === 'photo' ? !!imageData : text.trim().length > 2

  return (
    <div className="meal-logger">
      <div className="meal-logger-tabs">
        <button className={`meal-tab${tab === 'photo' ? ' active' : ''}`} onClick={() => switchTab('photo')}>📸 {t('Фото')}</button>
        <button className={`meal-tab${tab === 'text' ? ' active' : ''}`} onClick={() => switchTab('text')}>✏️ {t('Текст')}</button>
      </div>

      {tab === 'photo' && (
        <div
          className={`meal-drop${preview ? ' has-preview' : ''}`}
          onClick={() => !preview && fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        >
          {preview
            ? <img src={preview} alt="" className="meal-preview" onClick={() => fileRef.current?.click()} />
            : <div className="meal-drop-hint"><span>📷</span><span>{t('Нажми или перетащи фото блюда')}</span></div>}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        </div>
      )}

      {tab === 'text' && (
        <textarea className="meal-text-input"
          placeholder={t('Что съел? Напр.: «бигмак и кола» или «овсянка 200г с бананом»')}
          value={text} rows={3}
          onChange={e => { setText(e.target.value); reset() }} />
      )}

      {tab === 'photo' && imageData && (
        <textarea className="meal-text-input" style={{ marginTop: 8 }} rows={2}
          placeholder={t('Уточни блюдо или порцию (необязательно)')}
          value={text} onChange={e => setText(e.target.value)} />
      )}

      {error && <p className="auth-error" style={{ marginTop: 8 }}>{error}</p>}

      {!editResult && (
        <button className="btn btn-primary" style={{ marginTop: 10, width: '100%' }}
          onClick={handleAnalyze} disabled={loading || !canAnalyze}>
          {loading ? <><span className="ai-spinner" /> {t('Анализирую…')}</> : t('Оценить калории (ИИ)')}
        </button>
      )}

      {editResult && (
        <div className="meal-result">
          <div className="meal-result-dish">🍽 <b>{editResult.dish || t('Блюдо')}</b></div>
          <div className="meal-result-fields">
            {([
              ['calories', t('ккал')],
              ['protein_g', t('Белки, г')],
              ['carbs_g', t('Углеводы, г')],
              ['fat_g', t('Жиры, г')],
            ] as [keyof MealResult, string][]).map(([key, label]) => (
              <label key={key} className="meal-result-field">
                <span>{label}</span>
                <input type="number" min={0} value={editResult[key] ?? ''}
                  onChange={e => setEditResult(r => ({ ...r!, [key]: e.target.value === '' ? null : Number(e.target.value) }))} />
              </label>
            ))}
          </div>
          <p className="settings-muted" style={{ fontSize: 12, margin: '6px 0 10px' }}>
            {t('Оценка ИИ — можно поправить перед сохранением.')}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
              {saving ? t('Сохраняю…') : t('Сохранить')}
            </button>
            <button className="btn btn-secondary" onClick={reset}>{t('Заново')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
