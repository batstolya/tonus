# Спека: Football Match Reminders для Telegram-бота

## 1. Цель

Добавить в существующий Telegram-бот функциональность футбольных напоминаний:

- бот получает данные о ближайших матчах из football API;
- хранит матчи в Supabase/Postgres;
- за 30 минут до начала матча отправляет пользователю Telegram-сообщение;
- в сообщении есть inline-кнопки:
  - `✅ Буду смотреть`
  - `❌ Не буду`
- ответ пользователя сохраняется в базе;
- если матч перенесли, отменили или изменилось время, система должна обновить расписание и не отправлять неправильное напоминание.

Твой стек лучше всего ложится на такую архитектуру: **Supabase Postgres + Supabase Edge Functions / Node API route + pg_cron или внешний cron + Telegram Bot API**.

---

## 2. Какой API использовать

### Рекомендация: API-Football от API-SPORTS

Для MVP и личного/малого бота я бы выбрал **API-Football / API-SPORTS**.

Почему:

- у них есть отдельный гайд под **FIFA World Cup 2026**;
- для ЧМ-2026 они прямо указывают `league=1` и `season=2026`;
- endpoint `/fixtures?league=1&season=2026` возвращает расписание матчей, время, venue, статус и fixture id;
- live/fixture data обновляется часто;
- есть free plan для тестов, а paid plan Pro подходит для малого продукта.

**Вывод:** для твоей задачи — “прислать reminder за 30 минут до матча” — API-Football достаточно. Тебе не нужен дорогой enterprise API, потому что ты не строишь betting/livescore-продукт с миллионами пользователей.

### Альтернатива: Sportmonks

Sportmonks тоже хороший вариант, особенно если проект потом станет продакшеновым для пользователей.

Плюсы:

- fixture endpoints by date range;
- livescores;
- includes для participants/scores/events/lineups;
- отдельный World Cup API.

Минус: дороже для MVP.

### Не брать для этого MVP

- **Sportradar** — круто, но больше enterprise/production/betting/media. Для личного Telegram-бота будет избыточно.
- **football-data.org** — ок для простых европейских лиг, но хуже подходит под ЧМ/live/reminder-сценарий.
- **scraping FIFA/Google** — не надо. Будет ломаться, можно словить бан, нет нормальных стабильных id.

---

## 3. Основной API contract

### Base URL

```ts
const BASE_URL = "https://v3.football.api-sports.io";
```

### Headers

```ts
{
  "x-apisports-key": process.env.API_FOOTBALL_KEY
}
```

### Получить расписание ЧМ-2026

```http
GET https://v3.football.api-sports.io/fixtures?league=1&season=2026
```

Для ЧМ-2026 используется:

```txt
league=1
season=2026
```

Endpoint `/fixtures?league=1&season=2026` должен вернуть все доступные матчи турнира с:

- fixture id;
- датой и временем;
- командами;
- venue;
- статусом;
- round/stage.

### Получить матчи по date range

Для reminder-системы лучше не тащить весь турнир на каждый cron, а обновлять окно:

```http
GET https://v3.football.api-sports.io/fixtures?league=1&season=2026&from=2026-07-04&to=2026-07-19
```

### Получить live matches

```http
GET https://v3.football.api-sports.io/fixtures?league=1&season=2026&status=1H-HT-2H-ET-P-BT-LIVE
```

Для напоминаний live endpoint не обязателен, но можно использовать его позже, если захочешь слать:

- “матч начался”;
- “гол”;
- “перерыв”;
- “матч закончился”.

---

## 4. Стартовые данные по ближайшим матчам

Это стартовый seed для текущей стадии ЧМ-2026. Его можно вставить в БД как fallback, но **source of truth должен быть API-Football**, потому что fixture ids и переносы нужно брать от провайдера.

Ниже время указано в `Europe/Berlin`, то есть UTC+2.

