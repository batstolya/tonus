import { test, expect } from '@playwright/test'

// The sidebar layout is selected by a CSS breakpoint, so jsdom cannot prove the
// parts that matter most: that only one navigation shows at a given width, that
// the collapsed strip's flyout escapes its 60px column, and that the switch
// takes effect without a reload. A real browser can.
async function openDemo(page: import('@playwright/test').Page, hash: string) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('tonus_demo', '1')
    localStorage.setItem('lang', 'uk')
  })
  await page.goto(`/${hash}`)
  await page.reload()
}

test('the top navigation stays the default', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openDemo(page, '#dashboard')
  await expect(page.locator('.topbar-nav')).toBeVisible()
  await expect(page.locator('.sidebar')).toHaveCount(0)
})

test('the settings switch turns the sidebar on without a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openDemo(page, '#settings')
  await page.getByRole('button', { name: 'Збоку' }).click()

  await expect(page.locator('.sidebar')).toBeVisible()
  await expect(page.locator('.topbar-nav')).toHaveCount(0)
  // The sidebar owns the sub-views in this layout.
  await expect(page.locator('.subnav')).toBeHidden()

  // Every sub-view is reachable in one click while expanded.
  await page.locator('.sidebar-btn', { hasText: 'Сон' }).click()
  await expect(page.locator('.sidebar-btn.active', { hasText: 'Сон' })).toBeVisible()
})

test('the collapsed strip keeps every sub-view reachable through its flyout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('tonus_demo', '1')
    localStorage.setItem('lang', 'uk')
    localStorage.setItem('navLayout', 'side')
    localStorage.setItem('navCollapsed', '1')
  })
  await page.goto('/#sleep')
  await page.reload()

  const strip = page.locator('.sidebar--collapsed')
  await expect(strip).toBeVisible()
  expect(await strip.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(60)

  // The flyout must escape the strip rather than being clipped by its
  // scroll container: hidden until hover, then extending well past 60px.
  const group = page.locator('.sidebar-group').first()
  const flyout = group.locator('.sidebar-flyout')
  await expect(flyout).toBeHidden()
  await group.locator('.sidebar-icon-btn').hover()
  await expect(flyout).toBeVisible()
  const box = await flyout.evaluate(el => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right }
  })
  expect(box.left).toBeGreaterThanOrEqual(50)
  expect(box.right).toBeGreaterThan(180)

  await flyout.locator('.sidebar-btn', { hasText: 'Пульс' }).click()
  await expect(page.locator('.sidebar-icon-btn.active')).toHaveCount(1)
})

test('narrow screens keep the mobile navigation even with the side layout stored', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('tonus_demo', '1')
    localStorage.setItem('lang', 'uk')
    localStorage.setItem('navLayout', 'side')
  })
  // A screen inside a group, so the sub-nav row has something to render.
  await page.goto('/#sleep')
  await page.reload()

  await expect(page.locator('.bottom-nav')).toBeVisible()
  await expect(page.locator('.subnav')).toBeVisible()
  await expect(page.locator('.logo-btn')).toBeVisible()
  await expect(page.locator('.sidebar')).toBeHidden()
  const padding = await page.evaluate(() => getComputedStyle(document.querySelector('.app')!).paddingLeft)
  expect(padding).toBe('0px')
})
