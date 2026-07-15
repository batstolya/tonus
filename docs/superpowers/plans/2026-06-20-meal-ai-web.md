# Meal AI Web Input Implementation Plan

> [!CAUTION]
> Historical execution record. Do not run deployment commands from this file.
> Use `docs/guides/edge-function-deployments.md` and `npm run deploy:functions`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered meal logging directly from the web — user uploads a photo or types what they ate, Gemini returns dish name + calories + macros, result is saved to `intake_events` and shown in NutritionScreen.

**Architecture:** New Deno edge function `classify-meal` handles both photo (base64) and text prompts via Gemini 2.5 Flash. A `MealLogger` React component lives inside NutritionScreen — tab switcher (photo | text), calls the edge function, shows editable result, saves on confirm. Reuses `costGuard`, `ai_usage`, existing `intake_events` schema.

**Tech Stack:** Deno edge function, Gemini 2.5 Flash (vision + text), React, Supabase JS client, existing `intake_events` table (`calories`, `protein_g`, `carbs_g`, `fat_g` columns already exist).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/functions/classify-meal/index.ts` | **Create** | Edge function: accepts `{ image?: {base64,mime}, text?: string }`, calls Gemini, returns `{ dish, calories, protein_g, carbs_g, fat_g }` |
| `src/components/nutrition/MealLogger.tsx` | **Create** | React component: photo tab + text tab, calls edge fn, editable result, save button |
| `src/components/nutrition/NutritionScreen.tsx` | **Modify** | Import MealLogger, show it at top (replaces "отправь боту" hint), refresh meals after save |
| `src/lib/translations.ts` | **Modify** | Add uk/en strings for MealLogger UI |
| `src/index.css` | **Modify** | Add `.meal-logger` CSS |

---

### Task 1: Edge function `classify-meal`

**Files:**
- Create: `supabase/functions/classify-meal/index.ts`

- [ ] Create the file:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const budget = await checkBudget(supabase, user.id)
    if (!budget.ok) return new Response(JSON.stringify({ error: budgetExceededMessage(budget) }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

    const { image, text } = await req.json() as { image?: { base64: string; mime: string }; text?: string }

    let parts: unknown[]
    let prompt: string

    if (image) {
      prompt = `На фото — еда. Оцени блюдо и его пищевую ценность по виду и типичным порциям.${text ? ` Подпись: "${text}".` : ''}
Верни ТОЛЬКО JSON: {"dish":"название блюда на русском","calories":число,"protein_g":число,"carbs_g":число,"fat_g":число,"is_food":true}`
      parts = [{ text: prompt }, { inline_data: { mime_type: image.mime, data: image.base64 } }]
    } else if (text) {
      prompt = `Пользователь написал что съел: "${text}".
Оцени калории и БЖУ по типичным порциям (напр. "бигмак и кола" ≈ 750 ккал).
Верни ТОЛЬКО JSON: {"dish":"краткое название","calories":число,"protein_g":число,"carbs_g":число,"fat_g":число}`
      parts = [{ text: prompt }]
    } else {
      return new Response(JSON.stringify({ error: 'Provide image or text' }), { status: 400, headers: CORS })
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 256, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const data = await res.json()
    const tokens = data.usageMetadata?.totalTokenCount ?? 0
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const parsed = JSON.parse(raw)

    if (parsed.is_food === false) {
      return new Response(JSON.stringify({ error: 'not_food' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    await supabase.from('ai_usage').insert({ user_id: user.id, source: 'meal-classify', tokens_used: tokens })

    return new Response(JSON.stringify({
      dish: parsed.dish ?? null,
      calories: parsed.calories ?? null,
      protein_g: parsed.protein_g ?? null,
      carbs_g: parsed.carbs_g ?? null,
      fat_g: parsed.fat_g ?? null,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? 'Error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
```

- [ ] Deploy:
```bash
npx supabase functions deploy classify-meal --project-ref mxnmubakfzqoosgsqmhh
```

- [ ] Commit:
```bash
git add supabase/functions/classify-meal/index.ts
git commit -m "feat: classify-meal edge function — photo or text → calories+macros via Gemini"
```

---

### Task 2: `MealLogger` React component

**Files:**
- Create: `src/components/nutrition/MealLogger.tsx`

- [ ] Create the file:

