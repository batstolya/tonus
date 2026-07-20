# B3: Telegram bot split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `supabase/functions/telegram-bot/index.ts` (1503 lines) into a thin webhook handler + per-concern modules, with vitest-runnable router tests — behavior-preserving (spec B3, success: index ≤ ~200 lines, handlers ≤ ~150 each).

**Architecture:** New files live inside `telegram-bot/` (single-function deploy stays one `functions deploy telegram-bot`). Two kinds of modules: **pure** (no Deno globals, no https imports — vitest node picks up their `*.test.ts` like `_shared/*.test.ts` today) and **runtime** (Deno env, esm.sh supabase client — not directly unit-tested, same as today). Routing decisions become pure functions returning a route tag; `index.ts` maps tags to handlers.

**Key constraints:**
- `deno check` ceiling is 16 (`.deno-check-ceiling`) — moving code must not add type errors; run `npm run check:functions` (needs `$HOME/.deno/bin` in PATH) after every task.
- Pure modules must not import `Deno.*`, `https://` URLs, or modules that do — vitest node runs them (verify each new test with `npx vitest run <file>`).
- Behavior-preserving: no text, menu, or DB-call changes. Diff review per task is the main safety net.
- English-only comments in new/moved code (existing Russian comments travel verbatim — no back-translation).

**File map (all under `supabase/functions/telegram-bot/`):**

| File | Kind | Contents (moved from index.ts) |
|---|---|---|
| `tg.ts` | runtime | `tgCall`, `tgSend`, `tgEdit`, `tgAnswerCallback`, `tgTyping`, `mdToTgHtml`, `MAX_CHAT_MESSAGE_LENGTH`, `setupCommands` (lines ~23–130) |
| `menus.ts` | pure | `MAIN_MENU`, `REPORT_ACTIONS`, `STATUS_ACTIONS`, `BACK_MENU`, `FOOTBALL_MENU` (lines ~72–108) |
| `router.ts` | pure | NEW: `routeCallback(data: string): CallbackRoute`, `routeText(text: string): TextRoute` — pure classifiers extracted from the if/else chains |
| `router.test.ts` | pure test | NEW: dispatch table tests |
| `ai.ts` | runtime | `CHAT_SYSTEM_PROMPT`, `classifyMealPhoto`, `transcribeVoice`, `handleMealPhoto`, `classifyLog`, `execLog`, `buildBotContext`, `handleAiChat` (lines ~196–517) |
| `commands.ts` | runtime | `handleReport`, `handleStatus`, `handleSupplements`, `handleGoals`, `handleSettings`, `handleFootballMenu`, `handleFootballMatches`, `setFootballReminders`, `checkStaleness`, `handleExperimentSuggest` (lines ~131–195, 519–737) |
| `callbacks.ts` | runtime | callback_query bodies: `expsug:`, `wb:`, `take_`, `rem_*`, `nudge_*`, `fw:`, pause/resume/disconnect (extracted from lines ~752–965) |
| `messages.ts` | runtime | text-command bodies: `/start <token>` linking, `/last`, `/sync`, `/tokens`, `/usage`, `/ideas`, `/idea`, `/widget`, photo/voice pre-routing, free-text AI fallthrough (lines ~970–1500) |
| `index.ts` | runtime | env consts, webhook guard, `routeCallback`/`routeText` dispatch maps, `serve(withObservability(handler))` |

Handlers receive `(chatId, userId, supabase, ...)` as today; shared env consts (`TG_TOKEN` etc.) read `Deno.env` inside their own module (tg.ts reads TG_TOKEN; ai.ts reads GEMINI_KEY; index.ts keeps WEBHOOK_SECRET/SUPABASE_*).

---

