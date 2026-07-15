# Chat debug-режим «причина в скобках» — Implementation Plan

> [!CAUTION]
> Historical execution record. Do not run deployment commands from this file.
> Use `docs/guides/edge-function-deployments.md` and `npm run deploy:functions`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Временно (за env-флагом) показывать под каждым ответом чата приглушённую строку в скобках с самообъяснением модели и фактической трассой вызванных инструментов, чтобы ловить галлюцинации.

**Architecture:** Сервер (`chat-health`) при флаге `CHAT_DEBUG_REASON=1` просит у модели итоговый ответ как JSON `{answer, reason}`, парсит его, добавляет фактическую трассу tool-вызовов из петли и отдаёт `debug` отдельным полем. В историю пишется только чистый `answer`. Клиент рендерит `debug`, если он пришёл.

**Tech Stack:** Deno edge function (Supabase), Gemini 2.5 function-calling, React + Vite, vitest (окружение node — компоненты не рендерим, чистую логику тестируем напрямую). Всё требует Node 24.

**База:** ветка `feat/chat-debug-reason` от `origin/main` (worktree). Работать в ней.

---

## File Structure

- **Modify** `supabase/functions/_shared/chatToolLoop.ts` — `ChatLoopResult` получает `toolCalls[]`; петля их копит.
- **Create** `supabase/functions/_shared/chatDebug.ts` — чистые хелперы `parseDebugReply` и `formatToolTrace` (тестируемы без сети/БД).
- **Create** `supabase/functions/_shared/chatDebug.test.ts` — юниты на хелперы.
- **Modify** `supabase/functions/_shared/chatToolLoop.test.ts` — покрытие нового `toolCalls`.
- **Modify** `supabase/functions/chat-health/index.ts` — флаг `DEBUG`, доп. инструкция в промпт, парс, сборка `debug`, чистый `answer` в историю, `debug` в ответе.
- **Modify** `src/lib/chat.ts` — типы `ChatDebug`, проброс `debug` из `sendChatMessage`, опциональное поле в `ChatMessage`.
- **Modify** `src/components/chat/ChatWidget.tsx` — рендер строки debug в скобках; заполнение `debug` у нового сообщения.
- **Modify** `src/index.css` (или файл со стилями `.chat-bubble`) — класс `.chat-debug`.

---

## Task 1: `runChatLoop` возвращает трассу инструментов

**Files:**
- Modify: `supabase/functions/_shared/chatToolLoop.ts:29-32` (интерфейс) и тело функции
- Test: `supabase/functions/_shared/chatToolLoop.test.ts`

- [ ] **Step 1: Написать падающий тест**

Добавить в `chatToolLoop.test.ts` (следуй существующему стилю файла — те же импорты и хелперы-моки `callGemini`/`executeTool`):

```ts
import { describe, it, expect } from 'vitest'
import { runChatLoop, type ChatLoopMessage, type GeminiCallResult } from './chatToolLoop.ts'

describe('runChatLoop toolCalls', () => {
  it('собирает все вызванные инструменты в порядке вызова', async () => {
    // 1-й ход: модель зовёт get_sleep_range; 2-й ход: текстовый ответ
    const responses: GeminiCallResult[] = [
      { parts: [{ functionCall: { name: 'get_sleep_range', args: { start_date: '2026-06-01', end_date: '2026-06-30' } } }], tokensUsed: 10 },
      { parts: [{ text: '{"answer":"ок","reason":"по данным сна"}' }], tokensUsed: 5 },
    ]
    let i = 0
    const callGemini = async () => responses[i++]
    const executeTool = async () => ({ rows: [] })
    const res = await runChatLoop([{ role: 'user', parts: [{ text: 'q' }] }] as ChatLoopMessage[], callGemini, executeTool)
    expect(res.toolCalls).toEqual([{ name: 'get_sleep_range', args: { start_date: '2026-06-01', end_date: '2026-06-30' } }])
    expect(res.reply).toContain('answer')
  })

  it('без вызовов инструментов toolCalls пустой', async () => {
    const callGemini = async () => ({ parts: [{ text: 'просто текст' }], tokensUsed: 3 })
    const executeTool = async () => ({})
    const res = await runChatLoop([{ role: 'user', parts: [{ text: 'q' }] }] as ChatLoopMessage[], callGemini, executeTool)
    expect(res.toolCalls).toEqual([])
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx vitest run supabase/functions/_shared/chatToolLoop.test.ts`
Expected: FAIL — `res.toolCalls` равен `undefined` (свойство ещё не существует).

- [ ] **Step 3: Реализация — копить и возвращать toolCalls**

В `chatToolLoop.ts` расширить интерфейс:

```ts
export interface ChatLoopResult {
  reply: string
  totalTokens: number
  toolCalls: { name: string; args: Record<string, unknown> }[]
}
```

