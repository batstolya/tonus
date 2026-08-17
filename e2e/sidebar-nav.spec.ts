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

test('the collapsed strip hands the sub-views to the top row', async ({ page }) => {
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

  // The strip carries icons only — no flyout anywhere, and hovering a group
  // icon reveals nothing. Sub-views live in the top row, the same on a mouse
  // and on a touch screen.
  await expect(page.locator('.sidebar-flyout')).toHaveCount(0)
  const group = page.locator('.sidebar-group').first()
  await expect(group.locator('.sidebar-btn')).toHaveCount(0)
  await group.locator('.sidebar-icon-btn').hover()
  await expect(group.locator('.sidebar-btn')).toHaveCount(0)

  const subnav = page.locator('.subnav')
  await expect(subnav).toBeVisible()
  await subnav.locator('.subnav-btn', { hasText: 'Пульс' }).click()
  await expect(subnav.locator('.subnav-btn.active', { hasText: 'Пульс' })).toBeVisible()
  await expect(page.locator('.sidebar-icon-btn.active')).toHaveCount(1)
})

test('the expanded sidebar separates each section with a rule', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('tonus_demo', '1')
    localStorage.setItem('lang', 'uk')
    localStorage.setItem('navLayout', 'side')
  })
  await page.goto('/#sleep')
  await page.reload()

  const groups = page.locator('.sidebar-group')
  await expect(groups).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    const width = await groups.nth(i).evaluate(el => getComputedStyle(el).borderBottomWidth)
    expect(width).toBe('1px')
  }
  // The first section's top rule is what separates it from Dashboard.
  const topRule = await groups.first().evaluate(el => getComputedStyle(el).borderTopWidth)
  expect(topRule).toBe('1px')
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
