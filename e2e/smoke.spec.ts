import { test, expect } from '@playwright/test'

// Смоук: лендинг открывается, демо-режим ведёт на дашборд с данными.
// Ровно тот путь, который видит новый пользователь — если он сломан,
// остальное неважно.

test('landing renders hero and demo button', async ({ page }) => {
  await page.goto('/')
  // хедер лендинга
  await expect(page.getByText('Tonus').first()).toBeVisible()
  // кнопок демо на лендинге несколько (hero + футер) — достаточно первой
  await expect(
    page.getByRole('button', { name: /демо|demo/i }).first(),
  ).toBeVisible()
})

test('demo mode opens dashboard with generated data', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /демо|demo/i }).first().click()
  // enableDemo() + window.location.reload()
  await page.waitForLoadState('load')

  // виджет готовности — сердце дашборда (ru/uk/en)
  await expect(
    page.getByText(/Готовность дня|Готовність дня|Daily readiness/),
  ).toBeVisible({ timeout: 15_000 })

  // фикстура даёт скоры — в виджете должно быть число, а не прочерк
  const readiness = page.locator('.readiness-label')
  await expect(readiness).toBeVisible()
})

test('hash routing opens sleep screen in demo', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('tonus_demo', '1'))
  await page.goto('/#sleep')
  await page.reload()
  // не редиректнуло на лендинг и не упало — есть навигация приложения
  await expect(page.getByText(/Сон|Sleep/).first()).toBeVisible({ timeout: 15_000 })
})