```json
[
  {
    "temporary_id": "wc2026-r16-canada-morocco",
    "competition": "FIFA World Cup 2026",
    "league_id": 1,
    "season": 2026,
    "round": "Round of 16",
    "home_team": "Canada",
    "away_team": "Morocco",
    "kickoff_at": "2026-07-04T19:00:00+02:00",
    "timezone": "Europe/Berlin",
    "venue": "Houston Stadium",
    "status": "scheduled"
  },
  {
    "temporary_id": "wc2026-r16-paraguay-france",
    "competition": "FIFA World Cup 2026",
    "league_id": 1,
    "season": 2026,
    "round": "Round of 16",
    "home_team": "Paraguay",
    "away_team": "France",
    "kickoff_at": "2026-07-04T23:00:00+02:00",
    "timezone": "Europe/Berlin",
    "venue": "Philadelphia Stadium",
    "status": "scheduled"
  },
  {
    "temporary_id": "wc2026-r16-brazil-norway",
    "competition": "FIFA World Cup 2026",
    "league_id": 1,
    "season": 2026,
    "round": "Round of 16",
    "home_team": "Brazil",
    "away_team": "Norway",
    "kickoff_at": "2026-07-05T22:00:00+02:00",
    "timezone": "Europe/Berlin",
    "venue": "New York/New Jersey Stadium",
    "status": "scheduled"
  },
  {
    "temporary_id": "wc2026-r16-mexico-england",
    "competition": "FIFA World Cup 2026",
    "league_id": 1,
    "season": 2026,
    "round": "Round of 16",
    "home_team": "Mexico",
    "away_team": "England",
    "kickoff_at": "2026-07-06T02:00:00+02:00",
    "timezone": "Europe/Berlin",
    "venue": "Mexico City Stadium",
    "status": "scheduled"
  },
  {
    "temporary_id": "wc2026-r16-portugal-spain",
    "competition": "FIFA World Cup 2026",
    "league_id": 1,
    "season": 2026,
    "round": "Round of 16",
    "home_team": "Portugal",
    "away_team": "Spain",
    "kickoff_at": "2026-07-06T21:00:00+02:00",
    "timezone": "Europe/Berlin",
    "venue": "Dallas Stadium",
    "status": "scheduled"
  },
  {
    "temporary_id": "wc2026-r16-usa-belgium",
    "competition": "FIFA World Cup 2026",
    "league_id": 1,
    "season": 2026,
    "round": "Round of 16",
    "home_team": "USA",
    "away_team": "Belgium",
    "kickoff_at": "2026-07-07T02:00:00+02:00",
    "timezone": "Europe/Berlin",
    "venue": "Seattle Stadium",
    "status": "scheduled"
  },
  {
    "temporary_id": "wc2026-r16-argentina-egypt",
    "competition": "FIFA World Cup 2026",
    "league_id": 1,
    "season": 2026,
    "round": "Round of 16",
    "home_team": "Argentina",
    "away_team": "Egypt",
    "kickoff_at": "2026-07-07T18:00:00+02:00",
    "timezone": "Europe/Berlin",
    "venue": "Atlanta Stadium",
    "status": "scheduled"
  },
  {
    "temporary_id": "wc2026-r16-switzerland-colombia",
    "competition": "FIFA World Cup 2026",
    "league_id": 1,
    "season": 2026,
    "round": "Round of 16",
    "home_team": "Switzerland",
    "away_team": "Colombia",
    "kickoff_at": "2026-07-07T22:00:00+02:00",
    "timezone": "Europe/Berlin",
    "venue": "BC Place Vancouver",
    "status": "scheduled"
  }
]
```

---

## 5. Database schema

### 5.1. Таблица матчей

