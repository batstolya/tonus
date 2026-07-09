---
name: working-on-ai-chat
description: Use when modifying the Tonus AI chat (chat-health edge function), adding or changing chat tools, editing the chat system prompt, or debugging wrong/hallucinated/truncated chat answers
---

# Работа с AI-чатом (chat-health)

## Карта файлов (всё серверное; клиент только рендерит)

| Файл | Ответственность |
|---|---|
| `supabase/functions/chat-health/index.ts` | вход, SYSTEM_PROMPT (fallback!), callGemini, DEBUG-флаг |
| `supabase/functions/_shared/chatToolLoop.ts` | чистый function-calling цикл, `MAX_TOOL_ROUNDS = 2` |
| `supabase/functions/_shared/chatTools.ts` | `CHAT_TOOL_DECLARATIONS` + `executeChatTool` (Supabase-запросы) |
| `supabase/functions/_shared/healthContext.ts` | единый билдер AI-контекста (бот/коуч/отчёты — тоже он) |
| `supabase/functions/_shared/chatDebug.ts` | parseDebugReply/formatToolTrace для debug-режима |
| `src/lib/chat.ts` | клиент: только fetch к функции; контекст собирается НА СЕРВЕРЕ |

## ЛОВУШКА №1: ai_prompts перекрывает код

`index.ts:145`: `getPrompt(supabase, 'chat-health-system', SYSTEM_PROMPT)` —
активная строка в таблице **`ai_prompts`** (name=`chat-health-system`) молча
побеждает код. Правишь SYSTEM_PROMPT в коде → деплоишь → поведение не меняется?
**Сначала проверь/деактивируй оверрайд в БД** (это уже съело часы при v23).

## Gemini-грабли (v1beta, gemini-2.5-flash)

- **thinking-токены входят в `maxOutputTokens`**: лимит должен вмещать
  `thinkingBudget` (1024) + видимый ответ. Уменьшишь лимит — получишь пустой
  или обрезанный ответ без ошибки.
- **role только `user`/`model`**: `functionResponse` отправляется ходом
  `role:'user'` сразу после model-хода с functionCall. `role:'function'` = 400.
- Числовые аргументы инструментов модель может прислать строкой — коэрсь
  `Number(...)` и валидируй.

## Добавление нового инструмента — чеклист

1. Декларация в `CHAT_TOOL_DECLARATIONS` + ветка в `executeChatTool`.
   Оба запроса **обязаны** иметь `.eq('user_id', userId)` — клиент service-role,
   RLS не страхует. Ошибку БД пробрасывай, не глотай в пустой список.
2. Bullet в SYSTEM_PROMPT («для вопросов X используй инструмент Y») — иначе
   модель ответит из грубого контекста и инструмент не вызовет. Помни про
   ловушку №1: если в ai_prompts есть активный оверрайд — обнови и его.
3. `chatTools.test.ts` жёстко ассертит список имён инструментов — обнови,
   иначе красный CI заблокирует и фронтовый деплой. Паттерн стабов —
   `stubSupabase(dataByTable)` там же.
4. Нужна чистая логика из `src/lib/`? Deno не импортирует из `src/` —
   копируй в `_shared/` (зеркала, как scores.ts) + зеркальный тест.
5. Деплой: `npx supabase functions deploy chat-health --project-ref <ref>`
   (БЕЗ `--no-verify-jwt` — это только для ingest-health). При правке
   `_shared/*` передеплой все функции-импортёры: `grep -rl "_shared/имя" supabase/functions`.

## Отладка «чат врёт/молчит»

- `CHAT_DEBUG_REASON=1` (env-секрет функции) → ответ приходит JSON
  `{answer, reason}` + трасса инструментов. Снять: `supabase secrets unset`.
- `checkBudget` (costGuard) может блокировать вызовы — проверь бюджет юзера.
- Таймзона: `executeChatTool` не получает tz юзера; UTC-«сегодня» у полуночи
  сдвигает окна на день. Для date-чувствительных инструментов пробрасывай
  `todayStr` через замыкание executeTool в index.ts.
