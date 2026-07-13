// Часть словаря переводов (домен: landing). Собирается в ./index.ts.
// Ключ — русский исходный текст, значения — uk и en. НЕ править вручную порознь:
// это данные, вырезанные из бывшего translations.ts (воркстрим C, декомпозиция).
import type { Translation } from './index'

export const landing: Record<string, Translation> = {
  // ── Лендинг (публичная витрина) ────────────────────────────
  'Попробовать': { uk: 'Спробувати', en: 'Try it' },
  'Готовность': { uk: 'Готовність', en: 'Readiness' },
  'Всё о твоём здоровье — в одном месте. И AI, который находит, что на тебя реально влияет.': { uk: 'Усе про твоє здоровʼя — в одному місці. І AI, який знаходить, що на тебе справді впливає.', en: 'Everything about your health in one place — and an AI that finds what actually affects you.' },
  'Личный хаб здоровья: Apple Watch, привычки и анализы — а AI находит закономерности.': { uk: 'Особистий хаб здоровʼя: Apple Watch, звички й аналізи — а AI знаходить закономірності.', en: 'Your personal health hub: Apple Watch, habits and labs — and AI finds the patterns.' },
  'Готов(а) попробовать?': { uk: 'Готовий(а) спробувати?', en: 'Ready to try?' },
  'На главную': { uk: 'На головну', en: 'Home' },

  // метрики / дашборд

  // AI-инсайты
  '→ сон на 1.5 ч короче': { uk: '→ сон на 1.5 год коротший', en: '→ sleep 1.5h shorter' },
  '🍽️ Поздняя еда': { uk: '🍽️ Пізня їжа', en: '🍽️ Late meals' },

  // AI-чат / Telegram
  'Спрашивай о своём здоровье — отвечает по твоим данным': { uk: 'Питай про своє здоровʼя — відповідає за твоїми даними', en: 'Ask about your health — it answers from your data' },
  'По твоим данным: за последнюю неделю сон в среднем 6.2 ч и поздний кофе 4 дня из 7. Попробуй сдвинуть кофе на утро.': { uk: 'За твоїми даними: за останній тиждень сон у середньому 6.2 год і пізня кава 4 дні з 7. Спробуй перенести каву на ранок.', en: 'From your data: last week sleep averaged 6.2h and late coffee on 4 of 7 days. Try moving coffee to the morning.' },
  'печатает…': { uk: 'друкує…', en: 'typing…' },

  // эксперименты
  'Проверяй, что работает именно на тебе': { uk: 'Перевіряй, що працює саме на тобі', en: 'Test what actually works for you' },
  'Гипотеза: меньше кофе → лучше сон': { uk: 'Гіпотеза: менше кави → кращий сон', en: 'Hypothesis: less coffee → better sleep' },
  'Период A': { uk: 'Період A', en: 'Period A' },
  'Период B': { uk: 'Період B', en: 'Period B' },
  'Результат': { uk: 'Результат', en: 'Result' },
  'глубокий сон': { uk: 'глибокий сон', en: 'deep sleep' },

  // сетка фич
  'И это ещё не всё': { uk: 'І це ще не все', en: 'And there is more' },
  'Препараты и лечение': { uk: 'Препарати й лікування', en: 'Meds & treatment' },
  'Анализы из лаборатории': { uk: 'Аналізи з лабораторії', en: 'Lab results' },
  'Два языка: uk / en': { uk: 'Дві мови: uk / en', en: 'Two languages: uk / en' },


  // ── Лендинг 2.0 ────────────────────────────────────────────
  'Это живые данные — потрогай': { uk: 'Це живі дані — поторкай', en: 'Live data — click around' },
  'Открыть полное демо': { uk: 'Відкрити повне демо', en: 'Open the full demo' },
  'Apple Watch — синк сам': { uk: 'Apple Watch — синк сам', en: 'Apple Watch — syncs itself' },
  'Telegram-бот': { uk: 'Telegram-бот', en: 'Telegram bot' },
  'AI на Gemini': { uk: 'AI на Gemini', en: 'AI powered by Gemini' },
  'Данные твои — экспорт в один клик': { uk: 'Дані твої — експорт в один клік', en: 'Your data — one-click export' },
  'Как это работает': { uk: 'Як це працює', en: 'How it works' },
  'Часы синхронизируются сами': { uk: 'Годинник синхронізується сам', en: 'Your watch syncs itself' },
  'Раз в час Apple Health отправляет свежие данные — без кнопок и кабелей.': { uk: 'Раз на годину Apple Health надсилає свіжі дані — без кнопок і кабелів.', en: 'Every hour Apple Health pushes fresh data — no buttons, no cables.' },
  'AI находит связи': { uk: 'AI знаходить звʼязки', en: 'AI finds the links' },
  'Сон, кофе, стресс, анализы — Tonus связывает всё и показывает, что на что влияет.': { uk: 'Сон, кава, стрес, аналізи — Tonus повʼязує все і показує, що на що впливає.', en: 'Sleep, coffee, stress, labs — Tonus connects everything and shows what affects what.' },
  'Проверяешь экспериментом': { uk: 'Перевіряєш експериментом', en: 'You verify with an experiment' },
  'Меняешь привычку — Tonus честно считает «до» и «после».': { uk: 'Змінюєш звичку — Tonus чесно рахує «до» і «після».', en: 'Change a habit — Tonus honestly measures before vs after.' },
  'Что показали мои анализы?': { uk: 'Що показали мої аналізи?', en: 'What did my labs show?' },
  'Ферритин 28 — ниже нормы, это может объяснять усталость из твоих заметок. Обсуди с врачом добавку железа.': { uk: 'Феритин 28 — нижче норми, це може пояснювати втому з твоїх нотаток. Обговори з лікарем добавку заліза.', en: 'Ferritin is 28 — below range, which may explain the fatigue in your notes. Discuss iron supplementation with your doctor.' },
  'ИИ отвечает по твоим данным, а не из интернета.': { uk: 'ШІ відповідає за твоїми даними, а не з інтернету.', en: 'The AI answers from your data, not the internet.' },
  'Telegram — пульт от твоего здоровья': { uk: 'Telegram — пульт від твого здоровʼя', en: 'Telegram — the remote control for your health' },
  'Напоминания о препаратах в нужное время': { uk: 'Нагадування про препарати в потрібний час', en: 'Supplement reminders at the right time' },
  'Лог одной строкой: «кофе», «магний», «пробежка»': { uk: 'Лог одним рядком: «кава», «магній», «пробіжка»', en: 'One-line logging: "coffee", "magnesium", "run"' },
  'Отчёт раз в две недели — что улучшилось, что просело': { uk: 'Звіт раз на два тижні — що покращилось, що просіло', en: 'A report every two weeks — what improved, what slipped' },
  '💊 Магний 400мг — пора принять': { uk: '💊 Магній 400мг — час прийняти', en: '💊 Magnesium 400mg — time to take it' },
  '✓ Принял': { uk: '✓ Прийняв', en: '✓ Taken' },
  '☕ Записал: кофе в 14:20': { uk: '☕ Записав: кава о 14:20', en: '☕ Logged: coffee at 14:20' },
  'кофе': { uk: 'кава', en: 'coffee' },
  '📊 За 2 недели: сон +40 мин, HRV +6 мс': { uk: '📊 За 2 тижні: сон +40 хв, HRV +6 мс', en: '📊 Last 2 weeks: sleep +40 min, HRV +6 ms' },

}
