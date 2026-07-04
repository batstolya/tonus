import { describe, expect, it } from 'vitest'
import {
  buildFootballReminderKeyboard,
  buildFootballReminderText,
  canUpdateTeams,
  isPlaceholderTeam,
  localizeRoundName,
  mapApiFootballFixture,
  mapEspnScoreboardEvent,
  mapFootballDataMatch,
  mapTheStatsApiFixture,
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

describe('mapTheStatsApiFixture', () => {
  it('maps TheStatsAPI fixtures to football_matches upserts', () => {
    const fixture = {
      matchNumber: 1,
      date: '2026-06-11',
      kickoffUtc: '2026-06-11T19:00:00Z',
      stage: 'group-stage',
      group: 'A',
      homeTeam: 'Mexico',
      awayTeam: 'South Africa',
      stadium: 'Estadio Azteca',
      hostCity: 'mexico-city',
      matchUrl: 'https://www.thestatsapi.com/world-cup/matches/mexico-vs-south-africa-2026-06-11',
    }

    expect(mapTheStatsApiFixture(fixture)).toMatchObject({
      provider: 'thestatsapi',
      provider_fixture_id: 1,
      short_id: 'ts1',
      league_id: 1,
      season: 2026,
      competition_name: 'FIFA World Cup 2026',
      round_name: 'Group A',
      home_team_id: null,
      home_team_name: 'Mexico',
      away_team_name: 'South Africa',
      kickoff_at: '2026-06-11T19:00:00Z',
      venue_name: 'Estadio Azteca',
      venue_city: 'mexico-city',
      status_short: 'NS',
      status_long: 'Not Started',
      raw_payload: fixture,
    })
  })
})

describe('mapEspnScoreboardEvent', () => {
  // Mirrors the real ESPN scoreboard shape: status lives under
  // competitions[0].status, `name`/`shortName` are the matchup (not the
  // competition), team ids are strings, and cities include the state.
  const scheduledEvent = {
    id: '760504',
    date: '2026-07-05T20:00Z',
    name: 'Norway at Brazil',
    shortName: 'NOR @ BRA',
    season: { year: 2026, type: 13800, slug: 'round-of-16' },
    competitions: [{
      id: '760504',
      date: '2026-07-05T20:00Z',
      altGameNote: 'FIFA World Cup, Round of 16',
      status: { type: { id: '1', name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled', shortDetail: 'Scheduled' } },
      venue: { fullName: 'AT&T Stadium', address: { city: 'Arlington, Texas', country: 'USA' } },
      competitors: [
        { homeAway: 'home', team: { id: '205', displayName: 'Brazil' } },
        { homeAway: 'away', team: { id: '299', displayName: 'Norway' } },
      ],
    }],
  }

  it('maps a scheduled ESPN event with real competition/round/status', () => {
    expect(mapEspnScoreboardEvent(scheduledEvent)).toMatchObject({
      provider: 'espn',
      provider_fixture_id: 760504,
      short_id: 'espn760504',
      league_id: 1,
      season: 2026,
      competition_name: 'FIFA World Cup',
      round_name: 'Round of 16',
      home_team_id: 205,
      home_team_name: 'Brazil',
      away_team_id: 299,
      away_team_name: 'Norway',
      kickoff_at: '2026-07-05T20:00Z',
      venue_name: 'AT&T Stadium',
      venue_city: 'Arlington',
      status_short: 'NS',
      status_long: 'Scheduled',
    })
  })

  it('reads finished status from the nested competition status', () => {
    const finished = {
      ...scheduledEvent,
      competitions: [{
        ...scheduledEvent.competitions[0],
        status: { type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true, description: 'Full Time', shortDetail: 'FT' } },
      }],
    }

    expect(mapEspnScoreboardEvent(finished)).toMatchObject({
      status_short: 'FT',
      status_long: 'Full Time',
    })
  })

  it('maps postponed events to a cancellation short code', () => {
    const postponed = {
      ...scheduledEvent,
      competitions: [{
        ...scheduledEvent.competitions[0],
        status: { type: { name: 'STATUS_POSTPONED', state: 'post', completed: false, description: 'Postponed' } },
      }],
    }

    expect(mapEspnScoreboardEvent(postponed).status_short).toBe('PST')
  })
})

describe('mapFootballDataMatch', () => {
  it('maps football-data.org matches to football_matches upserts', () => {
    const match = {
      id: 428001,
      utcDate: '2026-07-05T20:00:00Z',
      status: 'SCHEDULED',
      stage: 'LAST_16',
      group: null,
      venue: 'AT&T Stadium',
      competition: { name: 'FIFA World Cup' },
      season: { startDate: '2026-06-11' },
      homeTeam: { id: 764, name: 'Brazil', tla: 'BRA', crest: 'https://crests.football-data.org/764.svg' },
      awayTeam: { id: 782, name: 'Norway', tla: 'NOR', crest: 'https://crests.football-data.org/782.svg' },
    }

    expect(mapFootballDataMatch(match)).toMatchObject({
      provider: 'football-data',
      provider_fixture_id: 428001,
      short_id: 'fd428001',
      season: 2026,
      competition_name: 'FIFA World Cup',
      round_name: 'Last 16',
      home_team_id: 764,
      home_team_name: 'Brazil',
      home_team_code: 'BRA',
      away_team_id: 782,
      away_team_name: 'Norway',
      away_team_code: 'NOR',
      kickoff_at: '2026-07-05T20:00:00Z',
      venue_name: 'AT&T Stadium',
      status_short: 'NS',
    })
  })
})

describe('localizeRoundName', () => {
  it('translates knockout stages to fraction notation', () => {
    expect(localizeRoundName('Round of 32')).toBe('1/16 финала')
    expect(localizeRoundName('Round of 16')).toBe('1/8 финала')
    expect(localizeRoundName('Last 16')).toBe('1/8 финала')
    expect(localizeRoundName('Quarterfinals')).toBe('1/4 финала')
    expect(localizeRoundName('Quarter-final')).toBe('1/4 финала')
    expect(localizeRoundName('Semifinals')).toBe('1/2 финала')
    expect(localizeRoundName('Third place')).toBe('Матч за 3-е место')
    expect(localizeRoundName('Final')).toBe('Финал')
  })

  it('translates group stage labels', () => {
    expect(localizeRoundName('Group A')).toBe('Группа A')
    expect(localizeRoundName('Group Stage')).toBe('Групповой этап')
  })

  it('passes through unknown labels and null', () => {
    expect(localizeRoundName('Some Custom Round')).toBe('Some Custom Round')
    expect(localizeRoundName(null)).toBeNull()
    expect(localizeRoundName(undefined)).toBeNull()
  })
})

describe('isPlaceholderTeam / canUpdateTeams', () => {
  it('treats bracket references and unknowns as placeholders', () => {
    for (const name of ['Winner Match 49', 'Loser Match 50', 'TBD', 'TBA', '1A', '2B', 'Runner-up Group C', '', null, undefined]) {
      expect(isPlaceholderTeam(name as string)).toBe(true)
    }
  })

  it('accepts real national team names', () => {
    for (const name of ['Canada', 'Morocco', 'United States', 'South Africa', 'France']) {
      expect(isPlaceholderTeam(name)).toBe(false)
    }
  })

  it('only allows updates when both teams are real', () => {
    expect(canUpdateTeams('Canada', 'Morocco')).toBe(true)
    expect(canUpdateTeams('Winner Match 49', 'Morocco')).toBe(false)
    expect(canUpdateTeams('Canada', 'TBD')).toBe(false)
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

    expect(text).toContain('⚽ Матч через 30 мин')
    expect(text).toContain('<b>Canada — Morocco</b>')
    expect(text).toContain('FIFA World Cup 2026 · 1/8 финала')
    expect(text).toContain('Сегодня, 19:00')
    expect(text).toContain('Houston Stadium, Houston')
    expect(text).toContain('Будешь смотреть?')
  })

  it('shows honest countdown when sent far from kickoff', () => {
    const reminder = {
      home_team_name: 'Brazil',
      away_team_name: 'Norway',
      kickoff_at: '2026-07-05T20:00:00.000Z',
    }

    // за ~21.5 часа — часы
    expect(buildFootballReminderText(reminder, new Date('2026-07-04T22:23:00.000Z')))
      .toContain('⚽ Матч через 22 ч')
    // за 5 минут — минуты
    expect(buildFootballReminderText(reminder, new Date('2026-07-05T19:55:00.000Z')))
      .toContain('⚽ Матч через 5 мин')
    // почти начался
    expect(buildFootballReminderText(reminder, new Date('2026-07-05T19:59:30.000Z')))
      .toContain('⚽ Матч вот-вот начнётся')
  })
})