### Task 1: Extract `menus.ts` + `tg.ts`
- [ ] **1.1** Create `menus.ts` (pure object literals, no imports) and `tg.ts` (reads `TG_TOKEN`); move the listed symbols verbatim, export all. All helpers stay thin wrappers over `tgCall` (which returns parsed json) — rerouting `tgSend` through `_shared/telegram.ts#sendTelegram` would change the return type and the empty-token no-op, so it stays as is; consolidating the duplicate `tgSend` in send-reminders is a separate follow-up.
- [ ] **1.2** In `index.ts` delete moved code, import from `./tg.ts` / `./menus.ts`.
- [ ] **1.3** `npm run check:functions` — count ≤ 16. Diff-review: moved code byte-identical.
- [ ] **1.4** Commit `refactor(telegram-bot): extract tg api helpers and menus`.

### Task 2: Pure router with tests (TDD)
- [ ] **2.1** Write failing `router.test.ts` (vitest node): `routeText` maps `/menu`→`menu`, `/report`→`report`, `/status`, `/last`, `/sync`, `/pause`, `/resume`, `/football`, `/matches`, `/football_on`, `/football_off`, `/tokens`, `/usage`, `/ideas`, `/idea …`→`idea`, `/widget`, `/start token123`→`start`, unknown `/foo`→`unknown_command`, plain text→`chat`. `routeCallback` maps `menu`/`report`/`status`/`supplements`/`goals`/`settings`/`exp_suggest`/`pause`/`resume`/`disconnect`/`fb_matches`/`fb_on`/`fb_off`/`nudge_no` to themselves as tags, prefixes `expsug:`/`wb:`/`take_`/`rem_take_`/`rem_snz_`/`rem_skip_`/`nudge_acc:`/`fw:` to `{kind, payload}` tags, anything else → `ignore`.
- [ ] **2.2** Run: `npx vitest run supabase/functions/telegram-bot/router.test.ts` — FAIL (module missing).
- [ ] **2.3** Implement `router.ts` as pure string classifiers (discriminated unions `TextRoute`, `CallbackRoute`); the payload split logic for `rem_snz_<id>_<mins>` moves here.
- [ ] **2.4** Tests PASS; `npm run check:functions` ≤ 16; commit `feat(telegram-bot): pure command router with dispatch tests`.

### Task 3: Extract `commands.ts` + `ai.ts`
- [ ] **3.1** Move the listed handler functions verbatim into the two modules; imports: `tg.ts`, `menus.ts`, existing `_shared/*`. `ai.ts` reads `GEMINI_KEY`, `AI_CONSENT_TELEGRAM_MESSAGE` moves with it.
- [ ] **3.2** `index.ts` imports handlers; delete moved code. `npm run check:functions` ≤ 16; diff-review.
- [ ] **3.3** Commit `refactor(telegram-bot): extract command handlers and ai pipeline`.

### Task 4: Extract `callbacks.ts` + `messages.ts`, thin `index.ts`
- [ ] **4.1** `callbacks.ts`: `handleCallback(cq, route, userId, supabase)` — switch on `routeCallback` tags, bodies moved verbatim. `messages.ts`: `handleMessage(msg, route, …)` likewise for text routes plus photo/voice branches (which route before text).
- [ ] **4.2** Rewrite `index.ts` handler: guards → parse update → link lookup → `routeCallback`/`routeText` → dispatch. Target ≤ ~200 lines.
- [ ] **4.3** `wc -l supabase/functions/telegram-bot/*.ts` — index ≤ ~200, handlers ≤ ~150 per exported function (file may hold several).
- [ ] **4.4** Full gate: `VITE_DEMO= npm test` (router tests ride along), `npm run check:functions` ≤ 16, `npm run build`, `npm run lint:ceiling`.
- [ ] **4.5** Commit `refactor(telegram-bot): thin webhook router in index.ts`.

### Task 5: PR + deploy
- [ ] **5.1** Spec status row B3 → DONE with PR number. Push, PR `refactor(telegram-bot): split into router + handler modules (B3)`, merge on green.
- [ ] **5.2** Deploy: `npx supabase functions deploy telegram-bot --project-ref <ref>` (webhook secret unchanged; no `--no-verify-jwt` for this fn).
- [ ] **5.3** Smoke: send `/status` and one button tap in Telegram; check `get_logs` for errors. B3 done; next: B4 lint burn-down.