В теле `runChatLoop` до цикла завести аккумулятор и наполнять его в цикле, возвращать во всех точках выхода:

```ts
  let contents = initialContents
  let totalTokens = 0
  const toolCalls: { name: string; args: Record<string, unknown> }[] = []

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const withTools = round < MAX_TOOL_ROUNDS
    const res = await callGemini(contents, withTools)
    totalTokens += res.tokensUsed

    const functionCalls = res.parts.filter((p) => p.functionCall)
    if (!functionCalls.length) {
      const text = res.parts.find((p) => typeof p.text === 'string')?.text ?? 'Не удалось получить ответ.'
      return { reply: text, totalTokens, toolCalls }
    }

    contents = [...contents, { role: 'model', parts: res.parts }]
    const functionResponses: GeminiPart[] = []
    for (const fc of functionCalls) {
      const { name, args } = fc.functionCall!
      toolCalls.push({ name, args: args ?? {} })
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

  return { reply: 'Не удалось получить ответ.', totalTokens, toolCalls }
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run supabase/functions/_shared/chatToolLoop.test.ts`
Expected: PASS (включая ранее существовавшие тесты файла).

- [ ] **Step 5: Коммит**

```bash
git add supabase/functions/_shared/chatToolLoop.ts supabase/functions/_shared/chatToolLoop.test.ts
git commit -m "feat(chat): runChatLoop возвращает трассу вызванных инструментов"
```

---

## Task 2: Чистые хелперы `parseDebugReply` и `formatToolTrace`

**Files:**
- Create: `supabase/functions/_shared/chatDebug.ts`
- Test: `supabase/functions/_shared/chatDebug.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `supabase/functions/_shared/chatDebug.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseDebugReply, formatToolTrace } from './chatDebug.ts'

describe('parseDebugReply', () => {
  it('парсит чистый JSON', () => {
    expect(parseDebugReply('{"answer":"Сон 7ч","reason":"по контексту"}'))
      .toEqual({ answer: 'Сон 7ч', reason: 'по контексту' })
  })
  it('снимает ```json ограждение', () => {
    const raw = '```json\n{"answer":"ок","reason":"r"}\n```'
    expect(parseDebugReply(raw)).toEqual({ answer: 'ок', reason: 'r' })
  })
  it('на мусоре — фолбэк: сырой текст как answer, пустой reason', () => {
    expect(parseDebugReply('просто текст без json'))
      .toEqual({ answer: 'просто текст без json', reason: '' })
  })
  it('на JSON без answer — фолбэк', () => {
    expect(parseDebugReply('{"reason":"есть, а answer нет"}'))
      .toEqual({ answer: '{"reason":"есть, а answer нет"}', reason: '' })
  })
})

