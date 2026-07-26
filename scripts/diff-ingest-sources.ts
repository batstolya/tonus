// Сверка мобильного синка с Health Auto Export по архиву ingest_raw.
//
// Оба отправителя пишут под одним токеном (shadow-режим для параллельного
// прогона не годится: ingest_tokens.user_id — первичный ключ, один токен и один
// режим на юзера). Скрипт разбирает их payload'ы ОДНИМ парсером и печатает
// расхождения по дням и метрикам. Чистая неделя здесь — то, что даёт право
// выключить HAE.
//
// Запуск (Node 24 снимает типы сам, компиляция не нужна):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/diff-ingest-sources.ts --user <uuid> [--since 2026-08-01] [--tolerance 0.02]
//
// Ключ сервис-роли в репозитории не хранится (локально — claude-monitor/.env).
import { createClient } from '@supabase/supabase-js'
// Напрямую из файла, а не через '@tonus/shared': индекс пакета импортирует без
// расширений (это годится для Vite и Metro, но не для голого ESM в Node).
import { MOBILE_SOURCE_PREFIX } from '../packages/shared/src/haePayload.ts'
import { parseHAE, type HaePayload, type MetricRow } from '../supabase/functions/_shared/hae.ts'
import { diffParsedMetrics } from '../supabase/functions/_shared/ingestDiff.ts'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const user = arg('user')
const since = arg('since') ?? new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
const tolerance = Number(arg('tolerance') ?? 0.02)

if (!url || !key || !user) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/diff-ingest-sources.ts --user <uuid> [--since YYYY-MM-DD] [--tolerance 0.02]')
  process.exit(1)
}

const supabase = createClient(url, key)
const { data, error } = await supabase
  .from('ingest_raw')
  .select('payload, created_at')
  .eq('user_id', user)
  .gte('created_at', `${since}T00:00:00Z`)
  .order('created_at')

if (error) {
  console.error(`ingest_raw query failed: ${error.message}`)
  process.exit(1)
}

// Разделяем архив по отправителю: у мобильных точек source = 'Tonus iOS'.
// Сравнение по ПРЕФИКСУ, а не по точному значению: у сумм источник несёт ещё и
// устройство — 'Tonus iOS · iPhone', 'Tonus iOS · Apple Watch'. Устройство там
// не для красоты: сервер суммирует внутри источника и берёт максимум по
// источникам, так что слить iPhone и Watch в одну строку значит потерять день,
// где часы насчитали больше телефона.
function isMobile(payload: HaePayload): boolean {
  const metrics = payload?.data?.metrics ?? payload?.metrics ?? []
  return metrics.some(m => (m.data ?? []).some(p => p.source?.startsWith(MOBILE_SOURCE_PREFIX)))
}

const mobile: MetricRow[] = []
const hae: MetricRow[] = []
for (const row of data ?? []) {
  const payload = row.payload as HaePayload
  const parsed = parseHAE(user, payload).metrics
  ;(isMobile(payload) ? mobile : hae).push(...parsed)
}

console.log(`ingest_raw since ${since}: ${mobile.length} mobile rows, ${hae.length} HAE rows`)
if (mobile.length === 0) {
  console.error('No mobile payloads found — has the phone synced yet?')
  process.exit(1)
}

const diffs = diffParsedMetrics(mobile, hae, { relativeTolerance: tolerance })
if (diffs.length === 0) {
  console.log(`no differences beyond ${(tolerance * 100).toFixed(0)}% — the phone agrees with HAE`)
  process.exit(0)
}

for (const d of diffs) {
  const detail = d.kind === 'value'
    ? `mobile ${d.left} vs HAE ${d.right}`
    : d.kind === 'missing-right' ? `HAE has no value (mobile ${d.left})` : `mobile has no value (HAE ${d.right})`
  console.log(`${d.date}  ${d.metric.padEnd(22)} ${detail}`)
}
console.log(`\n${diffs.length} difference(s). A clean week here is what turns HAE off.`)
process.exit(1)
