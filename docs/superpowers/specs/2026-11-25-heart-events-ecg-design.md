# Heart-rate notifications and ECG in Tonus — design

Status: requested by owner 2026-11-25 ("делай"). Small change with one migration.

## Intent

The owner's Apple Watch raised 44 low-heart-rate notifications and has 4 ECG
recordings in Apple Health; none reach Tonus. The doctor report should show them.

## Source

Health Auto Export sends them only through separate automations (one data type
each): `data.heartRateNotifications[]` and `data.ecg[]` (help.healthyapps.dev,
JSON export format). The owner adds two automations pointing to the existing
ingest URL; history can be sent once with HAE "Export existing data".

- Notification: `heartNotification` (string, e.g. `high_heart_rate_notification`),
  `start`/`end` ("yyyy-MM-dd HH:mm:ss Z"), optional `threshold` (bpm),
  `heartRateData[]` (`qty` bpm), `source` object.
- ECG: `start`/`end`, `classification`, `averageHeartRate`, voltage samples
  (not stored), `source` string.

## Decisions

- Table `heart_events` (migration 20261125120000): kind
  (`high_hr` | `low_hr` | `irregular_rhythm` | `ecg` | `other`), start/end,
  threshold, hr min/max/avg, ECG classification, source; unique
  (user_id, kind, start_ts) so re-sends upsert. RLS own; account deletion covers it.
- Kind mapping is by substring of `heartNotification` (`low` / `high` /
  `irregular`) because HAE documents only the high value; anything else is `other`.
- `_shared/hae.ts` `parseHeartEvents()` (pure, tested); `ingest-health` upserts in
  live mode. Voltage samples are dropped.
- Doctor report: section "Heart events (Apple Watch notifications and ECG)" —
  count per kind and a dated list; ECG with classification and average HR. Both
  renderers. No interpretation, no diagnosis wording.

## Non-goals

ZIP import of these events, AI chat, Telegram alerts, storing ECG waveforms.
