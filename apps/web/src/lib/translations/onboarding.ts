// Часть словаря переводов (домен: onboarding). Собирается в ./index.ts.
// Ключ — русский исходный текст, значения — uk и en. НЕ править вручную порознь:
// это данные, вырезанные из бывшего translations.ts (воркстрим C, декомпозиция).
import type { Translation } from './index'

export const onboarding: Record<string, Translation> = {
  // ── Онбординг ──────────────────────────────────────────────
  'Какое у вас устройство?': { uk: 'Який у вас пристрій?', en: 'What device do you use?' },
  'Выбор можно изменить позже в настройках': { uk: 'Вибір можна змінити пізніше в налаштуваннях', en: 'You can change this later in settings' },
  'Экспорт через приложение «Здоровье» на iPhone': { uk: 'Експорт через застосунок «Здоровʼя» на iPhone', en: 'Export via the Health app on iPhone' },
  'Экспорт через account.xiaomi.com — CSV с данными': { uk: 'Експорт через account.xiaomi.com — CSV з даними', en: 'Export via account.xiaomi.com — CSV data' },


  // ── Гайд подключения ──────────────────────────────────────
  'Далее': { uk: 'Далі', en: 'Next' },
  'Данные будут приходить сами': { uk: 'Дані надходитимуть самі', en: 'Your data will arrive on its own' },
  'Часы → телефон → Tonus. Один раз настроим — дальше всё автоматически, каждый день.': {
    uk: 'Годинник → телефон → Tonus. Налаштуємо один раз — далі все автоматично, щодня.',
    en: 'Watch → phone → Tonus. Set it up once — everything syncs automatically, every day.',
  },
  'Установи Health Auto Export': { uk: 'Установи Health Auto Export', en: 'Install Health Auto Export' },
  'Это приложение само отправляет данные Apple Health в Tonus. Есть бесплатный пробный период — хватит, чтобы всё проверить.': {
    uk: 'Цей застосунок сам надсилає дані Apple Health у Tonus. Є безкоштовний пробний період — вистачить, щоб усе перевірити.',
    en: 'This app sends your Apple Health data to Tonus automatically. It has a free trial — enough to check everything works.',
  },
  'Открыть в App Store': { uk: 'Відкрити в App Store', en: 'Open in App Store' },
  'Создай автоматизацию': { uk: 'Створи автоматизацію', en: 'Create an automation' },
  'В Health Auto Export открой вкладку Automations и нажми «+».': {
    uk: 'У Health Auto Export відкрий вкладку Automations і натисни «+».',
    en: 'In Health Auto Export, open the Automations tab and tap “+”.',
  },
  'Automations → «+»': { uk: 'Automations → «+»', en: 'Automations → “+”' },
  'Тип: REST API': { uk: 'Тип: REST API', en: 'Type: REST API' },
  'Метод POST · Формат JSON': { uk: 'Метод POST · Формат JSON', en: 'Method POST · Format JSON' },
  'Вставь адрес Tonus': { uk: 'Встав адресу Tonus', en: 'Paste your Tonus address' },
  'Скопируй персональную ссылку и вставь её в поле URL автоматизации.': {
    uk: 'Скопіюй персональне посилання та встав його в поле URL автоматизації.',
    en: 'Copy your personal link and paste it into the automation URL field.',
  },
  'Выбери данные и расписание': { uk: 'Вибери дані та розклад', en: 'Choose data and schedule' },
  'Включи все метрики здоровья и сон': { uk: 'Увімкни всі метрики здоровʼя і сон', en: 'Enable all health metrics and sleep' },
  'Интервал — каждые 1-3 часа': { uk: 'Інтервал — кожні 1-3 години', en: 'Interval — every 1-3 hours' },
  'Не забудь включить автоматизацию (Enable)': { uk: 'Не забудь увімкнути автоматизацію (Enable)', en: 'Don’t forget to switch the automation on (Enable)' },
  'Не удалось получить ссылку': { uk: 'Не вдалося отримати посилання', en: 'Couldn’t fetch your link' },
  // Task 5 — проверка связи
  'Проверим связь': { uk: 'Перевіримо звʼязок', en: 'Let’s test the connection' },
  'Открой Health Auto Export и нажми Manual Export — мы ждём данные.': {
    uk: 'Відкрий Health Auto Export і натисни Manual Export — ми чекаємо на дані.',
    en: 'Open Health Auto Export and tap Manual Export — we’re waiting for your data.',
  },
  'Слушаем эфир…': { uk: 'Слухаємо ефір…', en: 'Listening…' },
  'Данные пришли!': { uk: 'Дані надійшли!', en: 'Data received!' },
  'Первые графики появятся после следующей синхронизации.': {
    uk: 'Перші графіки зʼявляться після наступної синхронізації.',
    en: 'Your first charts will appear after the next sync.',
  },
  'В приложение': { uk: 'До застосунку', en: 'Open the app' },
  'Пока ничего не пришло. Проверь:': { uk: 'Поки нічого не надійшло. Перевір:', en: 'Nothing arrived yet. Check:' },
  'URL вставлен целиком, вместе с token=': { uk: 'URL вставлено повністю, разом із token=', en: 'The URL is pasted in full, including token=' },
  'Метод — POST, формат — JSON': { uk: 'Метод — POST, формат — JSON', en: 'Method — POST, format — JSON' },
  'Автоматизация включена (Enable)': { uk: 'Автоматизацію увімкнено (Enable)', en: 'The automation is switched on (Enable)' },
  'Проверить ещё раз': { uk: 'Перевірити ще раз', en: 'Try again' },
  'Какой у тебя телефон?': { uk: 'Який у тебе телефон?', en: 'What phone do you have?' },
  'Разовый импорт CSV': { uk: 'Разовий імпорт CSV', en: 'One-time CSV import' },
  'Включи синк с Apple Health': { uk: 'Увімкни синхронізацію з Apple Health', en: 'Enable Apple Health sync' },
  'В Mi Fitness: Профиль → Настройки → Apple Health → разреши запись данных. Дальше настроим как для Apple Watch.': {
    uk: 'У Mi Fitness: Профіль → Налаштування → Apple Health → дозволь запис даних. Далі налаштуємо як для Apple Watch.',
    en: 'In Mi Fitness: Profile → Settings → Apple Health → allow writing data. Then we set up the rest just like for Apple Watch.',
  },
  'Авто-синхронизация для Android скоро': { uk: 'Авто-синхронізація для Android незабаром', en: 'Auto-sync for Android is coming soon' },
  'Пока используй разовый импорт CSV с account.xiaomi.com — мы сообщим, когда авто-синк будет готов.': {
    uk: 'Поки що використовуй разовий імпорт CSV з account.xiaomi.com — ми повідомимо, коли авто-синк буде готовий.',
    en: 'For now, use the one-time CSV import from account.xiaomi.com — we’ll let you know when auto-sync is ready.',
  },
  'Профиль': { uk: 'Профіль', en: 'Profile' },
  'Как подключить устройство': { uk: 'Як підключити пристрій', en: 'How to connect a device' },


  // ── Авторизация ────────────────────────────────────────────
  'Личный хаб здоровья': { uk: 'Особистий хаб здоровʼя', en: 'Your personal health hub' },
  'Вход': { uk: 'Вхід', en: 'Sign in' },
  'Войти': { uk: 'Увійти', en: 'Sign in' },
  'Регистрация': { uk: 'Реєстрація', en: 'Sign up' },
  'Создать аккаунт': { uk: 'Створити акаунт', en: 'Create account' },
  'Пароль': { uk: 'Пароль', en: 'Password' },
  'Повтори пароль': { uk: 'Повтори пароль', en: 'Repeat password' },
  'Минимум 6 символов': { uk: 'Мінімум 6 символів', en: 'At least 6 characters' },
  'Забыл пароль': { uk: 'Забув пароль', en: 'Forgot password' },
  'Восстановление пароля': { uk: 'Відновлення пароля', en: 'Password reset' },
  'Отправить ссылку': { uk: 'Надіслати посилання', en: 'Send link' },
  'Вернуться ко входу': { uk: 'Повернутися до входу', en: 'Back to sign in' },
  'Пароли не совпадают': { uk: 'Паролі не збігаються', en: 'Passwords do not match' },
  'Письмо отправлено': { uk: 'Лист надіслано', en: 'Email sent' },
  'Подтверди email': { uk: 'Підтверди email', en: 'Confirm your email' },
  'Письмо отправлено на': { uk: 'Лист надіслано на', en: 'Email sent to' },
  'Перейди по ссылке в письме, затем войди.': { uk: 'Перейди за посиланням у листі, потім увійди.', en: 'Follow the link in the email, then sign in.' },
  'Проверь': { uk: 'Перевір', en: 'Check' },
  'там ссылка для сброса пароля.': { uk: 'там посилання для скидання пароля.', en: 'it has a password reset link.' },
  'Неверный email или пароль': { uk: 'Невірний email або пароль', en: 'Invalid email or password' },
  'Войти через Google': { uk: 'Увійти через Google', en: 'Sign in with Google' },
  'Открываем Google…': { uk: 'Відкриваємо Google…', en: 'Opening Google…' },
  'или': { uk: 'або', en: 'or' },


  // ── Telegram-демо (экран входа) ────────────────────────────
  'Демо Telegram-бота Tonus': { uk: 'Демо Telegram-бота Tonus', en: 'Tonus Telegram bot demo' },
  'Сообщение…': { uk: 'Повідомлення…', en: 'Message…' },
  'Сцена': { uk: 'Сцена', en: 'Scene' },
  // Сцена 1 — лог текста
  'Привет! 👋 Отправь что-нибудь интересное': { uk: 'Привіт! 👋 Надішли щось цікаве', en: 'Hi! 👋 Send me something interesting' },
  'пил кофе в 14:00 ☕': { uk: 'пив каву о 14:00 ☕', en: 'had coffee at 14:00 ☕' },
  '⏳ Анализирую': { uk: '⏳ Аналізую', en: '⏳ Analyzing' },
  '✅ Записал!': { uk: '✅ Записав!', en: '✅ Logged!' },
  '☕ Кофе в 14:00': { uk: '☕ Кава о 14:00', en: '☕ Coffee at 14:00' },
  '95 мг кофеина': { uk: '95 мг кофеїну', en: '95 mg caffeine' },
  '📊 Добавлено в дашборд': { uk: '📊 Додано в дашборд', en: '📊 Added to dashboard' },
  // Сцена 2 — фото еды
  'Покажи, что ты ешь 🍽️': { uk: 'Покажи, що ти їси 🍽️', en: 'Show me what you eat 🍽️' },
  'Фото еды': { uk: 'Фото їжі', en: 'Food photo' },
  '⏳ Анализирую фото': { uk: '⏳ Аналізую фото', en: '⏳ Analyzing photo' },
  '🔍 Я вижу:': { uk: '🔍 Я бачу:', en: '🔍 I can see:' },
  '🍟 Картошка фри': { uk: '🍟 Картопля фрі', en: '🍟 French fries' },
  '📊 Нутриенты:': { uk: '📊 Нутрієнти:', en: '📊 Nutrients:' },
  'ккал · 25 г белка': { uk: 'ккал · 25 г білка', en: 'kcal · 25g protein' },
  '30 г жиров · 45 г углеводов': { uk: '30 г жирів · 45 г вуглеводів', en: '30g fat · 45g carbs' },
  '✅ Сохранено в дневник питания': { uk: '✅ Збережено в щоденник харчування', en: '✅ Saved to food diary' },
  // Сцена 3 — AI-анализ здоровья
  'Как дела? 👋': { uk: 'Як справи? 👋', en: 'How are you? 👋' },
  'Почему я так устаю днём?': { uk: 'Чому я так втомлююсь удень?', en: 'Why am I so tired during the day?' },
  '⏳ Анализирую твои данные': { uk: '⏳ Аналізую твої дані', en: '⏳ Analyzing your data' },
  '🧠 Я нашёл 3 закономерности:': { uk: '🧠 Я знайшов 3 закономірності:', en: '🧠 I found 3 patterns:' },
  '☕ Кофе после 15:00': { uk: '☕ Кава після 15:00', en: '☕ Coffee after 15:00' },
  '→ сон на 1.5 ч короче следующей ночью': { uk: '→ сон на 1.5 год коротший наступної ночі', en: '→ sleep 1.5h shorter the next night' },
  '🍽️ Поздняя еда (после 21:00)': { uk: '🍽️ Пізня їжа (після 21:00)', en: '🍽️ Late meals (after 21:00)' },
  '→ HRV падает на 15%': { uk: '→ HRV падає на 15%', en: '→ HRV drops by 15%' },
  '💼 Стрессовые дни': { uk: '💼 Стресові дні', en: '💼 Stressful days' },
  '→ пульс покоя выше на 8 уд/мин': { uk: '→ пульс спокою вищий на 8 уд/хв', en: '→ resting heart rate up by 8 bpm' },
  '💡 Совет: ложись спать на 20 минут раньше': { uk: '💡 Порада: лягай спати на 20 хвилин раніше', en: '💡 Tip: go to bed 20 minutes earlier' },
  '🔬 Запустить эксперимент?': { uk: '🔬 Запустити експеримент?', en: '🔬 Run an experiment?' },
  'ДА': { uk: 'ТАК', en: 'YES' },

}