```sql
create table if not exists football_matches (
  id uuid primary key default gen_random_uuid(),

  provider text not null default 'api-football',
  provider_fixture_id bigint unique,

  league_id int not null,
  season int not null,
  competition_name text not null,
  round_name text,

  home_team_id bigint,
  home_team_name text not null,
  home_team_code text,
  home_team_logo text,

  away_team_id bigint,
  away_team_name text not null,
  away_team_code text,
  away_team_logo text,

  kickoff_at timestamptz not null,
  venue_name text,
  venue_city text,

  status_short text not null default 'NS',
  status_long text not null default 'Not Started',

  raw_payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_football_matches_kickoff_at
  on football_matches(kickoff_at);

create index if not exists idx_football_matches_status
  on football_matches(status_short);

create index if not exists idx_football_matches_league_season
  on football_matches(league_id, season);
```

### 5.2. Настройки пользователя

Если бот только для тебя, можно начать с одной записи. Но лучше сразу делать нормально под many users.

```sql
create table if not exists football_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,

  telegram_chat_id bigint not null,
  timezone text not null default 'Europe/Berlin',

  reminders_enabled boolean not null default true,
  reminder_minutes_before int not null default 30,

  watch_all_worldcup boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5.3. Таблица напоминаний

```sql
create type football_reminder_status as enum (
  'pending',
  'sent',
  'skipped',
  'failed',
  'cancelled'
);

create table if not exists football_match_reminders (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references football_matches(id) on delete cascade,

  reminder_type text not null default 'pre_match_30',
  scheduled_at timestamptz not null,

  status football_reminder_status not null default 'pending',
  sent_at timestamptz,
  telegram_message_id bigint,
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id, match_id, reminder_type)
);

create index if not exists idx_football_match_reminders_due
  on football_match_reminders(status, scheduled_at);
```

### 5.4. Ответы пользователя

```sql
create type football_watch_response as enum (
  'watching',
  'not_watching'
);

create table if not exists football_match_responses (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references football_matches(id) on delete cascade,

  response football_watch_response not null,
  responded_at timestamptz not null default now(),

  telegram_callback_query_id text,
  telegram_message_id bigint,

  unique(user_id, match_id)
);
```

---

## 6. Data sync flow

### Function: `sync-football-fixtures`

Назначение: синхронизировать матчи из API-Football в Supabase.

Cron:

- во время ЧМ: каждые 30 минут;
- вне активного турнира: 1–2 раза в день;
- дополнительно вручную через admin command `/sync_football`.

Рекомендованный запрос:

```ts
const params = {
  league: 1,
  season: 2026,
  from: "2026-07-04",
  to: "2026-07-19",
};
```

Логика:

1. вызвать API-Football `/fixtures`;
2. пройтись по `response`;
3. для каждого fixture сделать upsert в `football_matches`;
4. если `kickoff_at` изменился — пересчитать pending reminders;
5. если статус `PST`, `CANC`, `ABD` — отменить pending reminders;
6. если появились новые пары четвертьфинала/полуфинала — создать новые reminders.

Пример mapping:

```ts
function mapFixtureToMatch(fixture: any) {
  return {
    provider: "api-football",
    provider_fixture_id: fixture.fixture.id,

    league_id: fixture.league.id,
    season: fixture.league.season,
    competition_name: fixture.league.name,
    round_name: fixture.league.round,

    home_team_id: fixture.teams.home.id,
    home_team_name: fixture.teams.home.name,
    home_team_code: fixture.teams.home.code ?? null,
    home_team_logo: fixture.teams.home.logo,

    away_team_id: fixture.teams.away.id,
    away_team_name: fixture.teams.away.name,
    away_team_code: fixture.teams.away.code ?? null,
    away_team_logo: fixture.teams.away.logo,

    kickoff_at: fixture.fixture.date,
    venue_name: fixture.fixture.venue?.name ?? null,
    venue_city: fixture.fixture.venue?.city ?? null,

    status_short: fixture.fixture.status.short,
    status_long: fixture.fixture.status.long,

    raw_payload: fixture,
    updated_at: new Date().toISOString(),
  };
}
```

---

## 7. Reminder generation flow

### Function: `generate-football-reminders`

Назначение: создать pending reminders на все будущие матчи для пользователей, у которых включены reminders.

Когда запускать:

- после каждого `sync-football-fixtures`;
- дополнительно cron раз в час.

Логика:

1. выбрать все будущие матчи:
   - `kickoff_at > now()`;
   - `status_short in ('NS', 'TBD')`;
2. выбрать пользователей с `reminders_enabled = true`;
3. для каждой пары user + match создать reminder:
   - `scheduled_at = match.kickoff_at - interval '30 minutes'`;
4. использовать `on conflict do nothing`, чтобы не плодить дубли.

SQL-идея:

```sql
insert into football_match_reminders (
  user_id,
  match_id,
  reminder_type,
  scheduled_at
)
select
  fus.user_id,
  fm.id,
  'pre_match_30',
  fm.kickoff_at - make_interval(mins => fus.reminder_minutes_before)
