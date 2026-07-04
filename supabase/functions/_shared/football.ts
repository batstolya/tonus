export type FootballWatchResponse = 'watching' | 'not_watching'

export interface ApiFootballFixture {
  fixture: {
    id: number
    date: string
    venue?: {
      name?: string | null
      city?: string | null
    } | null
    status: {
      long: string
      short: string
      elapsed?: number | null
    }
  }
  league: {
    id: number
    name: string
    country?: string
    season: number
    round?: string | null
  }
  teams: {
    home: {
      id: number
      name: string
      code?: string | null
      logo?: string | null
    }
    away: {
      id: number
      name: string
      code?: string | null
      logo?: string | null
    }
  }
}

export interface FootballMatchUpsert {
  provider: 'api-football'
  provider_fixture_id: number
  short_id: string
  league_id: number
  season: number
  competition_name: string
  round_name: string | null
  home_team_id: number
  home_team_name: string
  home_team_code: string | null
  home_team_logo: string | null
  away_team_id: number
  away_team_name: string
  away_team_code: string | null
  away_team_logo: string | null
  kickoff_at: string
  venue_name: string | null
  venue_city: string | null
  status_short: string
  status_long: string
  raw_payload: ApiFootballFixture
  updated_at: string
}

export interface FootballReminderView {
  home_team_name: string
  away_team_name: string
  kickoff_at: string
  competition_name?: string | null
  round_name?: string | null
  venue_name?: string | null
  venue_city?: string | null
}

export function mapApiFootballFixture(fixture: ApiFootballFixture, updatedAt = new Date().toISOString()): FootballMatchUpsert {
  return {
    provider: 'api-football',
    provider_fixture_id: fixture.fixture.id,
    short_id: `af${fixture.fixture.id}`,
    league_id: fixture.league.id,
    season: fixture.league.season,
    competition_name: fixture.league.name,
    round_name: fixture.league.round ?? null,
    home_team_id: fixture.teams.home.id,
    home_team_name: fixture.teams.home.name,
    home_team_code: fixture.teams.home.code ?? null,
    home_team_logo: fixture.teams.home.logo ?? null,
    away_team_id: fixture.teams.away.id,
    away_team_name: fixture.teams.away.name,
    away_team_code: fixture.teams.away.code ?? null,
    away_team_logo: fixture.teams.away.logo ?? null,
    kickoff_at: fixture.fixture.date,
    venue_name: fixture.fixture.venue?.name ?? null,
    venue_city: fixture.fixture.venue?.city ?? null,
    status_short: fixture.fixture.status.short,
    status_long: fixture.fixture.status.long,
    raw_payload: fixture,
    updated_at: updatedAt,
  }
}

export function parseFootballCallback(data: string): { shortId: string; response: FootballWatchResponse } | null {
  const match = data.match(/^fw:([A-Za-z0-9_-]+):(yes|no)$/)
  if (!match) return null
  return {
    shortId: match[1],
    response: match[2] === 'yes' ? 'watching' : 'not_watching',
  }
}

export function buildFootballReminderKeyboard(shortId: string) {
  return {
    inline_keyboard: [[
      { text: '✅ Буду смотреть', callback_data: `fw:${shortId}:yes` },
      { text: '❌ Не буду', callback_data: `fw:${shortId}:no` },
    ]],
  }
}

export function buildFootballReminderText(
  reminder: FootballReminderView,
  now = new Date(),
  locale = 'ru-RU',
  timeZone = 'Europe/Berlin',
): string {
  const kickoff = new Date(reminder.kickoff_at)
  const matchLine = `<b>${escapeHtml(reminder.home_team_name)} — ${escapeHtml(reminder.away_team_name)}</b>`
  const competition = [reminder.competition_name, reminder.round_name].filter(Boolean).join(' · ')
  const venue = [reminder.venue_name, reminder.venue_city].filter(Boolean).join(', ')

  return [
    '⚽ Через 30 минут матч',
    '',
    matchLine,
    competition ? `🏆 ${escapeHtml(competition)}` : null,
    `🕖 ${formatKickoff(kickoff, now, locale, timeZone)}`,
    venue ? `📍 ${escapeHtml(venue)}` : null,
    '',
    'Будешь смотреть?',
  ].filter((line): line is string => line !== null).join('\n')
}

export function buildFootballResponseText(
  reminder: FootballReminderView,
  response: FootballWatchResponse,
  now = new Date(),
  locale = 'ru-RU',
  timeZone = 'Europe/Berlin',
): string {
  const base = buildFootballReminderText(reminder, now, locale, timeZone)
    .replace(/\n\nБудешь смотреть\?$/, '')
  const label = response === 'watching'
    ? '✅ Отмечено: будешь смотреть'
    : '❌ Отмечено: не будешь смотреть'
  return `${base}\n\n${label}`
}

function formatKickoff(kickoff: Date, now: Date, locale: string, timeZone: string): string {
  const kickoffDate = localDateKey(kickoff, timeZone)
  const nowDate = localDateKey(now, timeZone)
  const tomorrow = new Date(now)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const tomorrowDate = localDateKey(tomorrow, timeZone)
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(kickoff)

  if (kickoffDate === nowDate) return `Сегодня, ${time}`
  if (kickoffDate === tomorrowDate) return `Завтра, ${time}`

  const date = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
  }).format(kickoff)
  return `${date}, ${time}`
}

function localDateKey(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
