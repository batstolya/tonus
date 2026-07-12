import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectGif } from './readme-media-lib.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const documents = [
  {
    name: 'English',
    file: 'README.md',
    headings: [
      'See Tonus in action',
      'What Tonus connects',
      'What Tonus can do',
      'How it works',
      'Privacy and safety',
      'Engineering',
      'Run locally',
      'Repository map',
      'Documentation',
      'Personal extensions',
    ],
  },
  {
    name: 'Ukrainian',
    file: 'README.uk.md',
    headings: [
      'Подивіться Tonus у дії',
      'Що об’єднує Tonus',
      'Що вміє Tonus',
      'Як це працює',
      'Приватність і безпека',
      'Інженерна частина',
      'Локальний запуск',
      'Структура репозиторію',
      'Документація',
      'Особисті розширення',
    ],
  },
]

const requiredMedia = [
  'landing-hero.png',
  'daily-signal.gif',
  'ask-your-data.gif',
  'pattern-to-experiment.gif',
  'health-timeline.gif',
  'architecture.svg',
]
const retiredMedia = ['landing-tour.gif', 'app-demo.gif', 'dashboard.png']
const errors = []
const gifMeta = new Map()

function isLocal(target) {
  return !/^(?:[a-z]+:|#|\/\/)/i.test(target)
}

function cleanTarget(raw) {
  const target = raw.trim().replace(/^<|>$/g, '').split(/\s+["']/)[0]
  return decodeURIComponent(target.split(/[?#]/)[0])
}

function checkDocument(document) {
  const absolute = path.join(ROOT, document.file)
  if (!fs.existsSync(absolute)) {
    errors.push(`${document.file}: file is missing`)
    return
  }

  const source = fs.readFileSync(absolute, 'utf8')
  const headings = [...source.matchAll(/^##\s+(.+)$/gm)].map(match => match[1].trim())
  if (JSON.stringify(headings) !== JSON.stringify(document.headings)) {
    errors.push(`${document.file}: expected headings ${JSON.stringify(document.headings)}, got ${JSON.stringify(headings)}`)
  }

  for (const match of source.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    if (!match[1].trim()) errors.push(`${document.file}: Markdown image has empty alt text (${match[2]})`)
  }
  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    const alt = match[0].match(/\balt=["']([^"']*)["']/i)?.[1]
    if (!alt?.trim()) errors.push(`${document.file}: HTML image has empty alt text (${match[0]})`)
  }

  const targets = [
    ...[...source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]),
    ...[...source.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map(match => match[1]),
  ].map(cleanTarget)

  for (const target of new Set(targets.filter(isLocal))) {
    const resolved = path.resolve(path.dirname(absolute), target)
    if (!fs.existsSync(resolved)) errors.push(`${document.file}: local target is missing: ${target}`)
  }

  for (const media of requiredMedia) {
    if (!source.includes(media)) errors.push(`${document.file}: required media is not referenced: ${media}`)
  }
  for (const media of retiredMedia) {
    if (source.includes(media)) errors.push(`${document.file}: retired media is still referenced: ${media}`)
  }

  return { headingCount: headings.length, localTargetCount: targets.filter(isLocal).length }
}

const summaries = documents.map(document => ({ document, result: checkDocument(document) }))

for (const gif of requiredMedia.filter(name => name.endsWith('.gif'))) {
  const absolute = path.join(ROOT, 'docs/media', gif)
  if (!fs.existsSync(absolute)) continue
  const bytes = fs.statSync(absolute).size
  const meta = inspectGif(fs.readFileSync(absolute))
  gifMeta.set(gif, { ...meta, bytes })
  if (meta.width !== 960 || meta.height !== 600) errors.push(`${gif}: expected 960x600, got ${meta.width}x${meta.height}`)
  if (meta.durationMs < 6000 || meta.durationMs > 8000) errors.push(`${gif}: expected 6–8 seconds, got ${(meta.durationMs / 1000).toFixed(2)} seconds`)
  if (meta.fps < 8 || meta.fps > 10) errors.push(`${gif}: expected 8–10 fps, got ${meta.fps.toFixed(2)} fps`)
  if (!meta.hasGlobalPalette || meta.hasLocalPalettes) errors.push(`${gif}: expected one shared global palette`)
  if (bytes > 1_500_000) errors.push(`${gif}: exceeds the 1.5 MB target (${(bytes / 1_000_000).toFixed(2)} MB)`)
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`)
  process.exit(1)
}

for (const { document, result } of summaries) {
  console.log(`✓ ${document.name}: ${result.headingCount} sections · ${result.localTargetCount} local targets`)
}
for (const gif of requiredMedia.filter(name => name.endsWith('.gif'))) {
  const meta = gifMeta.get(gif)
  console.log(`✓ ${gif}: ${meta.width}x${meta.height} · ${(meta.durationMs / 1000).toFixed(2)}s · ${meta.fps.toFixed(2)} fps · ${(meta.bytes / 1_000_000).toFixed(2)} MB`)
}
