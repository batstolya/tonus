// Backfill selected metrics into metrics_daily by re-parsing the ingest_raw
// archive with the production HAE parser. Used when the parser learns a metric
// that Health Auto Export was already sending (the raw payloads kept it).
//
// Run (Node 24 strips the types itself):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/backfill-hae-metrics.ts [--metrics breathingDisturbances,daylightMinutes | --metrics catalog] [--dry-run]
//
// Rows are read one at a time: a single payload can be several MB, and bulk
// selects of ingest_raw fail at the gateway (HTTP 520).
// Merge per (user_id, date, metric): sums keep the max across payloads (HAE
// re-sends a growing day; parity with the parser's max-across-sources rule),
// averages keep the latest payload's value.
import { createClient } from '@supabase/supabase-js'
import { isSumMetric, parseHAE, type HaePayload, type MetricRow } from '../supabase/functions/_shared/hae.ts'
import { METRIC_CATALOG } from '../supabase/functions/_shared/metricCatalog.ts'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
// `--metrics catalog` = every catalog metric (docs/superpowers/specs/2026-11-25-metric-catalog-design.md)
const metricsArg = arg('metrics') ?? 'breathingDisturbances,daylightMinutes'
const metrics = new Set(metricsArg === 'catalog' ? METRIC_CATALOG.map(e => e.key) : metricsArg.split(','))
const dryRun = process.argv.includes('--dry-run')

if (!url || !key) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-hae-metrics.ts [--metrics a,b] [--dry-run]')
  process.exit(1)
}

const supabase = createClient(url, key)

// Page ids first (small), then fetch each payload alone, with retries.
const ids: string[] = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('ingest_raw').select('id').order('received_at').order('id').range(from, from + 999)
  if (error) { console.error(`ingest_raw id page failed: ${error.message}`); process.exit(1) }
  ids.push(...data.map(r => r.id as string))
  if (data.length < 1000) break
}

const merged = new Map<string, MetricRow>()
let failed = 0
for (const [n, id] of ids.entries()) {
  let row: { user_id: string; payload: HaePayload } | null = null
  for (let attempt = 0; attempt < 3 && !row; attempt++) {
    const { data } = await supabase.from('ingest_raw').select('user_id, payload').eq('id', id).maybeSingle()
    row = data
  }
  if (!row) { failed++; continue }
  for (const m of parseHAE(row.user_id, row.payload).metrics) {
    if (!metrics.has(m.metric)) continue
    const k = `${m.user_id}|${m.date}|${m.metric}`
    const prev = merged.get(k)
    if (isSumMetric(m.metric) && prev && (prev.sum_val ?? 0) >= (m.sum_val ?? 0)) continue
    merged.set(k, m)
  }
  if ((n + 1) % 100 === 0) console.error(`… ${n + 1}/${ids.length} payloads`)
}

const rows = [...merged.values()]
for (const metric of metrics) {
  const dates = rows.filter(r => r.metric === metric).map(r => r.date).sort()
  console.log(`${metric}: ${dates.length} day-rows${dates.length ? ` (${dates[0]} … ${dates.at(-1)})` : ''}`)
}
console.log(`payloads: ${ids.length}, unreadable: ${failed}`)

if (dryRun) process.exit(0)

for (let i = 0; i < rows.length; i += 500) {
  const { error } = await supabase.from('metrics_daily').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,date,metric' })
  if (error) { console.error(`upsert failed at ${i}: ${error.message}`); process.exit(1) }
}
console.log(`upserted ${rows.length} rows`)