```tsx
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
  const [result, setResult] = useState<MealResult | null>(null)
  const [editResult, setEditResult] = useState<MealResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setPreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      setImageData({ base64, mime: file.type })
      setResult(null); setEditResult(null); setError(null)
    }
    reader.readAsDataURL(file)
  }

  async function handleAnalyze() {
    setLoading(true); setError(null); setResult(null); setEditResult(null)
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
      if (json.error === 'not_food') { setError(t('На фото не видно еды. Попробуй другое фото.')); setLoading(false); return }
      if (json.error) { setError(json.error); setLoading(false); return }
      setResult(json); setEditResult(json)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  async function handleSave() {
    if (!editResult) return
    setSaving(true)
    const ts = new Date().toISOString()
    await supabase.from('intake_events').insert({
      user_id: user.id, ts, type: 'meal',
      note: editResult.dish || text || t('Еда'),
      calories: editResult.calories,
      protein_g: editResult.protein_g,
      carbs_g: editResult.carbs_g,
      fat_g: editResult.fat_g,
    })
    setSaving(false)
    setResult(null); setEditResult(null); setPreview(null)
    setImageData(null); setText('')
    onSaved()
  }

  const canAnalyze = tab === 'photo' ? !!imageData : text.trim().length > 2

  return (
    <div className="meal-logger">
      <div className="meal-logger-tabs">
        <button className={`meal-tab${tab === 'photo' ? ' active' : ''}`} onClick={() => { setTab('photo'); setResult(null); setEditResult(null); setError(null) }}>📸 {t('Фото')}</button>
        <button className={`meal-tab${tab === 'text' ? ' active' : ''}`} onClick={() => { setTab('text'); setResult(null); setEditResult(null); setError(null) }}>✏️ {t('Текст')}</button>
      </div>

      {tab === 'photo' && (
        <div
          className={`meal-drop${preview ? ' has-preview' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        >
          {preview
            ? <img src={preview} alt="preview" className="meal-preview" />
            : <div className="meal-drop-hint"><span>📷</span><span>{t('Нажми или перетащи фото блюда')}</span></div>}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      )}

      {tab === 'text' && (
        <textarea
          className="meal-text-input"
          placeholder={t('Что съел? Напр.: «бигмак и кола» или «овсянка 200г с бананом»')}
          value={text}
          onChange={e => { setText(e.target.value); setResult(null); setEditResult(null) }}
          rows={3}
        />
      )}

      {tab === 'photo' && imageData && (
        <textarea
          className="meal-text-input"
          placeholder={t('Уточни блюдо или порцию (необязательно)')}
          value={text}
          onChange={e => setText(e.target.value)}
          rows={2}
          style={{ marginTop: 8 }}
        />
      )}

      {error && <p className="auth-error" style={{ marginTop: 8 }}>{error}</p>}

      {!result && (
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
                <input type="number" value={editResult[key] ?? ''} min={0}
                  onChange={e => setEditResult(r => ({ ...r!, [key]: e.target.value === '' ? null : Number(e.target.value) }))} />
              </label>
            ))}
          </div>
          <p className="settings-muted" style={{ fontSize: 12, margin: '6px 0 10px' }}>{t('Оценка ИИ — можно поправить перед сохранением.')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
              {saving ? t('Сохраняю…') : t('Сохранить')}
            </button>
            <button className="btn btn-secondary" onClick={() => { setResult(null); setEditResult(null); setError(null) }}>
              {t('Заново')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] Commit:
```bash
git add src/components/nutrition/MealLogger.tsx
git commit -m "feat: MealLogger component — photo/text tab, AI analysis, editable result"
```

---

### Task 3: Wire MealLogger into NutritionScreen

**Files:**
- Modify: `src/components/nutrition/NutritionScreen.tsx`

- [ ] Add import and state for refreshing after save, replace the "отправь боту" hint with MealLogger, add refresh callback:

At the top of the file add the import:
```typescript
import { MealLogger } from './MealLogger'
```

Replace the empty-state return:
```tsx
  if (!meals.length) return (
    <div className="screen">
      <h2>{t('Питание')}</h2>
      <MealLogger user={user} onSaved={() => {
        // reload meals
        const since = new Date(Date.now() - 30 * 86400000).toISOString()
        supabase.from('intake_events')
          .select('ts, note, calories, protein_g, carbs_g, fat_g')
          .eq('user_id', user.id).eq('type', 'meal')
          .gte('ts', since).order('ts', { ascending: false })
          .then(({ data }) => setMeals((data ?? []) as Meal[]))
      }} />
    </div>
  )
```

Add MealLogger ALSO at the top of the full screen (before `nutr-today`), with a refresh handler extracted to a `loadMeals` function:

```tsx
  function loadMeals() {
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    supabase.from('intake_events')
      .select('ts, note, calories, protein_g, carbs_g, fat_g')
      .eq('user_id', user.id).eq('type', 'meal')
      .gte('ts', since).order('ts', { ascending: false })
      .then(({ data }) => setMeals((data ?? []) as Meal[]))
  }
```

- [ ] Commit:
```bash
git add src/components/nutrition/NutritionScreen.tsx
git commit -m "feat: add MealLogger to NutritionScreen top — AI food input from web"
```

---

### Task 4: CSS + translations

**Files:**
- Modify: `src/index.css`
- Modify: `src/lib/translations.ts`

- [ ] Add to `src/index.css`:
```css
/* MealLogger */
.meal-logger { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 20px; }
.meal-logger-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.meal-tab { flex: 1; padding: 7px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface2); color: var(--text-muted); cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.15s; }
.meal-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.meal-drop { border: 2px dashed var(--border); border-radius: 10px; cursor: pointer; min-height: 120px; display: flex; align-items: center; justify-content: center; transition: border-color 0.15s; }
.meal-drop:hover { border-color: var(--accent); }
.meal-drop-hint { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-muted); font-size: 13px; }
.meal-drop-hint span:first-child { font-size: 32px; }
.meal-preview { max-width: 100%; max-height: 240px; border-radius: 8px; object-fit: cover; }
.meal-text-input { width: 100%; box-sizing: border-box; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 14px; color: var(--text); resize: vertical; font-family: inherit; }
.meal-result { margin-top: 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
.meal-result-dish { font-size: 15px; margin-bottom: 10px; }
.meal-result-fields { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 8px; }
.meal-result-field { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--text-muted); }
.meal-result-field input { padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 14px; font-weight: 600; width: 100%; box-sizing: border-box; }
```

- [ ] Add to `src/lib/translations.ts` before closing `}`:
```typescript
  // ── MealLogger ─────────────────────────────────────────────────────────────
  'Фото': { uk: 'Фото', en: 'Photo' },
  'Текст': { uk: 'Текст', en: 'Text' },
  'Нажми или перетащи фото блюда': { uk: 'Натисни або перетягни фото страви', en: 'Click or drop a food photo' },
  'Уточни блюдо или порцию (необязательно)': { uk: 'Уточни страву або порцію (необов\'язково)', en: 'Clarify dish or portion (optional)' },
  'Что съел? Напр.: «бигмак и кола» или «овсянка 200г с бананом»': { uk: 'Що їв? Напр.: «біг мак і кола» або «вівсянка 200г з бананом»', en: 'What did you eat? E.g. "Big Mac and Coke" or "oatmeal 200g with banana"' },
  'Оценить калории (ИИ)': { uk: 'Оцінити калорії (ШІ)', en: 'Estimate calories (AI)' },
  'Анализирую…': { uk: 'Аналізую…', en: 'Analyzing…' },
  'Оценка ИИ — можно поправить перед сохранением.': { uk: 'Оцінка ШІ — можна виправити перед збереженням.', en: 'AI estimate — you can edit before saving.' },
  'Заново': { uk: 'Знову', en: 'Retry' },
  'Сохраняю…': { uk: 'Зберігаю…', en: 'Saving…' },
  'На фото не видно еды. Попробуй другое фото.': { uk: 'На фото не видно їжі. Спробуй інше фото.', en: 'No food detected in the photo. Try a different one.' },
  'Блюдо': { uk: 'Страва', en: 'Dish' },
```

- [ ] Commit:
```bash
git add src/index.css src/lib/translations.ts
git commit -m "feat: MealLogger CSS + translations (ru/uk/en)"
```

---

### Task 5: Deploy edge function + push

- [ ] Deploy:
```bash
npx supabase functions deploy classify-meal --project-ref mxnmubakfzqoosgsqmhh
```

- [ ] TypeScript check:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] Push:
```bash
git push
```

---

## Self-review

**Spec coverage:**
- ✅ Photo → Gemini vision → calories+macros (Task 1 + 2)
- ✅ Text → Gemini → calories+macros (Task 1 + 2)
- ✅ Result is editable before saving (Task 2 `editResult` state)
- ✅ Saves to `intake_events` with calories/protein_g/carbs_g/fat_g (Task 2 + 3)
- ✅ Appears in NutritionScreen history immediately (Task 3 `onSaved` refresh)
- ✅ Budget guard (Task 1 `checkBudget`)
- ✅ Tokens logged to `ai_usage` (Task 1)
- ✅ Translations for all 3 languages (Task 4)

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:** `MealResult` defined in Task 2, used consistently. `onSaved: () => void` in Props matches call sites in Task 3.
