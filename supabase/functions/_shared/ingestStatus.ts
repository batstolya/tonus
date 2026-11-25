// Status line and freshness decision for one ingest-health request.
// Spec: docs/superpowers/specs/2026-11-25-heart-events-ecg-design.md
//
// ingest_tokens.last_ingest_at is the freshness signal for the staleness
// banner, the bot's /sync and the biweekly report. Only payloads that carry
// health metrics or sleep may move it: a still-running ECG or notification
// automation must not mask a dead metrics automation.

export interface IngestCounts {
  metrics: number
  sleep: number
  hearts: number
  mode: string
  mErr: string | null
  sErr: string | null
  hErr: string | null
}

export function ingestStatus(c: IngestCounts): { status: string; freshData: boolean } {
  const status = `metrics:${c.metrics} sleep:${c.sleep} hearts:${c.hearts} mode:${c.mode}`
    + (c.mErr ? ` mErr:${c.mErr}` : '')
    + (c.sErr ? ` sErr:${c.sErr}` : '')
    + (c.hErr ? ` hErr:${c.hErr}` : '')
  return { status, freshData: c.metrics > 0 || c.sleep > 0 }
}
