# Как выгрузить события из cal.beskarstaff.com

## Шаг 1 — Получить токен сессии

1. Зайди на https://cal.beskarstaff.com
2. Открой DevTools: **F12** → вкладка **Application**
3. Слева: **Cookies** → `https://cal.beskarstaff.com`
4. Найди куку `__Secure-next-auth.session-token` → скопируй значение

## Шаг 2 — Скачать события

Запусти в терминале (вставь токен):

```bash
CAL_TOKEN='вставь_токен_сюда' node /Users/anatolii/tonus/fetch-cal.mjs > ~/Desktop/cal_bookings.json
```

В терминале появится:
```
Fetched 100 bookings...
Fetched 167 bookings...
```

## Шаг 3 — Загрузить в Tonus

1. Открой Tonus (http://localhost:5173)
2. Загрузи export.zip от Apple Health
3. В топбаре нажми **«📅 cal_bookings.json»**
4. Выбери файл `~/Desktop/cal_bookings.json`

## Примечания

- Токен живёт несколько часов — если скрипт вернёт ошибку, получи новый токен
- Скрипт скачивает только прошедшие события (status: past)
- Файл `fetch-cal.mjs` лежит в `/Users/anatolii/tonus/`
