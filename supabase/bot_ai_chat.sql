-- B3: AI chat in Telegram bot — store conversation session per telegram link
alter table telegram_links add column if not exists tg_session_id uuid;
