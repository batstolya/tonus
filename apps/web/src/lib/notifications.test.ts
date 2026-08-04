import { describe, it, expect } from 'vitest'
import { buildBellItems, parseAlertMessage, splitAlertBody, localizeAlertText } from './notifications'
import type { DailyMetrics } from '../types'
import { translate } from './translate'

// Активный день по новой механике — шаги выше порога.
function day(date: string, steps = 12000): DailyMetrics {
  return { date, steps }
}

const TODAY = new Date('2026-07-10T18:00:00')

describe('buildBellItems', () => {
  it('returns nothing when today is closed and data is fresh', () => {
    const daily = [day('2026-07-08'), day('2026-07-09'), day('2026-07-10')]
    // Narrowed to the two kinds this case is about: sparse fixtures also
    // trigger the data-gaps item, which has its own tests below.
    const kinds = buildBellItems(daily, TODAY).map(i => i.kind)
    expect(kinds).not.toContain('streak-risk')
    expect(kinds).not.toContain('stale-sync')
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

describe('splitAlertBody', () => {
  const body = '↑ HRV: 58 мс при твоей норме 82 мс (1.5σ)\n\nСовет: полегче сегодня, понаблюдай за собой.\nЭто наблюдение по данным часов, не диагноз.'

  it('splits the facts from the advice tail at the "Совет:" line', () => {
    const { facts, advice } = splitAlertBody(body)
    expect(facts).toBe('↑ HRV: 58 мс при твоей норме 82 мс (1.5σ)')
    expect(advice).toBe('Совет: полегче сегодня, понаблюдай за собой.\nЭто наблюдение по данным часов, не диагноз.')
  })

  it('returns the whole body as facts when there is no advice marker', () => {
    expect(splitAlertBody('Просто текст')).toEqual({ facts: 'Просто текст', advice: '' })
  })
})

describe('localizeAlertText', () => {
  // Мимикрия под t() из i18n: реальный словарь + подстановка {vars}.
  const tFor = (lang: 'uk' | 'en') => (ru: string, vars?: Record<string, string | number>) => {
    let s = translate(ru, lang)
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    return s
  }

  it('translates a metric fact line to Ukrainian, including units', () => {
    const out = localizeAlertText('↑ Частота дыхания: 21.5/мин при твоей норме 16.0/мин (8.1σ)', tFor('uk'))
    expect(out).toBe('↑ Частота дихання: 21.5/хв за твоєї норми 16.0/хв (8.1σ)')
  })

  it('translates advice and disclaimer lines to English', () => {
    const out = localizeAlertText('Совет: полегче сегодня, понаблюдай за собой.\nЭто наблюдение по данным часов, не диагноз.', tFor('en'))
    expect(out).not.toMatch(/[а-яё]/i)
    expect(out.split('\n')).toHaveLength(2)
  })

  it('translates the resting-HR fact with bpm units', () => {
    const out = localizeAlertText('↑ Пульс покоя: 64 уд/мин при твоей норме 55 уд/мин (2.3σ)', tFor('en'))
    expect(out).toBe('↑ Resting HR: 64 bpm vs your baseline 55 bpm (2.3σ)')
  })

  it('passes unknown lines through unchanged', () => {
    expect(localizeAlertText('Неизвестная строка', tFor('uk'))).toBe('Неизвестная строка')
  })
})

describe('buildBellItems: data gaps', () => {
  // Every metric dataCompleteness tracks, so "full" really is full.
  const full = (date: string): DailyMetrics => ({
    date, steps: 12000, sleepHours: 7, oxygenSaturation: 0.97,
    hrv: 45, restingHeartRate: 55, activeEnergy: 600,
  })
  // Same, minus SpO2 on every day.
  const partial = (date: string): DailyMetrics => {
    const d = full(date)
    delete d.oxygenSaturation
    return d
  }

  const window = (make: (d: string) => DailyMetrics) =>
    Array.from({ length: 14 }, (_, i) => {
      const d = new Date(TODAY)
      d.setDate(d.getDate() - i)
      return make(d.toISOString().slice(0, 10))
    })

  it('says nothing when every tracked metric is covered', () => {
    const items = buildBellItems(window(full), TODAY)
    expect(items.some(i => i.kind === 'data-gaps')).toBe(false)
  })

  it('reports a metric that is missing on enough days', () => {
    const items = buildBellItems(window(partial), TODAY)
    const gaps = items.find(i => i.kind === 'data-gaps')
    expect(gaps).toBeDefined()
    if (gaps?.kind !== 'data-gaps') throw new Error('wrong kind')
    expect(gaps.gaps.some(g => g.metric === 'oxygenSaturation')).toBe(true)
    expect(gaps.gaps.every(g => g.missingDays >= 3)).toBe(true)
  })

  it('ignores a metric missing on only a day or two', () => {
    const days = window(full)
    days[0] = { ...days[0], oxygenSaturation: undefined }
    const items = buildBellItems(days, TODAY)
    expect(items.some(i => i.kind === 'data-gaps')).toBe(false)
  })

  // The id carries the date, so dismissing it lasts the day and the reminder
  // comes back tomorrow if the gap is still there.
  it('stamps the id with today so a dismissal expires', () => {
    const gaps = buildBellItems(window(partial), TODAY).find(i => i.kind === 'data-gaps')
    expect(gaps?.id).toBe('data-gaps:2026-07-10')
  })

  it('reads the window relative to the date it is given, not the clock', () => {
    // Same data, a year later: nothing falls inside the window any more.
    const later = new Date('2027-07-10T18:00:00')
    expect(buildBellItems(window(partial), later).some(i => i.kind === 'data-gaps')).toBe(false)
  })
})
