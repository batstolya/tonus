import { describe, it, expect } from 'vitest'
import { buildBellItems, parseAlertMessage } from './notifications'
import type { DailyMetrics } from '../types'

// Активный день по новой механике — шаги выше порога.
function day(date: string, steps = 12000): DailyMetrics {
  return { date, steps }
}

const TODAY = new Date('2026-07-10T18:00:00')

describe('buildBellItems', () => {
  it('returns nothing when today is closed and data is fresh', () => {
    const daily = [day('2026-07-08'), day('2026-07-09'), day('2026-07-10')]
    expect(buildBellItems(daily, TODAY)).toEqual([])
  })

  it('warns about the streak when today is below the threshold', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) => day(`2026-07-0${i + 3}`)),
      { date: '2026-07-10', steps: 4200, exerciseMinutes: 12 },
    ]
    const items = buildBellItems(daily, TODAY)
    const risk = items.find(i => i.kind === 'streak-risk')
    expect(risk).toBeTruthy()
    if (risk?.kind === 'streak-risk') {
      expect(risk.streak).toBe(7)
      expect(risk.steps).toBe(4200)
      expect(risk.exercise).toBe(12)
      expect(risk.freezes).toBe(1) // 7 дней стрика = 1 заморозка
      expect(risk.id).toBe('streak-risk:2026-07-10')
    }
  })

  it('does not warn when there is no streak to lose', () => {
    const daily = [{ date: '2026-07-10', steps: 100 }]
    expect(buildBellItems(daily, TODAY).some(i => i.kind === 'streak-risk')).toBe(false)
  })

  it('reports stale sync when the last data day is 2+ days ago', () => {
    const daily = [day('2026-07-07'), day('2026-07-08')]
    const items = buildBellItems(daily, TODAY)
    const stale = items.find(i => i.kind === 'stale-sync')
    expect(stale).toBeTruthy()
    if (stale?.kind === 'stale-sync') {
      expect(stale.days).toBe(2)
      expect(stale.id).toBe('stale-sync:2026-07-10')
    }
  })

  it('stays quiet when data arrived yesterday', () => {
    const daily = [day('2026-07-09')]
    expect(buildBellItems(daily, TODAY).some(i => i.kind === 'stale-sync')).toBe(false)
  })

  it('is empty for empty input', () => {
    expect(buildBellItems([], TODAY)).toEqual([])
  })
})

describe('parseAlertMessage', () => {
  it('splits the bold heading from the body and strips tags', () => {
    const msg = '🔴 <b>Организм с чем-то борется</b>\n\n↑ HRV: 58 мс при твоей норме 82 мс (1.5σ)\n\nСовет: день без нагрузок.\n<i>Это наблюдение по данным часов, не диагноз.</i>'
    const parsed = parseAlertMessage(msg)
    expect(parsed.title).toBe('Организм с чем-то борется')
    expect(parsed.body).toContain('HRV: 58 мс')
    expect(parsed.body).toContain('не диагноз')
    expect(parsed.body).not.toMatch(/<[^>]+>|🔴/)
  })

  it('falls back to a plain first line when there is no bold heading', () => {
    const parsed = parseAlertMessage('Резкий рост пульса покоя\nПонаблюдай за собой.')
    expect(parsed.title).toBe('Резкий рост пульса покоя')
    expect(parsed.body).toBe('Понаблюдай за собой.')
  })

  it('handles a single-line message', () => {
    expect(parseAlertMessage('Сообщение')).toEqual({ title: 'Сообщение', body: '' })
  })

  it('strips nested tags that survive a single replace pass', () => {
    const parsed = parseAlertMessage('Заголовок\n<scr<script>ipt>alert(1)</scr</script>ipt>')
    expect(parsed.body).not.toMatch(/<|script/)
  })
})
