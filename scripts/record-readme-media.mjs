// Build a production preview first, then run:
//   npm run preview -- --port 4173 --strictPort
//   npm run media:readme
//
// The recorder uses only deterministic landing/demo data. GIFs are encoded with
// one palette per scenario to avoid the flicker caused by per-frame palettes.

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { encodeGif, validateScenarioMeta } from './readme-media-lib.mjs'

const BASE = 'http://localhost:4173'
const OUT = 'docs/media'
const WIDTH = 960
const HEIGHT = 600
const FRAME_MS = 100

fs.mkdirSync(OUT, { recursive: true })

async function captureFor(page, frames, durationMs) {
  const count = Math.round(durationMs / FRAME_MS)
  for (let i = 0; i < count; i += 1) {
    frames.push(await page.screenshot({ type: 'png', animations: 'allow' }))
    await page.waitForTimeout(FRAME_MS)
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

async function openDemoView(page, hash, readyText) {
  await page.goto(`${BASE}/#${hash}`)
  await page.getByText(readyText, { exact: false }).first().waitFor({ timeout: 15_000 })
  await page.waitForTimeout(350)
}

async function centerInViewport(locator) {
  await locator.evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'center' }))
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
    durationMs: 6500,
    flow: async (page, frames) => {
      await enableDemo(page)
      await installCursor(page)
      await captureFor(page, frames, 2200)
      await clickWithCursor(page, page.getByRole('button', { name: 'Streak' }))
      await captureFor(page, frames, 3000)
      await clickWithCursor(page, page.locator('.streak-menu-close'))
      await captureFor(page, frames, 1300)
    },
  },
  {
    name: 'ask-your-data',
    durationMs: 7000,
    flow: async (page, frames) => {
      await page.goto(BASE)
      const block = page.locator('.chat-stage')
      await block.waitFor({ timeout: 15_000 })
      await centerInViewport(block)
      await page.waitForTimeout(300)
      await installCursor(page)
      await captureFor(page, frames, 7000)
    },
  },
  {
    name: 'pattern-to-experiment',
    durationMs: 7500,
    flow: async (page, frames) => {
      await enableDemo(page)
      await openDemoView(page, 'insights', 'Insights and trends')
      const correlations = page.getByText('Patterns in your data')
      await centerInViewport(correlations)
      await installCursor(page)
      await captureFor(page, frames, 3300)
      await clickWithCursor(page, page.getByRole('button', { name: 'Experiments' }))
      const experiment = page.locator('.expc')
        .filter({ hasText: 'Отказ от кофе после 16:00' })
      await experiment.waitFor({ timeout: 15_000 })
      await centerInViewport(experiment)
      await pointAt(page, experiment.locator('.expc-stats'))
      await captureFor(page, frames, 4200)
    },
  },
  {
    name: 'health-timeline',
    durationMs: 6500,
    flow: async (page, frames) => {
      await page.goto(BASE)
      const block = page.locator('.tg-grid')
      await block.waitFor({ timeout: 15_000 })
      await centerInViewport(block)
      await page.waitForTimeout(300)
      await installCursor(page)
      await captureFor(page, frames, 6500)
    },
  },
]

async function encodeScenario(page, scenario) {
  const frames = []
  await scenario.flow(page, frames)
  const result = await encodeGif(frames, `${OUT}/${scenario.name}.gif`, {
    delay: FRAME_MS,
    colors: 160,
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

  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
    await preparePage(page)
    await encodeScenario(page, scenario)
    await page.close()
  }
} finally {
  await browser.close()
}

console.log('README media complete')