from football_user_settings fus
cross join football_matches fm
where fus.reminders_enabled = true
  and fus.watch_all_worldcup = true
  and fm.kickoff_at > now()
  and fm.status_short in ('NS', 'TBD')
on conflict(user_id, match_id, reminder_type)
do nothing;
```

---

## 8. Sending flow

### Function: `send-football-reminders`

У тебя уже похожий паттерн есть: `pg_cron` вызывает `send-reminders` каждые 5 минут. Тут можно сделать так же.

Cron:

```sql
select cron.schedule(
  'send-football-reminders-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-football-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_OR_INTERNAL_SECRET'
    )
  );
  $$
);
```

Логика function:

1. найти pending reminders:
   - `status = 'pending'`;
   - `scheduled_at <= now()`;
   - `scheduled_at > now() - interval '20 minutes'`, чтобы не слать сильно старые;
   - матч ещё не начался: `kickoff_at > now()`;
   - матч не cancelled/postponed;
2. отправить Telegram message;
3. сохранить `telegram_message_id`;
4. поставить `status = 'sent'`;
5. если ошибка Telegram — `status = 'failed'`, записать `error_message`.

SQL selection:

```sql
select
  r.id as reminder_id,
  r.user_id,
  r.match_id,
  r.scheduled_at,
  s.telegram_chat_id,
  s.timezone,
  m.home_team_name,
  m.away_team_name,
  m.kickoff_at,
  m.round_name,
  m.venue_name,
  m.venue_city
from football_match_reminders r
join football_user_settings s on s.user_id = r.user_id
join football_matches m on m.id = r.match_id
where r.status = 'pending'
  and r.scheduled_at <= now()
  and r.scheduled_at > now() - interval '20 minutes'
  and m.kickoff_at > now()
  and m.status_short in ('NS', 'TBD')
order by r.scheduled_at asc
limit 50;
```

---

## 9. Telegram message

Пример текста:

```txt
⚽ Через 30 минут матч

🇨🇦 Canada — Morocco 🇲🇦
🏆 FIFA World Cup 2026 · Round of 16
🕖 Сегодня, 19:00
📍 Houston Stadium

Будешь смотреть?
```

Inline keyboard:

```ts
reply_markup: {
  inline_keyboard: [
    [
      {
        text: "✅ Буду смотреть",
        callback_data: `football:watch:${matchId}`,
      },
      {
        text: "❌ Не буду",
        callback_data: `football:skip:${matchId}`,
      },
    ],
  ],
}
```

Важно: `callback_data` в Telegram ограничен 64 байтами. Поэтому лучше использовать короткий `match_id`, например internal UUID слишком длинный.

Нормальный вариант:

```ts
callback_data: `fw:${shortMatchId}:yes`
callback_data: `fw:${shortMatchId}:no`
```

Где `shortMatchId` — короткий public id, например `fm.short_id`.

Можно добавить колонку:

```sql
alter table football_matches
add column if not exists short_id text unique;

