# Что сделать завтра (действия от тебя)

---

## 🔴 Supabase SQL — запустить в SQL Editor

### Phase 7 (Telegram)
```sql
-- Скопируй и запусти содержимое файла:
-- supabase/phase7_tables.sql
```
Создаёт: `telegram_links`, `scheduled_reports`, `report_settings`, `telegram_link_tokens`, view `daily_summary`

### Phase 8 (Цели)
```sql
-- Скопируй и запусти содержимое файла:
-- supabase/phase8_tables.sql
```
Создаёт: `recommendations`, `goals`, `goal_progress`

### Phase 9 (Проблемы и волосы)
```sql
-- Скопируй и запусти содержимое файла:
-- supabase/phase9_tables.sql
```
Создаёт: `health_concerns`, `concern_logs`, `hair_entries`

### Supplements stock
```sql
alter table supplements add column if not exists stock_count integer default null;
```

---

## 🔴 Supabase Storage — создать bucket

В Supabase → Storage → New bucket:
- Name: `health-photos`
- Public: **нет** (приватный)

Нужен для фото в разделах «Проблемы» и «Волосы».

---

## 🔴 Telegram Bot — создать бота

1. Открой Telegram → напиши **@BotFather**
2. Команда `/newbot`
3. Придумай имя (напр. `Tonus Health`) и username (напр. `tonus_health_bot`)
4. BotFather даст токен вида `7123456789:AAF_...`

### После получения токена:
В Supabase → Settings → Edge Function Secrets добавить:
- `TELEGRAM_BOT_TOKEN` = токен от BotFather
- `TELEGRAM_BOT_NAME` = username бота (без @, напр. `tonus_health_bot`)

Также в Vercel → Environment Variables добавить:
- `VITE_TELEGRAM_BOT_NAME` = username бота (без @)

### Затем я задеплою telegram-bot функцию и зарегистрирую webhook — это займёт 5 минут.

---

## После того как сделаешь всё выше:

- Скажи мне и я зарегистрирую webhook для Telegram-бота
- В приложении появится кнопка **«Подключить Telegram»** в Настройках
- В Цели нажми **«✨ Предложить ИИ»** — появятся рекомендации
- Попробуй добавить проблему в разделе «Проблемы»
- Добавь первую запись в разделе «Волосы»

---

## ✅ Уже готово (не нужно делать)

- Phase 7a: `biweekly-report` edge function
- Phase 7b: `telegram-bot` edge function (написана, ждёт токена)
- Phase 8a: Экран Цели с прогресс-кольцами
- Phase 8b: `generate-recommendations` edge function (задеплоена)
- Phase 9a: Экран Проблемы с журналом и графиком
- Phase 9b: Экран Волосы с фото, метриками, сравнением до/после
