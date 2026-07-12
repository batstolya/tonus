// Normally run through `npm run media:readme`; the orchestration script builds
// a preview, passes a free local port here, records the media and tears down the
// preview. For an already-running preview, set README_MEDIA_PORT explicitly.
//
// The recorder uses only deterministic landing/demo data. GIFs are encoded with
// one palette per scenario to avoid the flicker caused by per-frame palettes.

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { encodeGif, validateScenarioMeta } from './readme-media-lib.mjs'

const PORT = Number(process.env.README_MEDIA_PORT ?? 4173)
const BASE = `http://localhost:${PORT}`
const OUT = 'docs/media'
const WIDTH = 960
const HEIGHT = 600
const CAPTURE_MS = 125
const GIF_DELAY_MS = 120

fs.mkdirSync(OUT, { recursive: true })

async function captureFor(page, frames, durationMs) {
  const count = Math.round(durationMs / CAPTURE_MS)
  for (let i = 0; i < count; i += 1) {
    frames.push(await page.screenshot({ type: 'png', animations: 'allow' }))
    await page.waitForTimeout(CAPTURE_MS)
  }
}

async function preparePage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'en')
    localStorage.setItem('theme', 'light')
  })
}

async function enableDemo(page) {
  await page.addInitScript(() => localStorage.setItem('tonus_demo', '1'))
  await page.goto(`${BASE}/#dashboard`)
  await page.reload()
  await page.getByText('Daily readiness').waitFor({ timeout: 15_000 })
  await page.waitForTimeout(500)
}

async function centerInViewport(locator) {
  await locator.evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'center' }))
}

async function simplifyLandingBackdrop(page) {
  await page.addStyleTag({
    content: '.lp-bg{display:none!important}.landing{background:#f7f8fc!important}',
  })
}

async function localizeDemoExperimentCards(page) {
  await page.evaluate(() => {
    const copy = new Map([
      ['Прогулка 30 минут после ужина улучшит глубокий сон', 'A 30-minute walk after dinner improves deep sleep'],
      ['Гуляю 21:00–21:30 каждый день', 'Walk from 9:00 to 9:30 pm every day'],
      ['Магний за час до сна увеличит REM-фазу', 'Magnesium one hour before bed increases REM sleep'],
      ['Принимаю магний в 22:00', 'Take magnesium at 10:00 pm'],
      ['Отказ от кофе после 16:00 улучшит качество сна', 'No coffee after 4 pm improves sleep quality'],
      ['Последняя чашка кофе до 16:00', 'Last coffee before 4 pm'],
      ['Ранний отбой поднимет HRV на следующий день', 'Earlier bedtime raises next-day HRV'],
      ['Ложусь до 23:00', 'In bed before 11 pm'],
      ['Дыхательные практики поднимут SpO₂ во сне', 'Breathing practice raises sleep SpO₂'],
      ['Дыхательная гимнастика перед сном', 'Breathing practice before bed'],
    ])
    for (const element of document.querySelectorAll('.expc-title, .expc-rule')) {
      const translated = copy.get(element.textContent?.trim() ?? '')
      if (translated) element.textContent = translated
    }
  })
}

async function installCursor(page) {
  await page.evaluate(() => {
    document.getElementById('readme-cursor')?.remove()
    const cursor = document.createElement('div')
    cursor.id = 'readme-cursor'
    Object.assign(cursor.style, {
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      border: '2px solid rgba(17, 23, 53, .9)',
      background: 'rgba(255, 255, 255, .96)',
      boxShadow: '0 3px 10px rgba(17, 23, 53, .28)',
      position: 'fixed',
      left: '0',
      top: '0',
      transform: 'translate(-40px, -40px)',
      transition: 'transform 220ms cubic-bezier(.2,.8,.2,1), box-shadow 140ms ease',
      pointerEvents: 'none',
      zIndex: '2147483647',
    })
    document.body.append(cursor)
  })
}

async function pointAt(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error('Cannot position cursor over a hidden element')
  const x = box.x + box.width / 2 - 9
  const y = box.y + box.height / 2 - 9
  await page.evaluate(({ x, y }) => {
    const cursor = document.getElementById('readme-cursor')
    if (!cursor) throw new Error('README cursor is not installed')
    cursor.style.transform = `translate(${x}px, ${y}px)`
  }, { x, y })
  await page.waitForTimeout(260)
}

