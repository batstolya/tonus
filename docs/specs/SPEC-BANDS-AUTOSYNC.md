# Tonus — ТЗ: авто-синхронизация браслетов (Mi Band и другие не-Apple устройства)

Сейчас авто-синхронизация работает только для связки iPhone + Apple Watch:

```
Apple Health → Health Auto Export (HAE, по расписанию)
   → POST JSON → Edge Function `ingest-health?token=...`
   → staging → (паритет) → боевые таблицы
```

Задача — дать тот же «поставил и забыл» опыт владельцам браслетов
(Xiaomi Mi Band / Smart Band, Amazfit, Huawei и т.п.), у которых нет Apple Health.
Для Xiaomi уже есть **ручной** путь (CSV с account.xiaomi.com → `xiaomiParser.ts`),
он остаётся как fallback, но не решает задачу ежедневной синхронизации.

---

## 0. Ключевой инсайт: не строить per-vendor интеграции

У вендоров браслетов нет пригодных публичных API (Xiaomi Cloud API неофициальный и
ломается, Zepp/Huami API закрыт). Зато почти все браслеты умеют отдавать данные в
**агрегатор платформы**:

- **Android** → Health Connect (Mi Fitness, Zepp Life, Huawei Health*, Samsung Health — все туда пишут);
- **iPhone** → Apple Health (Mi Fitness и Zepp умеют синк в Apple Health).

Значит интегрируемся не с браслетами, а с агрегаторами — ровно как уже сделано
с Apple Health. Один пайплайн покрывает все бренды сразу.

## 1. Три пути подключения браслета

### 1.1 Браслет + iPhone → уже работает (нулевая разработка)
Mi Fitness / Zepp включает синк в Apple Health → дальше существующий путь HAE.
Единственная работа — **инструкция** в онбординге (см. `SPEC-CONNECT-GUIDE.md`):
«включи в Mi Fitness передачу в Apple Health, дальше настрой HAE как для Apple Watch».

### 1.2 Браслет + Android → Health Connect + приложение-экспортёр (основная разработка)
Аналог HAE для Android — приложение, которое читает Health Connect и шлёт JSON на вебхук:

- **HC Webhook / HCGateway** — вебхуки по расписанию/интервалу, логи, permission management
  ([github.com/mcnaveen/health-connect-webhook](https://github.com/mcnaveen/health-connect-webhook));
- **Health Connect Exports** — экспорт JSON на указанный HTTP-сервер
  ([github.com/angeloanan/HealthConnectExports](https://github.com/angeloanan/HealthConnectExports));
- **Life Dashboard Companion** — privacy-focused, 23 типа данных, JSON POST
  ([github.com/owen282000/life-dashboard-companion-app](https://github.com/owen282000/life-dashboard-companion-app)).

Цепочка: `Mi Band → Mi Fitness → Health Connect → экспортёр → POST → ingest-health?token=...`

**До реализации** (аналог §9 SPEC-AUTOSYNC): поставить один из экспортёров на реальный
Android, снять 1-2 реальных payload'а и зафиксировать формат. Выбор экспортёра-«рекомендации»
делаем по итогам теста (стабильность расписания, полнота метрик: сон фазами, HR, шаги, SpO₂).

### 1.3 Fallback: ручной CSV (уже реализовано)
account.xiaomi.com → Privacy → экспорт ZIP/CSV → `XiaomiCsvImporter`. Остаётся без изменений
для тех, кто не хочет ставить экспортёр.

## 2. Изменения в `ingest-health`

Функция становится мультиформатной, всё остальное (токены, staging, shadow/live, паритет)
переиспользуется как есть:

1. **Детектор формата** по структуре payload:
   - HAE: `{ data: { metrics: [...], workouts: [...] } }` — текущий парсер;
   - Health Connect экспортёры: свой конверт (зафиксировать по реальному примеру, §1.2).
   Детектор — по форме JSON, не по отдельному URL: один вебхук на пользователя, меньше
   поддержки. Нераспознанный формат → 422 + сырой payload в `ingest_raw` для разбора.
2. **Маппинг Health Connect record types** → те же метрики staging:
   - `Steps` → `steps`; `HeartRateRecord` → `heartRate` (avg/min/max) и `restingHeartRate`;
   - `HeartRateVariabilityRmssdRecord` → `hrv`;
   - `SleepSessionRecord` (+stages) → `sleep_sessions_staging`;
   - `ActiveCaloriesBurnedRecord` → `active_energy`; `OxygenSaturationRecord` → `oxygenSaturation`;
   - `DistanceRecord` → дистанция в км.
3. **Паритет правил корректности — тот же §5 SPEC-AUTOSYNC**: сумма внутри источника /
   максимум по источникам; сон = объединение интервалов, >16ч отбросить; SpO₂ долей.
   Критично: у Android-пользователя в Health Connect может писать и телефон (шаги), и
   браслет — источники не задваивать (source = `recordingMethod`/`dataOrigin` из HC).
4. `ingest_tokens` получает поле `source_platform` (`'hae' | 'health_connect'`, nullable,
   заполняется детектором при первом приёме) — для staleness-баннера и UI настроек
   («последний приём с Mi Band», а не абстрактно).

## 3. Что НЕ делаем (рассмотрено и отклонено)

- **Агрегаторы-посредники (Terra API, Spike, Rook, Thryve)** — прямые интеграции с
  облаками вендоров, но это B2B-подписки ($100+/мес) ради одного пользователя — не окупается.
  Вернуться, если Tonus станет мультипользовательским продуктом.
- **Своё Android-приложение** — полный контроль, но отдельная кодовая база, стор,
  подписи. YAGNI, пока готовые экспортёры работают.
- **Неофициальный Xiaomi Cloud API / Gadgetbridge** — хрупко (ломается при смене API),
  Gadgetbridge требует отвязки браслета от Mi Fitness — слишком гиковский путь для инструкции.

## 4. UI

- `DeviceSelectScreen`: у карточки Xiaomi появляется выбор пути — «Авто-синхронизация
  (Android)» / «Авто-синхронизация (iPhone)» / «Разовый импорт CSV». Ветвление инструкций —
  в `SPEC-CONNECT-GUIDE.md`.
- Настройки → «Авто-синхронизация»: заголовок перестаёт быть «(Apple Health)», показывает
  `source_platform`; вебхук-URL и токен — общие, без изменений.
- Staleness-баннер уже считает от `last_ingest_at` — работает для любого источника без правок.

## 5. Этапы

- **B1 (нулевой код):** инструкция «Mi Band + iPhone через Apple Health» в гайде подключения.
- **B2 (разведка):** поставить 1-2 экспортёра Health Connect на реальный Android c Mi Band,
  снять payload'ы, выбрать рекомендуемый экспортёр, зафиксировать формат в этой спеке.
- **B3:** детектор формата + маппинг HC → staging в `ingest-health` (mode=shadow), тесты
  на реальных payload'ах. Release only through the canonical wrapper; the
  `ingest-health` JWT mode comes from `supabase/config.toml` (see deploying-tonus).
- **B4:** сверка staging vs ожидания (экран сверки уже есть) → shadow→live.
- **B5:** `source_platform` + правки UI настроек и DeviceSelectScreen.

## 6. Открытые вопросы

1. Реальный формат payload выбранного экспортёра (закрывается в B2).
2. Есть ли у тестового Mi Band HRV и фазы сна в Health Connect (зависит от модели и версии Mi Fitness).
3. Huawei Health пишет в Health Connect только в части регионов — проверять по факту, в спеку не закладываем.