create unique index if not exists idx_football_matches_short_id
on football_matches(short_id);
```

Генерировать `short_id` можно как `base62` или просто `wc1`, `wc2`, `wc3`.

---

## 10. Callback handler

В существующем Telegram webhook добавить обработку callback query.

Паттерн callback:

```txt
fw:<short_match_id>:yes
fw:<short_match_id>:no
```

Логика:

1. распарсить callback;
2. найти match по `short_id`;
3. определить user по `telegram_chat_id`;
4. upsert в `football_match_responses`;
5. ответить на callback через `answerCallbackQuery`;
6. обновить сообщение через `editMessageReplyMarkup` или `editMessageText`.

Пример after click:

Если нажал `✅ Буду смотреть`:

```txt
⚽ Через 30 минут матч

Canada — Morocco
Сегодня, 19:00

✅ Отмечено: будешь смотреть
```

Если нажал `❌ Не буду`:

```txt
⚽ Через 30 минут матч

Canada — Morocco
Сегодня, 19:00

❌ Отмечено: не будешь смотреть
```

SQL upsert:

```sql
insert into football_match_responses (
  user_id,
  match_id,
  response,
  telegram_callback_query_id,
  telegram_message_id
)
values (
  $1,
  $2,
  $3,
  $4,
  $5
)
on conflict(user_id, match_id)
do update set
  response = excluded.response,
  responded_at = now(),
  telegram_callback_query_id = excluded.telegram_callback_query_id,
  telegram_message_id = excluded.telegram_message_id;
```

---

## 11. Edge cases

### Матч перенесли

Если API sync увидел, что `kickoff_at` изменился:

1. обновить `football_matches.kickoff_at`;
2. найти pending reminder по этому матчу;
3. пересчитать `scheduled_at`;
4. если reminder уже sent — можно отправить отдельное сообщение:

```txt
⚠️ Время матча изменилось

Canada — Morocco теперь начнётся в 20:00.
```

Для MVP можно не слать update, а только правильно пересчитывать pending reminders.

### Матч отменили/перенесли без новой даты

Если status `PST`, `CANC`, `ABD`:

```sql
update football_match_reminders
set status = 'cancelled', updated_at = now()
where match_id = $1
  and status = 'pending';
```

### Бот упал и пропустил cron

Использовать окно:

```sql
scheduled_at <= now()
and scheduled_at > now() - interval '20 minutes'
```

Так бот не будет слать напоминание через 3 часа после матча.

### Дубли сообщений

Защита:

- unique key: `(user_id, match_id, reminder_type)`;
- после отправки сразу `status = 'sent'`;
- лучше делать transactional lock:

```sql
select ...
for update skip locked
```

Если Supabase RPC — сделать функцию `claim_due_football_reminders()`.

---

## 12. Пример TypeScript client для API-Football

```ts
type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    timestamp: number;
    venue?: {
      name?: string;
      city?: string;
    };
    status: {
      long: string;
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    season: number;
    round: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo?: string;
      winner?: boolean | null;
    };
    away: {
      id: number;
      name: string;
      logo?: string;
      winner?: boolean | null;
    };
  };
};

type ApiFootballResponse<T> = {
  get: string;
  parameters: Record<string, string>;
  errors: unknown[];
  results: number;
  paging: {
    current: number;
    total: number;
  };
  response: T[];
};

