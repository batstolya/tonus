import { describe, expect, it } from 'vitest'
import { ingestStatus } from './ingestStatus.ts'

describe('ingestStatus', () => {
  it('counts heart events and reports their upsert error', () => {
    const s = ingestStatus({ metrics: 25, sleep: 2, hearts: 3, mode: 'live', mErr: null, sErr: null, hErr: 'boom' })
    expect(s.status).toBe('metrics:25 sleep:2 hearts:3 mode:live hErr:boom')
    expect(s.freshData).toBe(true)
  })

  it('does not treat an ECG/notification-only payload as fresh health data', () => {
    // A live ECG automation must not mask a dead metrics automation.
    expect(ingestStatus({ metrics: 0, sleep: 0, hearts: 2, mode: 'live', mErr: null, sErr: null, hErr: null }).freshData).toBe(false)
  })
})
