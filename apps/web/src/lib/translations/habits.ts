// Часть словаря переводов (домен: habits). Собирается в ./index.ts.
// Ключ — русский исходный текст, значения — uk и en.
// Покрывает строки HabitCard (Task 4) и HabitsScreen (Task 5).
import type { Translation } from './index'

export const habits: Record<string, Translation> = {
  'Привычки': { uk: 'Звички', en: 'Habits' },
  'Привычек пока нет.': { uk: 'Звичок поки немає.', en: 'No habits yet.' },
  'Добавить привычку': { uk: 'Додати звичку', en: 'Add a habit' },
  'Название': { uk: 'Назва', en: 'Name' },
  'Заметка': { uk: 'Нотатка', en: 'Note' },
  'Начало отсчёта': { uk: 'Початок відліку', en: 'Start date' },
  'Создать привычку': { uk: 'Створити звичку', en: 'Create habit' },
  'Сохраняем…': { uk: 'Зберігаємо…', en: 'Saving…' },
  'Не удалось сохранить отметку — попробуй ещё раз': {
    uk: 'Не вдалося зберегти позначку — спробуй ще раз',
    en: "Couldn't save the mark — try again",
  },
  'Скрыть архив': { uk: 'Сховати архів', en: 'Hide archive' },
  'Архив': { uk: 'Архів', en: 'Archive' },
  'Сорвался сегодня': { uk: 'Зірвався сьогодні', en: 'Slipped today' },
  'Сорвался вчера': { uk: 'Зірвався вчора', en: 'Slipped yesterday' },
  'Убрать отметку': { uk: 'Прибрати позначку', en: 'Remove mark' },
  'Архивировать привычку': { uk: 'Архівувати звичку', en: 'Archive habit' },
  'Восстановить привычку': { uk: 'Відновити звичку', en: 'Restore habit' },
  'Лучший': { uk: 'Найкращий', en: 'Best' },
  'Срывов за 30 дней': { uk: 'Зривів за 30 днів', en: 'Slips in 30 days' },
  'Чистых дней': { uk: 'Чистих днів', en: 'Clean days' },
}
