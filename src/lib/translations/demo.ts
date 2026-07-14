// Часть словаря переводов (домен: demo). Собирается в ./index.ts.
// Ключ — русский исходный текст, значения — uk и en.
// Здесь живут строки фикстур демо-режима (src/lib/demoFixture.ts): экраны демо
// прогоняют их через t(), поэтому без записи тут uk/en-юзер читал бы русский.
import type { Translation } from './index'

export const demo: Record<string, Translation> = {
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
}
