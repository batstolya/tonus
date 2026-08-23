// Часть словаря переводов (домен: demo). Собирается в ./index.ts.
// Ключ — русский исходный текст, значения — uk и en.
// Здесь живут строки фикстур демо-режима (src/lib/demoFixture.ts): экраны демо
// прогоняют их через t(), поэтому без записи тут uk/en-юзер читал бы русский.
import type { Translation } from './index'

export const demo: Record<string, Translation> = {
  // Демо-наблюдения (spec 2026-08-23-observations-design.md)
  'Долго не мог уснуть, в голове крутились задачи': {
    uk: 'Довго не міг заснути, у голові крутилися задачі',
    en: 'Took a long time to fall asleep, tasks kept spinning in my head',
  },
  'Кожа на лбу суше обычного': {
    uk: 'Шкіра на лобі сухіша, ніж зазвичай',
    en: 'Forehead skin drier than usual',
  },
  'День прошёл ровно, без спадов': {
    uk: 'День минув рівно, без спадів',
    en: 'Steady day, no dips',
  },
  'Тяжесть после обеда': {
    uk: 'Важкість після обіду',
    en: 'Heaviness after lunch',
  },
  'Проснулся до будильника, выспался': {
    uk: 'Прокинувся до будильника, виспався',
    en: 'Woke before the alarm, well rested',
  },
  'Заметил, что стал больше пить воды': {
    uk: 'Помітив, що став більше пити води',
    en: 'Noticed I am drinking more water',
  },
  'Высыпание на подбородке, второй раз за месяц': {
    uk: 'Висип на підборідді, вдруге за місяць',
    en: 'Breakout on the chin, second time this month',
  },
  // ── Эксперименты: гипотезы ─────────────────────────────────
  'Прогулка 30 минут после ужина улучшит глубокий сон': {
    uk: 'Прогулянка 30 хвилин після вечері покращить глибокий сон',
    en: 'A 30-minute walk after dinner will improve deep sleep',
  },
  'Магний за час до сна увеличит REM-фазу': {
    uk: 'Магній за годину до сну збільшить REM-фазу',
    en: 'Magnesium an hour before bed will increase REM sleep',
  },
  'Отказ от кофе после 16:00 улучшит качество сна': {
    uk: 'Відмова від кави після 16:00 покращить якість сну',
    en: 'No coffee after 4pm will improve sleep quality',
  },
  'Ранний отбой поднимет HRV на следующий день': {
    uk: 'Ранній відбій підніме HRV наступного дня',
    en: 'An earlier bedtime will raise next-day HRV',
  },
  'Дыхательные практики поднимут SpO₂ во сне': {
    uk: 'Дихальні практики піднімуть SpO₂ уві сні',
    en: 'Breathing exercises will raise SpO₂ during sleep',
  },
  'Отказ от экрана за час до сна ускорит засыпание': {
    uk: 'Відмова від екрана за годину до сну пришвидшить засинання',
    en: 'No screens an hour before bed will speed up falling asleep',
  },
  '8000+ шагов в день поднимут HRV': {
    uk: '8000+ кроків на день піднімуть HRV',
    en: '8,000+ steps a day will raise HRV',
  },

  // ── Эксперименты: что меняем ───────────────────────────────
  'Гуляю 21:00–21:30 каждый день': {
    uk: 'Гуляю 21:00–21:30 щодня',
    en: 'Walking 9:00–9:30pm every day',
  },
  'Принимаю магний в 22:00': {
    uk: 'Приймаю магній о 22:00',
    en: 'Taking magnesium at 10pm',
  },
  'Последняя чашка кофе до 16:00': {
    uk: 'Остання чашка кави до 16:00',
    en: 'Last cup of coffee before 4pm',
  },
  'Ложусь до 23:00': {
    uk: 'Лягаю до 23:00',
    en: 'Going to bed before 11pm',
  },
  'Дыхательная гимнастика перед сном': {
    uk: 'Дихальна гімнастика перед сном',
    en: 'Breathing exercises before bed',
  },
  'Телефон в другой комнате после 22:30': {
    uk: 'Телефон в іншій кімнаті після 22:30',
    en: 'Phone in another room after 10:30pm',
  },
  'Прогулка в обед минимум 30 минут': {
    uk: 'Прогулянка в обід щонайменше 30 хвилин',
    en: 'A lunchtime walk of at least 30 minutes',
  },

  // ── Эксперименты: разборы и обоснования ────────────────────
  'Средний HRV во время эксперимента вырос относительно базового периода. Это согласуется с известной связью раннего отбоя и восстановления, но двухнедельное окно короткое: часть эффекта могут объяснять тренировки и стресс. Продолжай привычку ещё 2–3 недели, чтобы подтвердить тренд.': {
    uk: 'Середній HRV під час експерименту зріс відносно базового періоду. Це узгоджується з відомим зв’язком раннього відбою та відновлення, але двотижневе вікно коротке: частину ефекту можуть пояснювати тренування та стрес. Продовжуй звичку ще 2–3 тижні, щоб підтвердити тренд.',
    en: 'Average HRV during the experiment rose compared with the baseline period. That matches the known link between an earlier bedtime and recovery, but a two-week window is short: workouts and stress may explain part of the effect. Keep the habit for another 2–3 weeks to confirm the trend.',
  },
  'Средние за периоды: {before} → {during} ({pct}%). Размер эффекта: {effect}. В демо-режиме это заглушка — в приложении разбор пишет ИИ на основе твоих данных.': {
    uk: 'Середні за періоди: {before} → {during} ({pct}%). Розмір ефекту: {effect}. У демо-режимі це заглушка — у застосунку розбір пише ШІ на основі твоїх даних.',
    en: 'Period averages: {before} → {during} ({pct}%). Effect size: {effect}. In demo mode this is a stub — in the app the analysis is written by AI from your own data.',
  },
  'В демо-данных поздний отбой связан с недосыпом.': {
    uk: 'У демо-даних пізній відбій пов’язаний із недосипом.',
    en: 'In the demo data a late bedtime goes together with short sleep.',
  },
  'Активные дни в демо-данных предшествуют более высокому HRV.': {
    uk: 'Активні дні в демо-даних передують вищому HRV.',
    en: 'In the demo data active days come before higher HRV.',
  },

  // ── Расписание тренировок ──────────────────────────────────
  'волейбол': { uk: 'волейбол', en: 'volleyball' },
  'футбол': { uk: 'футбол', en: 'football' },

  // ── Быстрый лог: заметки событий ───────────────────────────
  'Бокал вина за ужином': { uk: 'Келих вина за вечерею', en: 'A glass of wine with dinner' },
  'Курс железа, 1 таблетка': { uk: 'Курс заліза, 1 таблетка', en: 'Iron course, 1 tablet' },
  'Дедлайн на работе': { uk: 'Дедлайн на роботі', en: 'Deadline at work' },
  'Волейбол, 1.5 часа': { uk: 'Волейбол, 1.5 години', en: 'Volleyball, 1.5 hours' },
  'Зал, силовая': { uk: 'Зал, силове', en: 'Gym, strength session' },
  'Командировка': { uk: 'Відрядження', en: 'Business trip' },

  // ── Питание: блюда ─────────────────────────────────────────
  'Овсянка с ягодами и орехами': { uk: 'Вівсянка з ягодами та горіхами', en: 'Oatmeal with berries and nuts' },
  'Яичница с авокадо и тостом': { uk: 'Яєчня з авокадо і тостом', en: 'Eggs with avocado and toast' },
  'Греческий йогурт с мёдом': { uk: 'Грецький йогурт з медом', en: 'Greek yoghurt with honey' },
  'Курица с рисом и овощами': { uk: 'Курка з рисом та овочами', en: 'Chicken with rice and vegetables' },
  'Борщ со сметаной и хлебом': { uk: 'Борщ зі сметаною та хлібом', en: 'Borscht with sour cream and bread' },
  'Паста болоньезе': { uk: 'Паста болоньєзе', en: 'Pasta bolognese' },
  'Лосось с киноа и салатом': { uk: 'Лосось з кіноа та салатом', en: 'Salmon with quinoa and salad' },
  'Творог с фруктами': { uk: 'Сир з фруктами', en: 'Cottage cheese with fruit' },
  'Салат с тунцом и яйцом': { uk: 'Салат з тунцем та яйцем', en: 'Tuna and egg salad' },
  'Бургер с картошкой фри': { uk: 'Бургер з картоплею фрі', en: 'Burger with fries' },

  // ── БАДы и лечение ─────────────────────────────────────────
  'Витамин D3': { uk: 'Вітамін D3', en: 'Vitamin D3' },
  'Магний глицинат': { uk: 'Магній гліцинат', en: 'Magnesium glycinate' },
  'Омега-3': { uk: 'Омега-3', en: 'Omega-3' },
  'Креатин': { uk: 'Креатин', en: 'Creatine' },
  'Железо': { uk: 'Залізо', en: 'Iron' },
  'МЕ': { uk: 'МО', en: 'IU' },
  'Магний перед сном': { uk: 'Магній перед сном', en: 'Magnesium before bed' },
  'Проверяю, влияет ли на глубокий сон': {
    uk: 'Перевіряю, чи впливає на глибокий сон',
    en: 'Checking whether it affects deep sleep',
  },

  // ── Анализы: файлы, маркеры, единицы ───────────────────────
  'Анализ крови (весна).pdf': { uk: 'Аналіз крові (весна).pdf', en: 'Blood panel (spring).pdf' },
  'Анализ крови (лето).pdf': { uk: 'Аналіз крові (літо).pdf', en: 'Blood panel (summer).pdf' },
  'Ферритин': { uk: 'Феритин', en: 'Ferritin' },
  'Витамин D': { uk: 'Вітамін D', en: 'Vitamin D' },
  'ТТГ': { uk: 'ТТГ', en: 'TSH' },
  'Гемоглобин': { uk: 'Гемоглобін', en: 'Hemoglobin' },
  'Холестерин общий': { uk: 'Холестерин загальний', en: 'Total cholesterol' },
  'Глюкоза': { uk: 'Глюкоза', en: 'Glucose' },
  'Тестостерон общий': { uk: 'Тестостерон загальний', en: 'Total testosterone' },
  'СРБ': { uk: 'СРБ', en: 'CRP' },
  'нг/мл': { uk: 'нг/мл', en: 'ng/ml' },
  'мЕд/л': { uk: 'мОд/л', en: 'mIU/l' },
  'г/л': { uk: 'г/л', en: 'g/l' },
  'ммоль/л': { uk: 'ммоль/л', en: 'mmol/l' },
  'нмоль/л': { uk: 'нмоль/л', en: 'nmol/l' },
  'мг/л': { uk: 'мг/л', en: 'mg/l' },

  // ── Проблемы со здоровьем ──────────────────────────────────
  'Выпадение волос': { uk: 'Випадіння волосся', en: 'Hair shedding' },
  'Началось после стресса и низкого ферритина': {
    uk: 'Почалося після стресу та низького феритину',
    en: 'Started after stress and low ferritin',
  },
  'Головные боли к вечеру': { uk: 'Головний біль надвечір', en: 'Headaches in the evening' },
  'Чаще в дни с недосыпом': { uk: 'Частіше в дні з недосипом', en: 'More often on short-sleep days' },
  'После короткого сна': { uk: 'Після короткого сну', en: 'After a short night' },
  'Выпадение заметно меньше после подъёма ферритина': {
    uk: 'Випадіння помітно менше після підйому феритину',
    en: 'Shedding is clearly down since ferritin came up',
  },

  // ── Рекомендации ИИ ────────────────────────────────────────
  'Ложись до 23:00 хотя бы пять дней в неделю': {
    uk: 'Лягай до 23:00 хоча б п’ять днів на тиждень',
    en: 'Go to bed before 11pm at least five days a week',
  },
  'В твоих данных ранний отбой предшествует более высокому HRV наутро.': {
    uk: 'У твоїх даних ранній відбій передує вищому HRV зранку.',
    en: 'In your data an earlier bedtime comes before higher HRV in the morning.',
  },
  'Сдвинь последний кофе на два часа раньше': {
    uk: 'Зсунь останню каву на дві години раніше',
    en: 'Move your last coffee two hours earlier',
  },
  'В дни с кофе после 16:00 пульс покоя ночью выше на 3 удара.': {
    uk: 'У дні з кавою після 16:00 пульс спокою вночі вищий на 3 удари.',
    en: 'On days with coffee after 4pm your resting heart rate at night is 3 bpm higher.',
  },

  // ── Алерты стража ──────────────────────────────────────────
  'Пульс покоя третий день выше базового — похоже на недовосстановление.': {
    uk: 'Пульс спокою третій день вищий за базовий — схоже на недовідновлення.',
    en: 'Resting heart rate has been above baseline for three days — looks like under-recovery.',
  },
  'HRV упал на 25% относительно базы. Стоит взять день полегче.': {
    uk: 'HRV впав на 25% відносно бази. Варто взяти день легше.',
    en: 'HRV is down 25% from baseline. Worth taking an easier day.',
  },

  // ── Заметки самочувствия ───────────────────────────────────
  'Чувствую себя бодро, тренировка далась легко': {
    uk: 'Почуваюся бадьоро, тренування далося легко',
    en: 'Feeling fresh, the workout came easy',
  },
  'Тяжёлый день, много кофе и мало сна': {
    uk: 'Важкий день, багато кави й мало сну',
    en: 'Rough day, lots of coffee and little sleep',
  },
  'Спал хорошо, но к вечеру разболелась голова': {
    uk: 'Спав добре, але надвечір розболілася голова',
    en: 'Slept well, but got a headache in the evening',
  },
  'Отличное самочувствие, много гулял': {
    uk: 'Чудове самопочуття, багато гуляв',
    en: 'Felt great, walked a lot',
  },
  'Устал, лёг поздно из-за дедлайна': {
    uk: 'Втомився, ліг пізно через дедлайн',
    en: 'Tired, went to bed late because of a deadline',
  },

  // ── Заглушки ИИ в демо (demoAi.ts) ─────────────────────────
  'Это демо-режим: отвечает заглушка, а не ИИ. В приложении здесь был бы ответ на твой вопрос — модель видит 30 дней твоих метрик, заметки, цели и эксперименты и отвечает по ним. Например, на вопрос про сон: «Глубокий сон за две недели вырос на 12%, и заметнее всего в дни без кофе после 16:00».': {
    uk: 'Це демо-режим: відповідає заглушка, а не ШІ. У застосунку тут була б відповідь на твоє запитання — модель бачить 30 днів твоїх метрик, нотатки, цілі та експерименти і відповідає за ними. Наприклад, на питання про сон: «Глибокий сон за два тижні зріс на 12%, і найпомітніше в дні без кави після 16:00».',
    en: 'This is demo mode: you are talking to a stub, not the AI. In the app your question would be answered by a model that sees 30 days of your metrics, notes, goals and experiments. For a sleep question it might say: "Deep sleep is up 12% over two weeks, and most of all on days without coffee after 4pm."',
  },
  'Демо-разбор (заглушка, не настоящий ИИ). За период видно три вещи. Первое: сон стабильно короче в дни с кофе после 16:00 — в среднем на 40 минут. Второе: HRV наутро выше после активных дней с 8000+ шагов. Третье: в дни магнитных бурь восстановление проседает, но эффект слабый. В приложении такой разбор пишет ИИ по твоим данным.': {
    uk: 'Демо-розбір (заглушка, не справжній ШІ). За період видно три речі. Перше: сон стабільно коротший у дні з кавою після 16:00 — у середньому на 40 хвилин. Друге: HRV зранку вищий після активних днів з 8000+ кроків. Третє: у дні магнітних бур відновлення просідає, але ефект слабкий. У застосунку такий розбір пише ШІ за твоїми даними.',
    en: 'Demo analysis (a stub, not real AI). Three things stand out over the period. First: sleep is consistently shorter on days with coffee after 4pm — about 40 minutes on average. Second: morning HRV is higher after active days with 8,000+ steps. Third: recovery dips on geomagnetic storm days, though the effect is weak. In the app this analysis is written by AI from your own data.',
  },
  'Восстановление держится в норме, пульс покоя стабилен.': {
    uk: 'Відновлення тримається в нормі, пульс спокою стабільний.',
    en: 'Recovery is holding steady and the resting pulse is stable.',
  },
  'Кофе после 16:00 и поздний отбой в будни укорачивают сон.': {
    uk: 'Кава після 16:00 і пізній відбій у будні вкорочують сон.',
    en: 'Coffee after 16:00 and late weekday bedtimes cut sleep short.',
  },
  'Ложиться до 23:00 хотя бы пять дней в неделю.': {
    uk: 'Лягати до 23:00 хоча б п’ять днів на тиждень.',
    en: 'Get to bed before 23:00 at least five days a week.',
  },
  'Демо-анализ (заглушка, не настоящий ИИ). Общая картина спокойная: восстановление в норме, пульс покоя стабилен, сна в среднем 7 часов. Слабое место — вечерний кофе и поздний отбой в будни. Из анализов: ферритин подтянулся с 24 до 41, витамин D вышел в норму.': {
    uk: 'Демо-аналіз (заглушка, не справжній ШІ). Загальна картина спокійна: відновлення в нормі, пульс спокою стабільний, сну в середньому 7 годин. Слабке місце — вечірня кава та пізній відбій у будні. З аналізів: феритин підтягнувся з 24 до 41, вітамін D вийшов у норму.',
    en: 'Demo analysis (a stub, not real AI). The overall picture is calm: recovery is normal, resting heart rate is steady, sleep averages 7 hours. The weak spot is evening coffee and late weekday bedtimes. From the labs: ferritin climbed from 24 to 41 and vitamin D is back in range.',
  },
  // ── Календарные события карты стресса (makeDemoEvents) ──────
  'Дейли-стендап': { uk: 'Дейлі-стендап', en: 'Daily standup' },
  'Созвон с клиентом': { uk: 'Дзвінок з клієнтом', en: 'Client call' },
  'Дедлайн по проекту': { uk: 'Дедлайн по проєкту', en: 'Project deadline' },
  'Обед с командой': { uk: 'Обід з командою', en: 'Team lunch' },
  '1:1 с руководителем': { uk: '1:1 з керівником', en: '1:1 with manager' },
  'Тренировка в зале': { uk: 'Тренування в залі', en: 'Gym workout' },
  'Планирование спринта': { uk: 'Планування спринту', en: 'Sprint planning' },
  'Ретро': { uk: 'Ретро', en: 'Retro' },
  'Собеседование': { uk: 'Співбесіда', en: 'Interview' },
  'Ужин с друзьями': { uk: 'Вечеря з друзями', en: 'Dinner with friends' },
  'Демо для стейкхолдеров': { uk: 'Демо для стейкхолдерів', en: 'Stakeholder demo' },
  'Разбор инцидента': { uk: 'Розбір інциденту', en: 'Incident review' },
}