export async function fetchWorldCupFixtures(params?: {
  from?: string;
  to?: string;
}) {
  const url = new URL("https://v3.football.api-sports.io/fixtures");

  url.searchParams.set("league", "1");
  url.searchParams.set("season", "2026");

  if (params?.from) url.searchParams.set("from", params.from);
  if (params?.to) url.searchParams.set("to", params.to);

  const res = await fetch(url.toString(), {
    headers: {
      "x-apisports-key": process.env.API_FOOTBALL_KEY!,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API-Football error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as ApiFootballResponse<ApiFootballFixture>;

  return data.response;
}
```

---

## 13. Sync function skeleton

```ts
export async function syncFootballFixtures() {
  const from = "2026-07-04";
  const to = "2026-07-19";

  const fixtures = await fetchWorldCupFixtures({ from, to });

  for (const fixture of fixtures) {
    const mapped = {
      provider: "api-football",
      provider_fixture_id: fixture.fixture.id,

      league_id: fixture.league.id,
      season: fixture.league.season,
      competition_name: fixture.league.name,
      round_name: fixture.league.round,

      home_team_id: fixture.teams.home.id,
      home_team_name: fixture.teams.home.name,
      home_team_logo: fixture.teams.home.logo ?? null,

      away_team_id: fixture.teams.away.id,
      away_team_name: fixture.teams.away.name,
      away_team_logo: fixture.teams.away.logo ?? null,

      kickoff_at: fixture.fixture.date,
      venue_name: fixture.fixture.venue?.name ?? null,
      venue_city: fixture.fixture.venue?.city ?? null,

      status_short: fixture.fixture.status.short,
      status_long: fixture.fixture.status.long,

      raw_payload: fixture,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from("football_matches")
      .upsert(mapped, {
        onConflict: "provider_fixture_id",
      });
  }

  await generateFootballReminders();
}
```

---

## 14. Send reminder skeleton

```ts
export async function sendFootballReminders() {
  const { data: reminders, error } = await supabase.rpc(
    "claim_due_football_reminders"
  );

  if (error) throw error;

  for (const reminder of reminders) {
    const text = buildReminderText(reminder);

    const tgRes = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: reminder.telegram_chat_id,
          text,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Буду смотреть",
                  callback_data: `fw:${reminder.match_short_id}:yes`,
                },
                {
                  text: "❌ Не буду",
                  callback_data: `fw:${reminder.match_short_id}:no`,
                },
              ],
            ],
          },
        }),
      }
    );

    const tgJson = await tgRes.json();

    if (!tgRes.ok || !tgJson.ok) {
      await markReminderFailed(reminder.reminder_id, JSON.stringify(tgJson));
      continue;
    }

    await markReminderSent(reminder.reminder_id, tgJson.result.message_id);
  }
}
```

---

## 15. RPC для claim reminders

Чтобы не было дублей, лучше атомарно “забрать” reminders в обработку.

```sql
create or replace function claim_due_football_reminders()
returns table (
  reminder_id uuid,
  user_id uuid,
  match_id uuid,
  match_short_id text,
  telegram_chat_id bigint,
  home_team_name text,
  away_team_name text,
  kickoff_at timestamptz,
  round_name text,
  venue_name text,
  venue_city text
)
language plpgsql
security definer
as $$
begin
  return query
  with due as (
    select r.id
    from football_match_reminders r
    join football_matches m on m.id = r.match_id
    where r.status = 'pending'
      and r.scheduled_at <= now()
      and r.scheduled_at > now() - interval '20 minutes'
      and m.kickoff_at > now()
      and m.status_short in ('NS', 'TBD')
    order by r.scheduled_at asc
    limit 50
    for update skip locked
  ),
  claimed as (
    update football_match_reminders r
    set status = 'sent',
        sent_at = now(),
        updated_at = now()
    from due
    where r.id = due.id
    returning r.*
  )
  select
    c.id as reminder_id,
    c.user_id,
    c.match_id,
    m.short_id as match_short_id,
    s.telegram_chat_id,
    m.home_team_name,
    m.away_team_name,
    m.kickoff_at,
    m.round_name,
    m.venue_name,
    m.venue_city
  from claimed c
  join football_matches m on m.id = c.match_id
  join football_user_settings s on s.user_id = c.user_id;
end;
$$;
```

Минус этого подхода: мы сразу ставим `sent`, ещё до Telegram response. Более чистый вариант — добавить status `processing`, но для MVP можно так.

Если хочешь правильно, enum должен быть:

```sql
'pending', 'processing', 'sent', 'skipped', 'failed', 'cancelled'
```

И claim переводит в `processing`, а после Telegram response — в `sent`.

---

## 16. Commands в боте

Добавить команды:

### `/football`

Показывает меню:

```txt
⚽ Football reminders

