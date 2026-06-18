# Claude Usage Monitor + Telegram Notifications

## Цель

Разработать автономный сервис мониторинга лимитов Claude Pro, который отслеживает:

* текущий уровень использования лимитов;
* количество оставшихся сообщений (если доступно);
* время до следующего сброса лимитов;
* факт восстановления лимитов после ресета.

При наступлении заданных условий сервис должен отправлять уведомления в Telegram.

---

# Основные требования

## Источник данных

Не использовать ручной ввод данных.

Сервис должен автоматически получать информацию одним из способов:

1. Внутренние API Claude (предпочтительно).
2. GraphQL-запросы Claude.
3. Перехват запросов браузера.
4. Парсинг страницы Usage как запасной вариант.

Необходимо провести исследование (investigation) и определить:

* какие endpoint'ы используются Claude для отображения Usage;
* какие данные доступны;
* как происходит авторизация;
* можно ли получить:

  * remaining usage;
  * usage percentage;
  * reset timestamp;
  * weekly usage;
  * model-specific limits.

---

# Telegram интеграция

Использовать Telegram Bot API.

Поддержать отправку уведомлений в указанный Chat ID.

Настройки:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

# Уведомления

## Критически низкий остаток

Условие:

```text
usage >= 95%
```

или

```text
remaining <= 5%
```

Сообщение:

```text
⚠️ Claude Usage Alert

Осталось менее 5% лимита.

Текущее использование: XX%
До сброса: HH:MM:SS
```

---

## Скорый ресет

Условие:

```text
до ресета <= 5 минут
```

Сообщение:

```text
⏳ Claude Reset Soon

До сброса лимитов осталось менее 5 минут.
```

---

## Ресет выполнен

Условие:

```text
usage резко снизился
или
обнаружен новый reset window
```

Сообщение:

```text
🟢 Claude Available Again

Лимиты восстановлены.

Текущее использование: XX%
```

---

## Полное исчерпание

Условие:

```text
лимит достигнут
```

Сообщение:

```text
🔴 Claude Limit Reached

Доступный лимит исчерпан.

Следующий сброс:
YYYY-MM-DD HH:mm:ss
```

---

# Режим работы

Фоновый режим.

Интервал проверки:

```text
60 секунд
```

Конфигурируемый параметр:

```env
POLL_INTERVAL=60
```

---

# Антиспам

Не отправлять одинаковые уведомления повторно.

Пример:

Если уведомление "Осталось менее 5%" уже отправлено, повторно его не отправлять до следующего цикла ресета.

Хранить состояние:

```json
{
  "low_limit_sent": true,
  "reset_soon_sent": true,
  "limit_reached_sent": true
}
```

После нового ресета флаги сбрасываются.

---

# Web Dashboard (опционально)

Добавить локальную страницу мониторинга.

Отображать:

* Current Usage
* Remaining Usage
* Reset Countdown
* Last Check
* API Status

Пример:

```text
Usage: 82%

Remaining: 18%

Reset in:
01:24:12
```

---

# Логирование

Сохранять:

```text
timestamp
usage %
remaining %
reset timestamp
status
```

Формат:

```json
{
  "timestamp": "...",
  "usage": 82,
  "remaining": 18,
  "reset_at": "...",
  "status": "ok"
}
```

---

# Docker

Предоставить:

* Dockerfile
* docker-compose.yml

Команда запуска:

```bash
docker compose up -d
```

---

# Конфигурация

```env
CLAUDE_SESSION_COOKIE=
CLAUDE_ORG_ID=

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

POLL_INTERVAL=60
LOW_LIMIT_THRESHOLD=5
RESET_WARNING_MINUTES=5
```

---

# Исследовательская задача (обязательная)

Перед реализацией выполнить investigation:

1. Найти реальные endpoint'ы Claude Usage.
2. Определить формат ответа.
3. Проверить наличие:

   * remaining messages;
   * usage percentage;
   * reset timestamp;
   * weekly limits.
4. Документировать результаты.
5. Реализовать мониторинг на основе найденных endpoint'ов.

Если прямые endpoint'ы недоступны, реализовать fallback через браузерную автоматизацию (Playwright).

---

# Итоговый результат

Готовый автономный сервис, который работает 24/7 и автоматически отправляет Telegram-уведомления о состоянии лимитов Claude без участия пользователя.