async function clickWithCursor(page, locator) {
  await pointAt(page, locator)
  await page.evaluate(() => {
    const cursor = document.getElementById('readme-cursor')
    if (cursor) cursor.style.boxShadow = '0 0 0 7px rgba(79, 209, 181, .32)'
  })
  await locator.click()
  await page.waitForTimeout(160)
  await page.evaluate(() => {
    const cursor = document.getElementById('readme-cursor')
    if (cursor) cursor.style.boxShadow = '0 3px 10px rgba(17, 23, 53, .28)'
  })
  await page.waitForTimeout(190)
}

const scenarios = [
  {
    name: 'daily-signal',
    flow: async (page, frames) => {
      await enableDemo(page)
      await installCursor(page)
      await captureFor(page, frames, 2200)
      await clickWithCursor(page, page.getByRole('button', { name: 'Streak' }))
      await captureFor(page, frames, 3000)
      await clickWithCursor(page, page.locator('.streak-menu-close'))
      await captureFor(page, frames, 1000)
    },
  },
  {
    name: 'ask-your-data',
    flow: async (page, frames) => {
      await page.goto(BASE)
      await simplifyLandingBackdrop(page)
      const block = page.locator('.chat-stage')
      await block.waitFor({ timeout: 15_000 })
      await centerInViewport(block)
      await page.waitForTimeout(300)
      await installCursor(page)
      await captureFor(page, frames, 6500)
    },
  },
  {
    name: 'pattern-to-experiment',
    colors: 40,
    flow: async (page, frames) => {
      await enableDemo(page)
      await page.getByRole('button', { name: 'Coach', exact: true }).click()
      await page.getByText('Insights & trends', { exact: false }).first().waitFor({ timeout: 15_000 })
      await page.waitForTimeout(350)
      const correlations = page.getByText('Patterns in your data')
      await centerInViewport(correlations)
      await installCursor(page)
      await captureFor(page, frames, 2750)
      await clickWithCursor(page, page.getByRole('button', { name: 'Experiments' }))
      await localizeDemoExperimentCards(page)
      const experiment = page.locator('.expc')
        .filter({ hasText: 'No coffee after 4 pm' })
      await experiment.waitFor({ timeout: 15_000 })
      await centerInViewport(experiment)
      await pointAt(page, experiment.locator('.expc-stats'))
      await captureFor(page, frames, 3500)
    },
  },
  {
    name: 'health-timeline',
    flow: async (page, frames) => {
      await page.goto(BASE)
      await simplifyLandingBackdrop(page)
      const block = page.locator('.tg-grid')
      await block.waitFor({ timeout: 15_000 })
      await centerInViewport(block)
      await page.waitForTimeout(900)
      await installCursor(page)
      await captureFor(page, frames, 6500)
    },
  },
]

const selectedScenarios = process.env.README_SCENARIO
  ? scenarios.filter(scenario => scenario.name === process.env.README_SCENARIO)
  : scenarios

if (!selectedScenarios.length) {
  throw new Error(`Unknown README_SCENARIO: ${process.env.README_SCENARIO}`)
}

async function encodeScenario(page, scenario) {
  const frames = []
  await scenario.flow(page, frames)
  const result = await encodeGif(frames, `${OUT}/${scenario.name}.gif`, {
    delay: GIF_DELAY_MS,
    colors: scenario.colors ?? 64,
    maxPalettePixels: 750_000,
  })
  const meta = {
    name: scenario.name,
    ...result,
    bytes: result.bytes.length,
  }
  const errors = validateScenarioMeta(meta)
  const sizeMb = (meta.bytes / 1_000_000).toFixed(2)
  console.log(`✓ ${scenario.name}.gif · ${meta.frames} frames · ${meta.durationMs / 1000}s · ${sizeMb} MB`)
  if (errors.length) throw new Error(errors.join('\n'))
}

const browser = await chromium.launch()
try {
  const hero = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
  await preparePage(hero)
  await hero.goto(BASE)
  await hero.locator('.landing-hero').waitFor({ timeout: 15_000 })
  await hero.evaluate(() => document.fonts.ready)
  await hero.waitForTimeout(700)
  await hero.screenshot({ path: `${OUT}/landing-hero.png`, type: 'png' })
  await hero.close()

  for (const scenario of selectedScenarios) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
    await preparePage(page)
    await encodeScenario(page, scenario)
    await page.close()
  }
} finally {
  await browser.close()
}

console.log('README media complete')
