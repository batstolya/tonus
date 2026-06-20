# Spec: автоматический синк cal.com → Tonus (плановый авто-логин)

**Дата:** 2026-06-20
**Статус:** согласован, ждёт ревью спеки

## Цель

Бронирования из self-hosted cal.com (`cal.beskarstaff.com`) автоматически попадают в
Tonus по расписанию. После разовой настройки (ввод email+пароль) — ноль ручных действий.
Заменяет текущую ручную схему «достать session-токен из DevTools → вставить в Настройках».

## Контекст и ограничения (выяснено при брейншторминге)

- cal.com **self-hosted**, официального REST API НЕТ (`/api/v1/bookings` → 404, v2 → 500).
  Поэтому данные берём через внутренний tRPC (`/api/trpc/bookings/get`) с session-кукой —
  как в существующих `fetch-cal.mjs` и edge-функции `fetch-cal`.
- Провайдер входа **`credentials` (email+пароль) включён** (проверено через `/api/auth/providers`).
  `/api/auth/csrf` отдаёт `csrfToken` + куку. Значит авто-логин по паролю реализуем.
- **2FA на аккаунте выключена** (подтверждено пользователем) → авто-логин не требует TOTP.
- В проекте уже есть планировщик: `pg_cron` + `pg_net` (`autosync-cron.sql`, `coach-cron.sql`).
- События календаря сохраняются в таблицу **`calendar_events`** (через `saveCalendarEvents`,
  формат события: `uid, title, start, end, description, location, source`).
- **Частота: раз в день** (прошедшие встречи как контекст стресса не требуют реал-тайма).

## Не-цели (YAGNI)

- Не строим приёмник вебхуков (выбран авто-логин, не push).
- Не трогаем Google Calendar и ICS-пути.
- Не удаляем ручной ввод session-токена — оставляем как фолбэк (принцип «не ломать существующее»).
- Не делаем мульти-пользовательскую панель — приложение персональное (один пользователь).

## Архитектура

### 1. Таблица `cal_sync` (новая)
```
user_id        uuid pk references auth.users
cal_email      text
cal_password_enc text         -- base64(iv + AES-GCM ciphertext)
enabled        boolean default true
last_sync_at   timestamptz
last_status    text           -- 'ok' | человекочитаемая ошибка
event_count    int
updated_at     timestamptz default now()
```
- RLS: пользователь читает свою строку, но **колонка `cal_password_enc` в клиент не отдаётся**
  (выборка в UI идёт по белому списку колонок: `enabled,last_sync_at,last_status,event_count`).
- Пароль читает только `sync-cal` под service-role.

### 2. Шифрование
- Шифр/дешифр **в edge-функции** через Web Crypto **AES-GCM**, ключ из секрета
  `CAL_ENC_KEY` (32 байта, в Supabase Function Secrets). Ключ **не хранится в БД**.
- В БД лежит `base64(iv ‖ ciphertext)`. Пароль никогда не возвращается клиенту.

### 3. Edge-функция `sync-cal` (новая)
Один эндпоинт, два входа:
- **Крон:** `POST` с заголовком-секретом (как `coach-cron` дёргает свою функцию). Без JWT.
- **UI «Синхр. сейчас»:** `POST` с JWT пользователя.
- **Сохранение creds:** тот же `POST` с телом `{ email, password, enabled }` (от UI, JWT) —
  шифрует и пишет в `cal_sync`, затем сразу делает синк (первый прогон = бэкафилл истории).

Шаги синка:
1. Достать строку `cal_sync` (по user_id из JWT, либо по всем `enabled` при кроне).
2. Расшифровать пароль (`CAL_ENC_KEY`).
3. **Авто-логин:**
   - `GET /api/auth/csrf` → `csrfToken` + кука `__Secure-next-auth.csrf-token`.
   - `POST /api/auth/callback/credentials` (form: `csrfToken,email,password,json=true,callbackUrl`),
     с csrf-кукой.
   - Из `Set-Cookie` достать `__Secure-next-auth.session-token`.
   - Если токена нет (неверный пароль/2FA) → статус-ошибка, выход.
4. **Фетч бронирований** через tRPC `bookings/get` (пагинация, переиспользуем логику `fetch-cal`).
5. Нормализовать → upsert в `calendar_events` (тот же формат, что `saveCalendarEvents`;
   `onConflict` по `user_id,uid`).
6. Обновить `cal_sync`: `last_sync_at`, `last_status='ok'`, `event_count`.

### 4. `cal-cron.sql` (новая)
`pg_cron` job (раз в день, напр. 06:00) → `net.http_post` на `sync-cal` с секрет-заголовком.
Копия паттерна `coach-cron.sql`. Идемпотентно (unschedule перед schedule).

### 5. UI (SettingsScreen)
Блок «Календарь cal.com» переделать:
- Поля **email** + **пароль** (тип password), тумблер **«Авто-синк (раз в день)»**.
- Кнопка **«Сохранить и синхронизировать»** → вызывает `sync-cal` с creds.
- Кнопка **«Синхронизировать сейчас»** → `sync-cal` без creds (использует сохранённые).
- Строка статуса: `last_sync_at`, `event_count`, ошибки из `last_status`.
- Старое поле session-токена прячем под «Расширенно / фолбэк».

## Поток данных
```
pg_cron (daily) ─POST(secret)──┐
UI "Sync now"   ─POST(JWT)──────┤→ sync-cal → AES-decrypt пароль
UI "Save+sync"  ─POST(JWT,creds)┘            → cal.com login (csrf+credentials)
                                             → tRPC bookings/get (paginated)
                                             → upsert calendar_events
                                             → update cal_sync (status, count)
```

## Обработка ошибок
- Неверный логин/пароль → `last_status='Неверный логин или пароль'`, видно в UI.
- 2FA на входе (на будущее) → `last_status='Включена 2FA — авто-логин невозможен'`.
- cal.com недоступен / tRPC 5xx → `last_status` с кодом; крон повторит на следующем прогоне.
- Ошибка не валит другие части приложения; ручной фолбэк через `fetch-cal` остаётся.

## Безопасность
- Пароль шифруется AES-GCM, ключ только в env функции, не в БД.
- В клиент пароль не возвращается; RLS прячет колонку.
- Креды — от собственного self-hosted инстанса пользователя.
- Секрет-заголовок кронового вызова `sync-cal` (как у `coach-cron`), чтобы функцию не дёргали извне.

## Тестирование
- Юнит-тест нормализации `booking → calendar_events` (чистая функция, локально на Node) —
  массив бронирований разной формы → ожидаемые строки; дедуп по `uid`.
- Логин-флоу проверяется вживую: сохранить creds → «Синхронизировать сейчас» →
  проверить `calendar_events` и карту стресса. (Без creds авто-тест логина невозможен.)

## Переиспользуем
- tRPC-фетч + нормализацию из `supabase/functions/fetch-cal/index.ts`.
- Крон-паттерн из `supabase/coach-cron.sql`.
- UI-блок календаря и `saveCalendarEvents` / таблицу `calendar_events`.

## Открытые риски
- Авто-логин завязан на текущий NextAuth-флоу cal.com; при апгрейде cal.com может потребовать
  правок. Фолбэк (ручной токен) страхует.
- Точные имена полей tRPC-ответа берём из рабочего `fetch-cal` (уже проверены).
