import { test, expect } from '@playwright/test'

// Гард витрины: гайд подключения открывается из настроек в демо и доводит
// до успешной «проверки связи». Если он сломан — новый пользователь
// не сможет подключить часы.

test('connect guide walks from settings to verify success in demo', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('tonus_demo', '1'))
  await page.goto('/#settings')
  await page.reload()

  await page
    .getByRole('button', { name: /Как подключить устройство|Як підключити пристрій|How to connect a device/i })
    .click()

  const overlay = page.locator('.guide-overlay')
  await expect(overlay).toBeVisible()

  // шаг 1 — выбор устройства (переиспользованный DeviceSelectScreen);
  // селектор скоупим на оверлей: в настройках есть свои кнопки «Apple Watch»
  await overlay.locator('.device-card', { hasText: 'Apple Watch' }).click()

  // шаг 2 — «что произойдёт»
  await expect(
    overlay.getByText(/Данные будут приходить сами|Дані надходитимуть самі|Your data will arrive on its own/),
  ).toBeVisible()

  const next = overlay.getByRole('button', { name: /^(Далее|Далі|Next)$/ })
  await next.click() // install
  await expect(overlay.getByText(/Health Auto Export/).first()).toBeVisible()
  await next.click() // automation
  await next.click() // webhook
  await next.click() // schedule
  await next.click() // verify

  // в демо проверка связи сразу успешна
  await expect(
    overlay.getByText(/Данные пришли!|Дані надійшли!|Data received!/),
  ).toBeVisible()

  // «Пропустить» закрывает оверлей
  await overlay.getByRole('button', { name: /Пропустить|Пропустити|Skip/i }).click()
  await expect(overlay).toBeHidden()
})

test('xiaomi branch asks about phone and shows Mi Fitness path on iPhone', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('tonus_demo', '1'))
  await page.goto('/#settings')
  await page.reload()

  await page
    .getByRole('button', { name: /Как подключить устройство|Як підключити пристрій|How to connect a device/i })
    .click()

  const overlay = page.locator('.guide-overlay')
  await overlay.locator('.device-card', { hasText: /Xiaomi/ }).click()

  const next = overlay.getByRole('button', { name: /^(Далее|Далі|Next)$/ })
  await next.click() // explain → phone

  await expect(
    overlay.getByText(/Какой у тебя телефон\?|Який у тебе телефон\?|What phone do you have\?/),
  ).toBeVisible()

  await overlay.locator('.device-card', { hasText: 'iPhone' }).click()

  // ветка Mi Fitness → Apple Health
  await expect(
    overlay.getByText(/Включи синк с Apple Health|Увімкни синхронізацію з Apple Health|Enable Apple Health sync/),
  ).toBeVisible()
})
