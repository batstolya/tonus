// Записывает медиа для README: GIF-туры (лендинг, демо-приложение) и скриншоты.
// Требует собранный dist и vite preview на 4173:
//   npm run build && npm run preview -- --port 4173 --strictPort &
//   node scripts/record-readme-media.mjs
// Кадры пишутся через Playwright, GIF кодируется gifenc (без ffmpeg).

import { chromium } from '@playwright/test'
import gifenc from 'gifenc'
const { GIFEncoder, quantize, applyPalette } = gifenc
import { PNG } from 'pngjs'
import fs from 'node:fs'

const BASE = 'http://localhost:4173'
const OUT = 'docs/media'
const W = 880
const H = 550

fs.mkdirSync(OUT, { recursive: true })

async function framesToGif(frames, path, delay = 120) {
  const gif = GIFEncoder()
  for (const buf of frames) {
    const png = PNG.sync.read(buf)
    const data = new Uint8ClampedArray(png.data)
    const palette = quantize(data, 256)
    const index = applyPalette(data, palette)
    gif.writeFrame(index, png.width, png.height, { palette, delay })
  }
  gif.finish()
  fs.writeFileSync(path, Buffer.from(gif.bytes()))
  const mb = (fs.statSync(path).size / 1024 / 1024).toFixed(1)
  console.log(`✓ ${path} (${frames.length} кадров, ${mb} MB)`)
}

async function capture(page, frames, ms, step = 200) {
  const n = Math.round(ms / step)
  for (let i = 0; i < n; i++) {
    frames.push(await page.screenshot({ type: 'png' }))
    await page.waitForTimeout(step)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })

// ── GIF 1: лендинг — плавный тур по секциям ──────────────────────────
await page.goto(BASE)
await page.waitForTimeout(800)
const landing = []
await capture(page, landing, 1400)
for (const y of [520, 1040, 1560, 2080, 2600]) {
  await page.evaluate(top => window.scrollTo({ top, behavior: 'smooth' }), y)
  await capture(page, landing, 1200)
}
await framesToGif(landing, `${OUT}/landing-tour.gif`)

// статичный скриншот hero для обложки
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/landing-hero.png` })

// ── GIF 2: демо-приложение — дашборд и экраны ───────────────────────
await page.evaluate(() => localStorage.setItem('tonus_demo', '1'))
await page.goto(`${BASE}/#dashboard`)
await page.reload() // смена хэша не перезагружает страницу — демо включается только с бута
await page.getByText(/Готовность дня|Готовність дня|Daily readiness/).waitFor({ timeout: 15000 })
await page.waitForTimeout(800)
const app = []
await capture(page, app, 2000)
for (const view of ['metrics', 'sleep', 'heart-rate', 'insights']) {
  await page.goto(`${BASE}/#${view}`)
  await capture(page, app, 1800)
}
await framesToGif(app, `${OUT}/app-demo.gif`)

await page.goto(`${BASE}/#dashboard`)
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/dashboard.png` })

await browser.close()
console.log('done')
