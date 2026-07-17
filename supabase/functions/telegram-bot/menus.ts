// Inline keyboards for the bot. Pure object literals — safe to import from
// vitest-run tests (no Deno globals here).

export const MAIN_MENU = {
  inline_keyboard: [
    [{ text: '📊 Отчёт за 2 недели', callback_data: 'report' }, { text: '📈 Статус сегодня', callback_data: 'status' }],
    [{ text: '💊 Препараты', callback_data: 'supplements' }, { text: '🎯 Цели', callback_data: 'goals' }],
    [{ text: '⚽ Матчи ЧМ-2026', callback_data: 'fb_matches' }],
    [{ text: '🧪 Предложи эксперимент', callback_data: 'exp_suggest' }],
    [{ text: '⚙️ Настройки', callback_data: 'settings' }],
  ],
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
