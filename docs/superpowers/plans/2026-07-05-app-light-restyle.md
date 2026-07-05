# App Light Restyle (mate-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Светлая тема внутренних экранов в mate-стиле (белые карточки с мягкими тенями, светлый фон, жирные заголовки) + light как дефолт везде.

**Architecture:** Все изменения — значения токенов и light-scoped переопределения в `src/index.css` (приложение уже на CSS-переменных); дефолт темы — однострочник в `App.tsx`. Тёмная тема визуально не меняется, кроме `--radius` 12→14px и веса заголовков (утверждено спекой).

**Tech Stack:** React 19, Vite, vitest (env node). Node 24: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.

**Spec:** `docs/superpowers/specs/2026-07-05-app-light-restyle-design.md`

**Верификация в превью:** dev-сервер `tonus-dev` (`.claude/launch.json`, порт 5173), dummy `.env.local` (см. running-tonus). Внутренние экраны — демо-режим: `localStorage.setItem('tonus_demo','1')` + reload. Темы: `localStorage.setItem('theme','light'|'dark')` или `localStorage.removeItem('theme')` для дефолта.

---

### Task 1: Light — дефолт везде

**Files:**
- Modify: `src/App.tsx:114`

- [ ] **Step 1: Убрать условие по сессии**

В `src/App.tsx:114` заменить

```ts
const { theme, toggle: toggleTheme } = useTheme(user ? 'dark' : 'light')
```

на

```ts
const { theme, toggle: toggleTheme } = useTheme('light')
```

`resolveTheme` (сохранённый выбор побеждает) не трогаем — контракт уже зафиксирован тестами `src/hooks/useTheme.test.ts`.

- [ ] **Step 2: Тесты + tsc**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test && npx tsc -b`
Expected: 107 тестов PASS, tsc чисто.

- [ ] **Step 3: Верификация в превью**

1. `preview_eval`: `localStorage.clear(); localStorage.setItem('tonus_demo','1'); location.reload()`.
2. `document.documentElement.dataset.theme` → `'light'` (залогинен в демо, дефолт light).
3. Тумблер в шапке приложения (`.theme-toggle`) переключает на dark, после reload остаётся dark.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(theme): light — тема по умолчанию везде (сохранённый выбор побеждает)"
```

---

### Task 2: Токены + общие правки + фикс light-багов

**Files:**
- Modify: `src/index.css` (`:root` :1-16, `[data-theme="light"]` :18-31, `.upload-zone:hover` :202, `.error-msg` :227, `.screen h2` :291)

- [ ] **Step 1: Токены**

В `:root` (строка 12) сменить радиус и добавить токен тени:

```css
  --radius: 14px;
  --card-shadow: none;
```

В `[data-theme="light"]` обновить/добавить:

```css
  --bg: #f6f6f9;
  --border: #ececf2;
  --card-shadow: 0 4px 16px rgba(17, 17, 24, 0.06);
```

(`--bg` было `#f2f2f7`, `--border` было `#e0e0e8`; остальные light-токены не трогать.)

- [ ] **Step 2: Типографика заголовков экранов**

Строка 291, заменить

```css
.screen h2 { font-size: 22px; font-weight: 700; }
```

на

```css
.screen h2 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
```

- [ ] **Step 3: Фикс тёмных хардкодов (баги текущей light)**

Строка 202, заменить

```css
.upload-zone:hover, .upload-zone.dragging { border-color: var(--accent); background: #1e2235; }
```

на

```css
.upload-zone:hover, .upload-zone.dragging { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
```

Строка 227, заменить

```css
.error-msg { color: var(--red); font-size: 14px; background: #2a1a1a; padding: 12px 20px; border-radius: 8px; }
```

на

```css
.error-msg { color: var(--red); font-size: 14px; background: color-mix(in srgb, var(--red) 12%, var(--surface)); padding: 12px 20px; border-radius: 8px; }
```

- [ ] **Step 4: Проверка dark не сломан**

В превью: `localStorage.setItem('theme','dark'); location.reload()` — дашборд демо выглядит как раньше (радиусы чуть мягче — ок), upload-экран (Settings → импорт или экран загрузки): hover зоны — тёмно-синеватый оттенок, не белый.