Сейчас включены напоминания за 30 минут до матчей ЧМ-2026.

Что сделать?
```

Кнопки:

- `📅 Ближайшие матчи`
- `🔔 Включить напоминания`
- `🔕 Выключить напоминания`
- `⏱ Изменить время напоминания`

### `/matches`

Показывает ближайшие матчи:

```txt
Ближайшие матчи:

1. Canada — Morocco
   Сегодня, 19:00

2. Paraguay — France
   Сегодня, 23:00

3. Brazil — Norway
   Завтра, 22:00
```

### `/football_off`

Отключает reminders:

```sql
update football_user_settings
set reminders_enabled = false
where telegram_chat_id = $1;
```

### `/football_on`

Включает reminders:

```sql
update football_user_settings
set reminders_enabled = true
where telegram_chat_id = $1;
```

---

## 17. ENV variables

```env
API_FOOTBALL_KEY=
TELEGRAM_BOT_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
FOOTBALL_INTERNAL_SECRET=
```

Важно:

- `API_FOOTBALL_KEY` нельзя светить на фронте;
- все football sync/send functions должны быть server-only;
- Supabase service role использовать только внутри Edge Function/API route.

---

## 18. MVP implementation plan

### Step 1 — API key

1. Зарегистрироваться в API-Football / API-SPORTS.
2. Получить API key.
3. Проверить запрос:

```bash
curl --request GET \
  --url "https://v3.football.api-sports.io/fixtures?league=1&season=2026" \
  --header "x-apisports-key: YOUR_KEY"
```

### Step 2 — DB migration

Создать таблицы:

- `football_matches`
- `football_user_settings`
- `football_match_reminders`
- `football_match_responses`

### Step 3 — sync function

Создать function:

```txt
sync-football-fixtures
```

Она:

- тянет fixtures;
- upsert в `football_matches`;
- вызывает генерацию reminders.

### Step 4 — reminder generator

Создать:

```txt
generate-football-reminders
```

Она:

- создаёт pending reminders на будущие матчи;
- не создаёт дубли.

### Step 5 — sender

Создать:

```txt
send-football-reminders
```

Она:

- берёт due reminders;
- отправляет Telegram message;
- сохраняет `telegram_message_id`;
- обрабатывает ошибки.

### Step 6 — callback handler

В существующий Telegram webhook добавить:

```ts
if (callbackData.startsWith("fw:")) {
  await handleFootballWatchCallback(callbackQuery);
}
```

### Step 7 — cron

Настроить:

- `sync-football-fixtures` каждые 30 минут;
- `send-football-reminders` каждые 5 минут.

### Step 8 — manual test

1. Вставить тестовый матч через 35 минут.
2. Проверить, что reminder создаётся на `kickoff_at - 30 minutes`.
3. Подождать cron.
4. Проверить Telegram message.
5. Нажать `Буду смотреть`.
6. Проверить запись в `football_match_responses`.

---

## 19. Что сделать после MVP

После MVP можно добавить:

- выбор любимых команд;
- reminders только на selected teams;
- “матч начался”;
- “гол” alerts;
- итоговый счёт после матча;
- daily digest: “что сегодня смотреть”;
- AI-рекомендация: “какие матчи самые интересные сегодня”.

---

## 20. Ключевые решения

1. **API-Football / API-SPORTS** — лучший выбор для MVP.
2. **API данные — source of truth**.
3. Seed данные нужны только для теста.
4. Напоминания хранить в БД, а не вычислять на лету.
5. За 30 минут — через `scheduled_at = kickoff_at - interval '30 minutes'`.
6. Кнопки Telegram сохраняют response в `football_match_responses`.
7. Cron sender должен запускаться каждые 5 минут.
8. Нужно защищаться от дублей через unique constraints и `for update skip locked`.
