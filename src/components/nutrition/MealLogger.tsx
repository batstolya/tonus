import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createMealEvent } from '../../lib/api/intake'
import { callFunction } from '../../lib/edgeFunctions'
import { isDemoActive } from '../../lib/demo'
import { demoInsert, demoId } from '../../lib/demoDb'
import { useT } from '../../lib/i18n'

interface MealResult {
  dish: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
}

interface OFFProduct {
  product_name: string
  serving_size?: string
  // OpenFoodFacts returns some products with no `nutriments` field at all — keep it optional
  // so every access is forced to guard against undefined (was the source of the search crash).
  nutriments?: {
    'energy-kcal_serving'?: number
    'proteins_serving'?: number
    'carbohydrates_serving'?: number
    'fat_serving'?: number
    'energy-kcal_100g'?: number
    proteins_100g?: number
    carbohydrates_100g?: number
    fat_100g?: number
  }
}

interface Props {
  user: User
  onSaved: () => void
}

export function MealLogger({ user, onSaved }: Props) {
  const { t } = useT()
  const [tab, setTab] = useState<'photo' | 'text' | 'search'>('photo')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [imageData, setImageData] = useState<{ base64: string; mime: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [editResult, setEditResult] = useState<MealResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<OFFProduct[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

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
      const body = tab === 'photo' && imageData
        ? { image: imageData, text: text || undefined }
        : { text }
      const json = await callFunction<MealResult>('classify-meal', body)
      setEditResult(json)
    } catch (e) {
      // classify-meal возвращает { error: 'not_food' } при не-еде на фото
      const m = (e as Error)?.message
      setError(m === 'not_food' ? t('На фото не видно еды. Попробуй другое фото.') : m)
    }
    finally { setLoading(false) }
  }

  async function handleSave() {
    if (!editResult) return
    setSaving(true)
    if (isDemoActive()) {
      demoInsert('intake_events', {
        id: demoId('demo-intake'), user_id: user.id, ts: new Date().toISOString(), type: 'meal',
        amount: null, unit: null, note: editResult.dish || text || t('Еда'),
        calories: editResult.calories, protein_g: editResult.protein_g,
        carbs_g: editResult.carbs_g, fat_g: editResult.fat_g, source: null,
      })
      setSaving(false)
      setEditResult(null); setPreview(null); setImageData(null); setText(''); setError(null)
      setSearchQuery(''); setSearchResults([]); setSearched(false); setSearchError(null)
      onSaved?.()
      return
    }
    await createMealEvent(user.id, {
      note: editResult.dish || text || t('Еда'),
      calories: editResult.calories,
      protein_g: editResult.protein_g,
      carbs_g: editResult.carbs_g,
      fat_g: editResult.fat_g,
    })
    setSaving(false)
    setEditResult(null); setPreview(null); setImageData(null); setText(''); setError(null)
    setSearchQuery(''); setSearchResults([]); setSearched(false); setSearchError(null)
    onSaved()
  }

  const switchTab = (newTab: 'photo' | 'text' | 'search') => { setTab(newTab); reset() }
  const canAnalyze = tab === 'photo' ? !!imageData : text.trim().length > 2

  // Debounced search
  useEffect(() => {
    if (tab !== 'search') return
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      setSearched(false)
      setSearchError(null)
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(null)
      setSearched(false)
      try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchQuery.trim())}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,nutriments,serving_size`
        const res = await fetch(url)
        const json = await res.json()
        const products: OFFProduct[] = (json.products ?? []).filter((p: OFFProduct) => {
          const n = p.nutriments
          if (!n) return false
          const cal = n['energy-kcal_serving'] ?? n['energy-kcal_100g']
          return p.product_name && cal != null
        }).slice(0, 8)
        setSearchResults(products)
        setSearched(true)
      } catch (e) {
        setSearchError((e as Error)?.message)
      } finally {
        setSearchLoading(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery, tab])

  function handleSelectProduct(product: OFFProduct) {
    const n = product.nutriments
    if (!n) return
    const useServing = n['energy-kcal_serving'] != null
    const calories = useServing ? (n['energy-kcal_serving'] ?? null) : (n['energy-kcal_100g'] ?? null)
    const protein = useServing ? (n['proteins_serving'] ?? null) : (n['proteins_100g'] ?? null)
    const carbs = useServing ? (n['carbohydrates_serving'] ?? null) : (n['carbohydrates_100g'] ?? null)
    const fat = useServing ? (n['fat_serving'] ?? null) : (n['fat_100g'] ?? null)
    const suffix = !useServing ? ` (${t('на 100г')})` : ''
    setEditResult({
      dish: product.product_name + suffix,
      calories: calories != null ? Math.round(calories) : null,
      protein_g: protein != null ? Math.round(protein * 10) / 10 : null,
      carbs_g: carbs != null ? Math.round(carbs * 10) / 10 : null,
      fat_g: fat != null ? Math.round(fat * 10) / 10 : null,
    })
    setError(null)
  }

  return (
    <div className="meal-logger">
      <div className="meal-logger-tabs">
        <button className={`meal-tab${tab === 'photo' ? ' active' : ''}`} onClick={() => switchTab('photo')}>📸 {t('Фото')}</button>
        <button className={`meal-tab${tab === 'search' ? ' active' : ''}`} onClick={() => switchTab('search')}>🔍 {t('Поиск')}</button>
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
          {/* без capture — на телефоне OS даёт выбор: камера или галерея */}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
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

      {tab === 'search' && !editResult && (
        <>
          <input
            className="log-input"
            style={{ marginTop: 4 }}
            type="text"
            placeholder={t('Поиск продукта…')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchLoading && (
            <p className="settings-muted" style={{ fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="ai-spinner" style={{ borderColor: 'rgba(108,143,255,0.3)', borderTopColor: 'var(--accent)' }} />
              {t('Ищу…')}
            </p>
          )}
          {searchError && <p className="auth-error" style={{ marginTop: 8 }}>{searchError}</p>}
          {!searchLoading && searched && searchResults.length === 0 && (
            <p className="settings-muted" style={{ fontSize: 13, marginTop: 8 }}>{t('Ничего не найдено')}</p>
          )}
          {!searchLoading && searchResults.length > 0 && (
            <div className="off-results">
              {searchResults.map((product, i) => {
                const n = product.nutriments
                const useServing = n?.['energy-kcal_serving'] != null
                const cal = useServing ? n?.['energy-kcal_serving'] : n?.['energy-kcal_100g']
                const suffix = !useServing ? ` · ${t('на 100г')}` : ''
                return (
                  <button
                    key={i}
                    className="off-result-btn"
                    onClick={() => handleSelectProduct(product)}
                  >
                    <span className="off-result-name">{product.product_name}</span>
                    <span className="off-result-cal">{Math.round(cal!)} {t('ккал')}{suffix}</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {error && <p className="auth-error" style={{ marginTop: 8 }}>{error}</p>}

      {!editResult && tab !== 'search' && (
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