describe('formatToolTrace', () => {
  it('диапазонные инструменты → name(start..end)', () => {
    expect(formatToolTrace([{ name: 'get_sleep_range', args: { start_date: '2026-06-01', end_date: '2026-06-30' } }]))
      .toEqual(['get_sleep_range(2026-06-01..2026-06-30)'])
  })
  it('get_lab_history → name(marker)', () => {
    expect(formatToolTrace([{ name: 'get_lab_history', args: { marker: 'Ферритин' } }]))
      .toEqual(['get_lab_history(Ферритин)'])
  })
  it('get_correlations → name(outcome|all)', () => {
    expect(formatToolTrace([
      { name: 'get_correlations', args: { outcome: 'hrv' } },
      { name: 'get_correlations', args: {} },
    ])).toEqual(['get_correlations(hrv)', 'get_correlations(all)'])
  })
  it('пустой список → пустой массив', () => {
    expect(formatToolTrace([])).toEqual([])
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run supabase/functions/_shared/chatDebug.test.ts`
Expected: FAIL — модуль `./chatDebug.ts` не найден.

- [ ] **Step 3: Реализация хелперов**

Создать `supabase/functions/_shared/chatDebug.ts`:

```ts
// Хелперы debug-режима чата (временный диагностический режим за флагом
// CHAT_DEBUG_REASON). Чистые функции — тестируются без сети/БД.

export interface DebugReply {
  answer: string
  reason: string
}

// Разбирает итоговый JSON-ответ модели {answer, reason}. При любом сбое —
// безопасный фолбэк: сырой текст как answer, пустой reason (чат не падает).
export function parseDebugReply(raw: string): DebugReply {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const obj = JSON.parse(stripped)
    if (obj && typeof obj.answer === 'string') {
      return { answer: obj.answer, reason: typeof obj.reason === 'string' ? obj.reason : '' }
    }
  } catch { /* не JSON — фолбэк ниже */ }
  return { answer: raw, reason: '' }
}

// Компактная строка на каждый фактический вызов инструмента для показа в скобках.
export function formatToolTrace(
  toolCalls: { name: string; args: Record<string, unknown> }[],
): string[] {
  return toolCalls.map(({ name, args }) => {
    if (name === 'get_metrics_range' || name === 'get_sleep_range') {
      return `${name}(${args.start_date ?? '?'}..${args.end_date ?? '?'})`
    }
    if (name === 'get_lab_history') return `${name}(${args.marker ?? '?'})`
    if (name === 'get_correlations') return `${name}(${args.outcome ?? 'all'})`
    return `${name}(${JSON.stringify(args)})`
  })
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run supabase/functions/_shared/chatDebug.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add supabase/functions/_shared/chatDebug.ts supabase/functions/_shared/chatDebug.test.ts
git commit -m "feat(chat): чистые хелперы parseDebugReply/formatToolTrace для debug-режима"
```

---

## Task 3: Проводка в `chat-health/index.ts`

**Files:**
- Modify: `supabase/functions/chat-health/index.ts` (импорты; тело `serve` после `runChatLoop`; сборка промпта; финальный `Response`)

> Примечание: `index.ts` не покрывается юнитами (Deno.serve + сеть) — вся тестируемая логика вынесена в Task 1–2. Здесь только проводка; проверка — типами (`tsc`) и ручным E2E.

- [ ] **Step 1: Добавить импорт хелперов**

В шапку `chat-health/index.ts` рядом с существующими `_shared`-импортами:

```ts
import { parseDebugReply, formatToolTrace } from '../_shared/chatDebug.ts'
```

- [ ] **Step 2: Флаг и доп. инструкция промпта**

Сразу после определения `SYSTEM_PROMPT` (после строки с закрывающей `` ` `` промпта) добавить:

```ts
const DEBUG = Deno.env.get('CHAT_DEBUG_REASON') === '1'
const DEBUG_INSTRUCTION = `\n\nВАЖНО (диагностический режим): итоговый ответ верни СТРОГО как JSON-объект без markdown-ограждения и без текста вокруг: {"answer": "<твой обычный ответ пользователю>", "reason": "<на каких именно данных/инструментах построен ответ, 1-2 предложения>"}. Промежуточные вызовы инструментов делай как обычно — JSON нужен только в самом последнем, текстовом ответе.`
```

- [ ] **Step 3: Подмешать инструкцию в системный ход (только при DEBUG)**

Найти формирование первого элемента `geminiContents` (system как первый user-ход) и добавить `${DEBUG ? DEBUG_INSTRUCTION : ''}` в конец текста:

```ts
      {
        role: 'user',
        parts: [{ text: `${sys.text}\nОтвечай на ${replyLang} языке.${metaLine}${contextText}\n\nПользователь задаёт вопрос о своих данных здоровья.${DEBUG ? DEBUG_INSTRUCTION : ''}` }],
      },
```

- [ ] **Step 4: После runChatLoop — распарсить и собрать debug**

Заменить блок после вызова `runChatLoop` (получение `reply`, сохранение, ответ). Текущий код:

```ts
    const { reply, totalTokens: tokensUsed } = await runChatLoop(geminiContents, callGemini, executeTool)
```

на:

```ts
    const { reply: rawReply, totalTokens: tokensUsed, toolCalls } = await runChatLoop(geminiContents, callGemini, executeTool)
    const { answer, reason } = DEBUG ? parseDebugReply(rawReply) : { answer: rawReply, reason: '' }
    const debug = DEBUG ? { reason, tools: formatToolTrace(toolCalls) } : undefined
```

Затем в insert ассистентского сообщения писать `answer` (чистый), а не `reply`:

```ts
    await supabase.from('chat_messages').insert({
      user_id: user.id,
      session_id: session.id,
      role: 'assistant',
      content: answer,
      tokens_used: tokensUsed,
    })
```

- [ ] **Step 5: Вернуть debug в ответе**

Заменить финальный `Response`:

```ts
    return new Response(JSON.stringify({ reply: answer, sessionId: session.id, ...(debug ? { debug } : {}) }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
```

- [ ] **Step 6: Проверка типов и lint-потолка**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm run build`
Expected: `tsc -b` без новых ошибок; сборка проходит.
Run: `npm run lint`
Expected: число ошибок не выросло (потолок соблюдён; в проекте есть pre-existing ошибки — новых не добавлять).

- [ ] **Step 7: Коммит**

```bash
git add supabase/functions/chat-health/index.ts
git commit -m "feat(chat): debug-режим за флагом CHAT_DEBUG_REASON — JSON answer/reason + трасса инструментов"
```

---

## Task 4: Клиент — проброс `debug` из `sendChatMessage`

**Files:**
- Modify: `src/lib/chat.ts` (тип `ChatMessage`, новый тип `ChatDebug`, возврат `sendChatMessage`)

- [ ] **Step 1: Добавить тип debug и опциональное поле сообщения**

В `src/lib/chat.ts` рядом с `interface ChatMessage`:

```ts
export interface ChatDebug {
  reason: string
  tools: string[]
}
```

и в `ChatMessage` добавить опциональное поле:

```ts
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  debug?: ChatDebug // только у свежеполученного ответа; в БД/истории отсутствует
}
```

- [ ] **Step 2: Расширить сигнатуру и возврат `sendChatMessage`**

Сигнатуру возврата поменять на:

```ts
export async function sendChatMessage(
  message: string,
  sessionId: string | null,
  lang = 'ru',
): Promise<{ reply: string; sessionId: string; debug?: ChatDebug }> {
```

Тело до `return res.json()` не меняется — `res.json()` уже вернёт `debug`, если сервер его прислал (структурная совместимость). Явного маппинга не требуется.

- [ ] **Step 3: Проверка типов**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm run build`
Expected: без новых ошибок типов.

- [ ] **Step 4: Коммит**

```bash
git add src/lib/chat.ts
git commit -m "feat(chat): проброс debug (reason+tools) из sendChatMessage"
```

---

## Task 5: Рендер строки debug в `ChatWidget`

**Files:**
- Modify: `src/components/chat/ChatWidget.tsx` (`MsgBubble`, заполнение `debug` у нового сообщения)
- Modify: файл со стилями `.chat-bubble` (`src/index.css` — проверить `grep -rl "chat-bubble" src/*.css src/**/*.css`)

- [ ] **Step 1: Отрисовать debug под ответом ассистента**

В `ChatWidget.tsx` заменить `MsgBubble`:

```tsx
function MsgBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`chat-bubble ${isUser ? 'user' : 'assistant'}`}>
      {isUser ? <p>{msg.content}</p> : <AssistantContent content={msg.content} />}
      {!isUser && msg.debug && (
        <div className="chat-debug">
          (причина: {msg.debug.reason || '—'} · данные: {msg.debug.tools.length ? msg.debug.tools.join(', ') : 'инструменты не вызывались'})
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Прокинуть debug в новое сообщение**

В `handleSend` дополнить деструктуризацию и создание `assistantMsg`:

```tsx
      const { reply, sessionId: newSessionId, debug } = await sendChatMessage(text, sessionId, lang)
      if (!sessionId) setSessionId(newSessionId)

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
        debug,
      }
```

- [ ] **Step 3: Стиль `.chat-debug`**

В файл со стилями `.chat-bubble` добавить:

```css
.chat-debug {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.35;
  opacity: 0.6;
  font-style: italic;
}
```

- [ ] **Step 4: Проверка сборки**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm run build`
Expected: без новых ошибок.

- [ ] **Step 5: Коммит**

```bash
git add src/components/chat/ChatWidget.tsx src/index.css
git commit -m "feat(chat): показывать debug-строку (причина + данные) под ответом ассистента"
```

---

## Task 6: Полная проверка + деплой

- [ ] **Step 1: Прогнать весь тест-сьют**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test`
Expected: все тесты зелёные (новые + существующие).

- [ ] **Step 2: Задеплоить edge-функцию**

Из worktree ветки:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npx supabase functions deploy chat-health --project-ref mxnmubakfzqoosgsqmhh
```

Затем выставить env-флаг функции `CHAT_DEBUG_REASON=1` (Supabase dashboard → Edge Functions → chat-health → Secrets/Env, либо `npx supabase secrets set CHAT_DEBUG_REASON=1 --project-ref mxnmubakfzqoosgsqmhh`).
`verify_jwt` оставить по умолчанию (true) — чат вызывается с пользовательским JWT.

- [ ] **Step 3: Ручной E2E**

В приложении задать вопрос, требующий данных вне 30 дней (напр. «глубина сна за июнь»). Ожидаемо: ответ + строка в скобках вида `(причина: … · данные: get_sleep_range(2026-06-01..2026-06-30))`, и числа совпадают с БД (сверка через PostgREST/`sleep_sessions`).

- [ ] **Step 4: Пуш ветки и PR фронта**

```bash
git push -u origin feat/chat-debug-reason
```

Открыть PR в `main`; при мёрдже зелёный CI дёрнет Vercel-хук (фронт с debug-строкой поедет в прод).

---

## Откат через неделю (не задача плана — памятка)

Снять env `CHAT_DEBUG_REASON` (или `=0`) на функции `chat-health` и передеплоить. Сервер перестанет просить JSON и слать `debug`; клиент при отсутствии `debug` ничего не рисует. Позже — опциональный revert коммитов фичи.
