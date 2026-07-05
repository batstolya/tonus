# iPhone-виджет готовности (Scriptable)

Readiness на домашнем экране без открытия браузера. Данные — edge-функция
`widget-data`, авторизация по личному токену.

## Установка (5 минут)

1. Поставь **Scriptable** из App Store (бесплатный).
2. В Telegram-боте Tonus отправь команду **`/widget`** — бот пришлёт твой
   секретный URL данных.
3. В Scriptable создай новый скрипт, вставь код ниже и **замени `WIDGET_URL`**
   на URL из бота.
4. На домашнем экране: долгое нажатие → «+» → Scriptable → маленький виджет →
   в настройках виджета выбери этот скрипт.

## Скрипт

```javascript
// Tonus readiness widget
const WIDGET_URL = "ВСТАВЬ_СЮДА_URL_ИЗ_БОТА"

const COLORS = {
  excellent: new Color("#34d399"),
  good: new Color("#a3e635"),
  fair: new Color("#f59e0b"),
  low: new Color("#ef4444"),
  unknown: new Color("#9ca3af"),
}

let data = { readiness: null, level: "unknown", alert: null }
try {
  data = await new Request(WIDGET_URL).loadJSON()
} catch (e) { /* нет сети — покажем прочерк */ }

const w = new ListWidget()
w.backgroundColor = new Color("#0f1230")

const title = w.addText("Tonus")
title.font = Font.boldSystemFont(12)
title.textColor = new Color("#818cf8")

w.addSpacer(4)

const value = w.addText(data.readiness != null ? String(data.readiness) : "—")
value.font = Font.boldSystemFont(42)
value.textColor = COLORS[data.level] ?? COLORS.unknown

const label = w.addText("готовность")
label.font = Font.systemFont(11)
label.textColor = new Color("#b9c0f5")

if (data.alert) {
  w.addSpacer(4)
  const alert = w.addText(data.alert.level === "red" ? "🔴 организм борется" : "🟡 присмотрись")
  alert.font = Font.systemFont(10)
  alert.textColor = new Color("#f9a8d4")
}

w.addSpacer(6)
const upd = w.addText(data.date ?? "")
upd.font = Font.systemFont(9)
upd.textColor = new Color("#6b7280")

// обновление примерно раз в 30 минут
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000)

Script.setWidget(w)
Script.complete()
```

## Что показывает

- **Число** — readiness за последний день (цвет: ≥80 зелёный, ≥60 салатовый,
  ≥40 жёлтый, ниже — красный).
- **Бейдж алерта** — если страж здоровья (F1) видит незакрытый алерт за 48 ч.
- **Дата** — за какой день скор.

## Отладка

- URL можно проверить в браузере — должен вернуться JSON.
- `{"error":"Invalid token"}` → сгенерируй новый через `/widget` в боте.
- Виджет не обновляется — iOS обновляет виджеты по своему расписанию,
  «примерно раз в 30 минут» — ориентир, не гарантия.
