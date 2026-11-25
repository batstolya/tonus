# New metrics in AI chat, anomaly guard and biweekly report — design

Status: requested by owner 2026-11-25 ("делай"), small change.

## Intent

The 18 newer metrics (PR #258: breathing disturbances, time in daylight; PR #259:
15 catalog metrics; this change: walking steadiness, ZIP import only) are stored and shown, but the AI chat, the anomaly guard and
the biweekly Telegram report do not see them.

## Decisions (builder's calls)

- `supabase/functions/_shared/extraMetrics.ts` (pure): the 18 keys, Russian
  labels with units, `summarizeExtraMetrics(rows)` (avg over days with data,
  latest value and date, days count) and `extraMetricsLines()` /
  `compareExtraLines()` text helpers. Labels reuse the catalog labels.
- **AI context** (`healthContext.ts`): one extra `metrics_daily` query for the
  18 keys over the context window; new section "ДОПОЛНИТЕЛЬНЫЕ ПОКАЗАТЕЛИ".
- **Chat tool** `get_metrics_range`: rows and `summary.averages` also carry the
  18 keys (merged from `metrics_daily`); description lists them. No new tool, so
  the tool-name list and SYSTEM_PROMPT stay unchanged.
- **Anomaly guard** (`anomaly.ts`): `breathing` joins with bad direction "up"
  and an absolute floor of +1 event/hour over baseline (near-zero medians make
  z alone trigger on noise). `ingest-health` loads `breathingDisturbances`.
- **Biweekly report**: both periods load the 18 keys; a code-computed block
  "current vs previous" goes into the prompt (the model never compares itself).
- Deploy: ingest-health (`--no-verify-jwt`), chat-health, telegram-bot (imports
  healthContext), biweekly-report, plus any other importer of the touched
  `_shared` modules.

## Non-goals

Correlations beyond `sunlight`, low HR events / ECG (separate change).

## Added during the change

- Walking steadiness: Health Auto Export does not offer it, so the catalog entry
  has no `hae` name; weekly fraction × 100; metrics screen + doctor report.
- Review fixes: chat-tool values rounded to each metric's digits, explicit
  order + limit on the extra query, steadiness in the tool description, day
  counts in the biweekly comparison lines.
