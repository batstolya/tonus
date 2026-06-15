import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

    const { fileName, fileType, fileBase64, date } = await req.json()
    if (!fileBase64) return new Response('Missing file', { status: 400, headers: CORS })

    const isPdf = fileType === 'application/pdf'
    const isImage = fileType.startsWith('image/')

    let extractedText = ''

    if (isPdf || isImage) {
      // Use Gemini Vision to extract text from the file
      const mimeType = fileType
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: 'Ты — ассистент для обработки медицинских анализов. Извлеки весь текст из документа максимально точно. Затем выдели ключевые биомаркеры в виде JSON-массива в конце ответа в блоке ```json ... ```. Формат: [{marker: "Название показателя", value: число, unit: "единица"}]. Если биомаркеров нет — верни пустой массив.' }]
            },
            contents: [{
              parts: [
                { text: 'Извлеки текст и биомаркеры из этого документа с результатами анализов:' },
                { inlineData: { mimeType, data: fileBase64 } }
              ]
            }],
            generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
          }),
        }
      )

      if (!geminiRes.ok) {
        const err = await geminiRes.text()
        throw new Error(`Gemini error: ${err}`)
      }

      const geminiData = await geminiRes.json()
      extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const tokensUsed = geminiData.usageMetadata?.totalTokenCount ?? null
      if (tokensUsed) {
        await supabase.from('ai_usage').insert({ user_id: user.id, source: 'extract-lab', tokens_used: tokensUsed })
      }
    }

    // Parse biomarkers from the response
    let biomarkers: { marker: string; value: number; unit: string }[] = []
    const jsonMatch = extractedText.match(/```json\s*([\s\S]*?)```/)
    if (jsonMatch) {
      try {
        biomarkers = JSON.parse(jsonMatch[1])
      } catch { /* ignore parse error */ }
    }

    // Save lab file record
    const { data: labFile, error: insertErr } = await supabase
      .from('lab_files')
      .insert({
        user_id: user.id,
        file_name: fileName,
        file_type: fileType,
        date: date || null,
        extracted_text: extractedText,
      })
      .select()
      .single()

    if (insertErr || !labFile) throw new Error('Failed to save lab file')

    // Save extracted biomarkers
    if (biomarkers.length > 0 && date) {
      const rows = biomarkers
        .filter(b => b.marker && typeof b.value === 'number')
        .map(b => ({
          user_id: user.id,
          lab_file_id: labFile.id,
          marker: b.marker,
          value: b.value,
          unit: b.unit || null,
          date,
        }))
      if (rows.length > 0) {
        await supabase.from('lab_results').insert(rows)
      }
    }

    return new Response(JSON.stringify(labFile), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(e.message ?? 'Error', { status: 500, headers: CORS })
  }
})
