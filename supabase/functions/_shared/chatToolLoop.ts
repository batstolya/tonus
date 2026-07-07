// Цикл function-calling для чата (design doc, раздел 9.2). Чистая функция:
// сеть/БД приходят через инъекцию (callGemini/executeTool), поэтому тестируется
// без реального вызова Gemini или Supabase.

// Часть хода Gemini: текст, вызов функции или ответ функции. Форма гибкая
// (v1beta REST), поэтому поля опциональны и не пытаемся описать их строго.
export interface GeminiPart {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: unknown }
  [key: string]: unknown
}

export interface ChatLoopMessage {
  // v1beta REST API принимает только 'user' и 'model'; functionResponse
  // передаётся ходом с role 'user' сразу после model-хода с functionCall.
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface GeminiCallResult {
  parts: GeminiPart[]
  tokensUsed: number
}

export type CallGemini = (contents: ChatLoopMessage[], withTools: boolean) => Promise<GeminiCallResult>
export type ExecuteTool = (name: string, args: Record<string, unknown>) => Promise<unknown>

export interface ChatLoopResult {
  reply: string
  totalTokens: number
}

const MAX_TOOL_ROUNDS = 2 // доп. раунды сверх начального вызова; последний раунд всегда без tools

export async function runChatLoop(
  initialContents: ChatLoopMessage[],
  callGemini: CallGemini,
  executeTool: ExecuteTool,
): Promise<ChatLoopResult> {
  let contents = initialContents
  let totalTokens = 0

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const withTools = round < MAX_TOOL_ROUNDS
    const res = await callGemini(contents, withTools)
    totalTokens += res.tokensUsed

    const functionCalls = res.parts.filter((p) => p.functionCall)
    if (!functionCalls.length) {
      const text = res.parts.find((p) => typeof p.text === 'string')?.text ?? 'Не удалось получить ответ.'
      return { reply: text, totalTokens }
    }

    contents = [...contents, { role: 'model', parts: res.parts }]
    const functionResponses: GeminiPart[] = []
    for (const fc of functionCalls) {
      const { name, args } = fc.functionCall!
      let response: unknown
      try {
        response = await executeTool(name, args ?? {})
      } catch (e) {
        response = { error: e instanceof Error ? e.message : String(e) }
      }
      functionResponses.push({ functionResponse: { name, response } })
    }
    contents = [...contents, { role: 'user', parts: functionResponses }]
  }

  return { reply: 'Не удалось получить ответ.', totalTokens }
}