- [ ] **Step 5: Тесты + commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/index.css
git commit -m "feat(theme): токены mate-light (фон, бордеры, card-shadow), радиус 14px, фикс тёмных хардкодов"
```

---

### Task 3: Карточки в light — тени вместо бордеров

**Files:**
- Modify: `src/index.css` (новый блок в конце файла)

- [ ] **Step 1: Добавить light-блок карточек в конец index.css**

```css
/* ── Светлая тема: карточки mate-стиля (тени вместо бордеров) ── */
/* Держим одним блоком (как light-секция в Landing.css), не размазывая по файлу. */
[data-theme="light"] .metric-card,
[data-theme="light"] .insights-preview,
[data-theme="light"] .chart-block,
[data-theme="light"] .insight-card,
[data-theme="light"] .quick-log,
[data-theme="light"] .readiness-card,
[data-theme="light"] .ai-block,
[data-theme="light"] .ai-consent-card,
[data-theme="light"] .ai-budget-widget,
[data-theme="light"] .settings-section,
[data-theme="light"] .supp-form,
[data-theme="light"] .supp-card,
[data-theme="light"] .supp-stock-panel,
[data-theme="light"] .ins-block,
[data-theme="light"] .ins-card,
[data-theme="light"] .nutr-today,
[data-theme="light"] .labs-trend-card,
[data-theme="light"] .labs-file-card,
[data-theme="light"] .goals-form,
[data-theme="light"] .goal-rec-card,
[data-theme="light"] .goal-card,
[data-theme="light"] .concern-card,
[data-theme="light"] .concern-chart-wrap,
[data-theme="light"] .concern-log-form,
[data-theme="light"] .context-journal,
[data-theme="light"] .stress-item,
[data-theme="light"] .auth-card,
[data-theme="light"] .progress-bar-wrap,
[data-theme="light"] .chat-window,
[data-theme="light"] .coach-focus-card {
  box-shadow: var(--card-shadow);
}

/* Интерактивные карточки: hover — тень глубже (accent-бордер остаётся) */
[data-theme="light"] .metric-card:hover,
[data-theme="light"] .concern-card:hover {
  box-shadow: 0 8px 24px rgba(17, 17, 24, 0.10);
}
```

Примечание: бордеры карточек не убираем — они уже почти невидимы после смены `--border` на `#ececf2` (Task 2), а границы нужны тёмной теме.

- [ ] **Step 2: Верификация в превью (light, демо)**

1. `localStorage.setItem('theme','light'); localStorage.setItem('tonus_demo','1'); location.reload()`.
2. Dashboard: метрики/readiness/quick log — белые карточки с мягкой тенью на фоне `#f6f6f9`; hover метрик-карты приподнимает тень.
3. `preview_inspect` `.metric-card` (`box-shadow`) — `rgba(17, 17, 24, 0.06) 0px 4px 16px`.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(theme): light-карточки с мягкими тенями (mate-стиль) по всем экранам"
```

---

### Task 4: Аудит всех экранов в демо-режиме

**Files:**
- Modify: `src/index.css` (точечные light-фиксы по находкам — ожидаемая часть задачи)

- [ ] **Step 1: Пройти все экраны в light**

В демо-режиме, light, десктоп 1280: переключить все вкладки навигации и субвкладки — Dashboard, Body (метрики, сон, пульс, стресс-карта, волосы, анализы), Journal (приёмы, питание, добавки, цели, эксперименты), Coach, Research, Settings, чат (FAB справа внизу). На каждом экране проверять: тёмные артефакты, невидимые элементы (белое на белом), нечитаемый контраст, сломанные tinted-блоки (`color-mix` поверх нового фона).

Каждую находку фиксить сразу правилом `[data-theme="light"] .селектор { ... }` в light-блоке из Task 3 (паттерн: тёмный хардкод → `color-mix` от токенов).

- [ ] **Step 2: Мобильная проверка**

`preview_resize` mobile (375px), light: Dashboard, Body→метрики, Journal→добавки, Settings, чат. Карточки и нижняя навигация без слома.

- [ ] **Step 3: Контрольный проход dark**

`localStorage.setItem('theme','dark'); location.reload()`, десктоп: Dashboard, Settings, Journal→добавки, чат — визуально прежний вид (кроме радиуса 14px и жирных заголовков).

- [ ] **Step 4: Commit (если были фиксы)**

```bash
git add src/index.css
git commit -m "fix(theme): light-фиксы по аудиту экранов"
```

---

### Task 5: Финальная верификация

- [ ] **Step 1: Полный прогон**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test && npm run build && npx eslint src/index.css src/App.tsx 2>&1 | tail -5`
Expected: 107 тестов PASS, build OK, eslint без новых ошибок в изменённых файлах (в App.tsx есть 2 pre-existing: строки ~147, ~223 — не наши).

- [ ] **Step 2: Сквозной сценарий**

1. `localStorage.clear()` + reload → лендинг light; «Посмотреть демо» → приложение light (без скачка темы).
2. Тумблер → dark, reload → dark сохранён.
3. Финальные скриншоты: Dashboard light desktop, Dashboard dark desktop, Dashboard light mobile.

- [ ] **Step 3: Итог пользователю**

Отчёт + скриншоты. Деплой = merge в main (спросить: PR как в прошлый раз или сразу пуш).

---

## Self-Review (выполнено при написании)

- **Spec coverage:** дефолт light → Task 1; токены/радиус/типографика/хардкоды → Task 2; карточки-тени → Task 3; пастель-контроль и аудит остальных хардкодов → Task 4 Step 1; приёмка (все экраны, мобилка, dark-контроль, тесты) → Task 4-5. Пробелов нет.
- **Placeholders:** нет; аудит-задача содержит правило реакции и паттерн фикса.
- **Type consistency:** токен `--card-shadow` определён в Task 2, используется в Task 3; список классов сверен с фактическим `index.css` (grep `background: var(--surface)`).
