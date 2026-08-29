// Inline keyboards for the bot. Pure object literals — safe to import from
// vitest-run tests (no Deno globals here).

export const MAIN_MENU = {
  inline_keyboard: [
    [{ text: '📊 Отчёт за 2 недели', callback_data: 'report' }, { text: '📈 Статус сегодня', callback_data: 'status' }],
    [{ text: '💊 Препараты', callback_data: 'supplements' }, { text: '🚫 Привычки', callback_data: 'habits' }],
    [{ text: '🎯 Цели', callback_data: 'goals' }],
    [{ text: '⚽ Матчи ЧМ-2026', callback_data: 'fb_matches' }],
    [{ text: '🧪 Предложи эксперимент', callback_data: 'exp_suggest' }],
    [{ text: '⚙️ Настройки', callback_data: 'settings' }],
  ],
}

// One row per active habit — no daily ping, this menu is the only entry
// point: the user opens it themselves when a slip happens (/срыв, /break,
// or the "Привычки" button).
export function HABITS_MENU(habits: { id: string; name: string; streak: number }[]) {
  return {
    inline_keyboard: [
      ...habits.map(h => [{ text: `${h.name} · ${h.streak} дн`, callback_data: `hb:${h.id}` }]),
      [{ text: '🏠 Главное меню', callback_data: 'menu' }],
    ],
  }
}

// Per-habit day picker opened by hb:<id> — mark or clear today/yesterday.
export function HABIT_DAY_MENU(habitId: string) {
  return {
    inline_keyboard: [
      [{ text: '💥 Срыв сегодня', callback_data: `hb:${habitId}:0` }, { text: '💥 Срыв вчера', callback_data: `hb:${habitId}:1` }],
      [{ text: '✅ Снять сегодня', callback_data: `hbx:${habitId}:0` }, { text: '✅ Снять вчера', callback_data: `hbx:${habitId}:1` }],
      [{ text: '🚫 К привычкам', callback_data: 'habits' }],
    ],
  }
}

export const REPORT_ACTIONS = {
  inline_keyboard: [
    [{ text: '🔄 Обновить отчёт', callback_data: 'report' }, { text: '📈 Статус сегодня', callback_data: 'status' }],
    [{ text: '🏠 Главное меню', callback_data: 'menu' }],
  ],
}

export const STATUS_ACTIONS = {
  inline_keyboard: [
    [{ text: '📊 Полный отчёт', callback_data: 'report' }],
    [{ text: '🏠 Главное меню', callback_data: 'menu' }],
  ],
}

export const BACK_MENU = {
  inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'menu' }]],
}

export const FOOTBALL_MENU = {
  inline_keyboard: [
    [{ text: '📅 Ближайшие матчи', callback_data: 'fb_matches' }],
    [{ text: '🔔 Включить напоминания', callback_data: 'fb_on' }, { text: '🔕 Выключить напоминания', callback_data: 'fb_off' }],
    [{ text: '🏠 Главное меню', callback_data: 'menu' }],
  ],
}
