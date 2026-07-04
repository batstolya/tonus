import { describe, expect, it } from 'vitest'
import {
  buildFootballReminderKeyboard,
  buildFootballReminderText,
  mapApiFootballFixture,
  parseFootballCallback,
} from './football.ts'

const fixture = {
  fixture: {
    id: 12345,
    date: '2026-07-04T17:00:00+00:00',
    venue: { name: 'Houston Stadium', city: 'Houston' },
    status: { long: 'Not Started', short: 'NS', elapsed: null },
  },
  league: {
    id: 1,
    name: 'FIFA World Cup',
    country: 'World',
    season: 2026,
    round: 'Round of 16',
  },
  teams: {
    home: { id: 11, name: 'Canada', logo: 'https://example.test/canada.png' },
    away: { id: 22, name: 'Morocco', logo: 'https://example.test/morocco.png' },
  },
}

describe('mapApiFootballFixture', () => {
  it('maps API-Football fixtures to football_matches upserts', () => {
    expect(mapApiFootballFixture(fixture)).toMatchObject({
      provider: 'api-football',
      provider_fixture_id: 12345,
      short_id: 'af12345',
      league_id: 1,
      season: 2026,
      competition_name: 'FIFA World Cup',
      round_name: 'Round of 16',
      home_team_id: 11,
      home_team_name: 'Canada',
      home_team_logo: 'https://example.test/canada.png',
      away_team_id: 22,
      away_team_name: 'Morocco',
      away_team_logo: 'https://example.test/morocco.png',
      kickoff_at: '2026-07-04T17:00:00+00:00',
      venue_name: 'Houston Stadium',
      venue_city: 'Houston',
      status_short: 'NS',
      status_long: 'Not Started',
      raw_payload: fixture,
    })
  })
})

describe('parseFootballCallback', () => {
  it('parses compact watch response callbacks', () => {
    expect(parseFootballCallback('fw:af12345:yes')).toEqual({ shortId: 'af12345', response: 'watching' })
    expect(parseFootballCallback('fw:af12345:no')).toEqual({ shortId: 'af12345', response: 'not_watching' })
  })

  it('rejects unrelated or malformed callbacks', () => {
    expect(parseFootballCallback('report')).toBeNull()
    expect(parseFootballCallback('fw::yes')).toBeNull()
    expect(parseFootballCallback('fw:af12345:maybe')).toBeNull()
  })
})

describe('buildFootballReminderKeyboard', () => {
  it('uses callback data short enough for Telegram inline buttons', () => {
    const keyboard = buildFootballReminderKeyboard('af12345')
    const buttons = keyboard.inline_keyboard.flat()
    expect(buttons.map(button => button.callback_data)).toEqual(['fw:af12345:yes', 'fw:af12345:no'])
    expect(buttons.every(button => button.callback_data.length <= 64)).toBe(true)
  })
})

describe('buildFootballReminderText', () => {
  it('formats a Berlin pre-match reminder in Telegram HTML', () => {
    const text = buildFootballReminderText({
      home_team_name: 'Canada',
      away_team_name: 'Morocco',
      kickoff_at: '2026-07-04T17:00:00.000Z',
      competition_name: 'FIFA World Cup 2026',
      round_name: 'Round of 16',
      venue_name: 'Houston Stadium',
      venue_city: 'Houston',
    }, new Date('2026-07-04T16:30:00.000Z'), 'ru-RU', 'Europe/Berlin')

    expect(text).toContain('⚽ Через 30 минут матч')
    expect(text).toContain('<b>Canada — Morocco</b>')
    expect(text).toContain('FIFA World Cup 2026 · Round of 16')
    expect(text).toContain('Сегодня, 19:00')
    expect(text).toContain('Houston Stadium, Houston')
    expect(text).toContain('Будешь смотреть?')
  })
})
