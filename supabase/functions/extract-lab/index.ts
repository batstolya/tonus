import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, budgetExceededMessage } from '../_shared/costGuard.ts'
import { aiConsentRequiredResponse, fetchGeminiWithConsent, isAiConsentRequired } from '../_shared/aiConsent.ts'
import { corsHeadersFor } from '../_shared/cors.ts'
import { identifyAnalyte } from '../_shared/analytes.ts'
import { resolveSampleDate } from '../_shared/labSampleDate.ts'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const ALLOWED_ORIGINS = Deno.env.get('TONUS_ALLOWED_ORIGINS') ?? ''

serve(async (req) => {
  const CORS = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })
    // AI Cost Guard
    const budget = await checkBudget(supabase, user.id)
    if (!budget.ok) return new Response(JSON.stringify({ error: 'budget_exceeded', message: budgetExceededMessage(budget) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } })


    const { fileName, fileType, fileBase64, date } = await req.json()
    if (!fileBase64) return new Response('Missing file', { status: 400, headers: CORS })

    const isPdf = fileType === 'application/pdf'
    const isImage = fileType.startsWith('image/')

    let extractedText = ''
    let biomarkers: { marker: string; value: number; unit?: string; ref_range?: string; flag?: string }[] = []
    // The collection date as printed on the form, when the model found one.
    let formSampleDate: string | null = null

    if (isPdf || isImage) {
      const mimeType = fileType
      const geminiRes = await fetchGeminiWithConsent(
        supabase,
        user.id,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: `Ты — ассистент для оцифровки бланков медицинских анализов (любой язык: укр/рус/польский/английский/испанский).
НЕ переписывай шапку бланка, реквизиты лаборатории и данные пациента. Не транскрибируй документ.
Извлекай ТОЛЬКО строки таблицы результатов с числовым значением — КАЖДУЮ, все показатели на всех страницах, а не только важные.
Для каждого: marker (название как в бланке), value (число; десятичную запятую переведи в точку; диапазоны/«<5» вынеси в ref_range), unit, ref_range (референсные значения если есть), flag ("low"/"high"/"normal" если бланк помечает отклонение).
Не выдумывай показатели.
Отдельно верни sample_date — дату ЗАБОРА материала с бланка (формат YYYY-MM-DD; если на бланке виден только месяц — YYYY-MM). Это НЕ дата печати, выдачи или регистрации результата. Если даты забора на бланке нет — верни пустую строку, НЕ подставляй никакую другую дату.` }]
            },
            contents: [{
              parts: [
                { text: 'Оцифруй этот бланк анализов полностью:' },
                { inlineData: { mimeType, data: fileBase64 } }
              ]
            }],
            generationConfig: {
              maxOutputTokens: 16384,
              temperature: 0,
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'object',
                properties: {
                  markers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        marker: { type: 'string' },
                        value: { type: 'number' },
                        unit: { type: 'string' },
                        ref_range: { type: 'string' },
                        flag: { type: 'string' },
                      },
                      required: ['marker', 'value'],
                    },
                  },
                  sample_date: { type: 'string' },
                },
                required: ['markers'],
              },
            },
          }),
        }
      )

      if (!geminiRes.ok) throw new Error(`Gemini error: ${await geminiRes.text()}`)

      const geminiData = await geminiRes.json()
      const cand = geminiData.candidates?.[0]
      const raw = cand?.content?.parts?.[0]?.text ?? '{}'
      const finishReason = cand?.finishReason ?? 'unknown'
      const tokensUsed = geminiData.usageMetadata?.totalTokenCount ?? null
      if (tokensUsed) await supabase.from('ai_usage').insert({ user_id: user.id, source: 'extract-lab', tokens_used: tokensUsed })

      try {
        const parsed = JSON.parse(raw)
        biomarkers = Array.isArray(parsed.markers) ? parsed.markers : []
        formSampleDate = typeof parsed.sample_date === 'string' ? parsed.sample_date : null
        const lines = biomarkers.map(b => `${b.marker}: ${b.value}${b.unit ? ' ' + b.unit : ''}${b.ref_range ? ` (норма ${b.ref_range})` : ''}${b.flag && b.flag !== 'normal' ? ` [${b.flag}]` : ''}`)
        extractedText = lines.join('\n')
        if (biomarkers.length === 0) extractedText = `[Не распознано ни одного показателя. finishReason=${finishReason}]`
      } catch {
        // JSON обрезан/невалиден (часто finishReason=MAX_TOKENS) — сохраняем диагностику
        extractedText = `[Ответ ИИ не разобран, finishReason=${finishReason}]\n\n${raw.slice(0, 2000)}`
      }
    }

    // The form wins, then the file name, then the upload field. Never today:
    // that fallback is what stamped a year of results with their upload day.
    const sample = resolveSampleDate(formSampleDate, fileName, date)

    // Save lab file record
    const { data: labFile, error: insertErr } = await supabase
      .from('lab_files')
      .insert({
        user_id: user.id,
        file_name: fileName,
        file_type: fileType,
        date: date || null,
        sample_date: sample.date,
        sample_date_precision: sample.precision,
        extracted_text: extractedText,
      })
      .select()
      .single()

    if (insertErr || !labFile) throw new Error('Failed to save lab file')

    if (biomarkers.length > 0) {
      const rows = biomarkers
        .filter(b => b.marker && typeof b.value === 'number' && isFinite(b.value))
        .map(b => ({
          user_id: user.id,
          lab_file_id: labFile.id,
          marker: b.marker,
          value: b.value,
          unit: b.unit || null,
          ref_range: b.ref_range || null,
          flag: b.flag && ['low', 'high', 'normal'].includes(b.flag) ? b.flag : null,
          // `date` stays the import date; anything chronological reads sample_date.
          date: date || new Date().toISOString().slice(0, 10),
          sample_date: sample.date,
          sample_date_precision: sample.precision,
          analyte_key: identifyAnalyte(b.marker, b.unit ?? null)?.key ?? null,
        }))
      if (rows.length > 0) {
        await supabase.from('lab_results').insert(rows)
      }
    }

    return new Response(JSON.stringify(labFile), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (isAiConsentRequired(e)) return aiConsentRequiredResponse(CORS)
    return new Response((e as Error).message ?? 'Error', { status: 500, headers: CORS })
  }
})
