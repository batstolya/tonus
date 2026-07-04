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
  provider: 'api-football' | 'thestatsapi' | 'espn' | 'football-data'
  provider_fixture_id: number
  short_id: string
  league_id: number
  season: number
  competition_name: string
  round_name: string | null
  home_team_id: number | null
  home_team_name: string
  home_team_code: string | null
  home_team_logo: string | null
  away_team_id: number | null
  away_team_name: string
  away_team_code: string | null
  away_team_logo: string | null
  kickoff_at: string
  venue_name: string | null
  venue_city: string | null
  status_short: string
  status_long: string
  raw_payload: ApiFootballFixture | TheStatsApiFixture | EspnScoreboardEvent | FootballDataMatch
  updated_at: string
}

export interface TheStatsApiFixture {
  matchNumber: number
  date: string
  kickoffUtc: string
  stage: string
  group?: string | null
  homeTeam: string
  awayTeam: string
  stadium: string
  hostCity: string
  matchUrl?: string
}

export interface EspnStatusType {
  name?: string
  state?: string
  description?: string
  shortDetail?: string
  detail?: string
  completed?: boolean
}

export interface EspnScoreboardEvent {
  id: string
  date: string
  name: string
  shortName?: string
  season?: {
    year?: number
    slug?: string
    type?: number
  }
  // ESPN usually nests status inside competitions[0]; the top-level field is
  // kept optional for forward/backward compatibility.
  status?: { type?: EspnStatusType }
  competitions: Array<{
    id: string
    date: string
    startDate?: string
    altGameNote?: string | null
    status?: { type?: EspnStatusType }
    venue?: {
      fullName?: string
      address?: { city?: string; country?: string }
    }
    competitors: Array<{
      homeAway?: 'home' | 'away'
      team?: { id?: string | number; displayName?: string }
      score?: string | number
      winner?: boolean
    }>
  }>
}

export interface FootballDataMatch {
  id: number
  utcDate: string
  status: string
  stage?: string | null
  group?: string | null
  venue?: string | null
  competition?: { name?: string | null }
  season?: { startDate?: string }
  homeTeam: { id?: number | null; name?: string | null; tla?: string | null; crest?: string | null }
  awayTeam: { id?: number | null; name?: string | null; tla?: string | null; crest?: string | null }
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

export function mapTheStatsApiFixture(fixture: TheStatsApiFixture): FootballMatchUpsert {
  return {
    provider: 'thestatsapi',
    provider_fixture_id: fixture.matchNumber,
    short_id: `ts${fixture.matchNumber}`,
    league_id: 1,
    season: 2026,
    competition_name: 'FIFA World Cup 2026',
    round_name: fixture.group ? `Group ${fixture.group}` : fixture.stage,
    home_team_id: null,
    home_team_name: fixture.homeTeam,
    home_team_code: null,
    home_team_logo: null,
    away_team_id: null,
    away_team_name: fixture.awayTeam,
    away_team_code: null,
    away_team_logo: null,
    kickoff_at: fixture.kickoffUtc,
    venue_name: fixture.stadium ?? null,
    venue_city: fixture.hostCity ?? null,
    status_short: 'NS',
    status_long: 'Not Started',
    raw_payload: fixture,
    updated_at: new Date().toISOString(),
  }
}

// Maps ESPN status keys/states to the short codes the rest of the pipeline
// relies on (NS / live / FT / cancellation markers).
const ESPN_STATUS_SHORT: Record<string, string> = {
  STATUS_SCHEDULED: 'NS',
  STATUS_DELAYED: 'NS',
  STATUS_FIRST_HALF: '1H',
  STATUS_HALFTIME: 'HT',
  STATUS_SECOND_HALF: '2H',
  STATUS_END_OF_REGULATION: 'FT',
  STATUS_FULL_TIME: 'FT',
  STATUS_FINAL: 'FT',
  STATUS_FINAL_AET: 'AET',
  STATUS_FINAL_PEN: 'PEN',
  STATUS_FIRST_EXTRA_TIME: 'ET',
  STATUS_SECOND_EXTRA_TIME: 'ET',
  STATUS_END_OF_EXTRATIME: 'ET',
  STATUS_SHOOTOUT: 'PEN',
  STATUS_POSTPONED: 'PST',
  STATUS_CANCELED: 'CANC',
  STATUS_CANCELLED: 'CANC',
  STATUS_ABANDONED: 'ABD',
  STATUS_SUSPENDED: 'SUSP',
}

function espnStatusShort(type?: EspnStatusType): string {
  if (!type) return 'NS'
  if (type.name && ESPN_STATUS_SHORT[type.name]) return ESPN_STATUS_SHORT[type.name]
  switch (type.state) {
    case 'pre': return 'NS'
    case 'in': return 'LIVE'
    case 'post': return type.completed ? 'FT' : 'NS'
    default: return type.shortDetail ?? 'NS'
  }
}

function espnTeamId(id?: string | number | null): number | null {
  if (id === null || id === undefined) return null
  const n = typeof id === 'number' ? id : Number.parseInt(id, 10)
  return Number.isFinite(n) ? n : null
}

// ESPN venue cities arrive as "Houston, Texas"; keep just the city.
function cleanCity(city?: string | null): string | null {
  if (!city) return null
  const trimmed = city.split(',')[0].trim()
  return trimmed || null
}

function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => (/^\d+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

// ESPN's `altGameNote` looks like "FIFA World Cup, Round of 16" — the part
// before the comma is the competition, the rest is the round. `event.name`
// ("Morocco at Canada") and `event.shortName` ("MAR @ CAN") are the matchup,
// NOT the competition, so they must not be used here.
function parseEspnCompetition(
  event: EspnScoreboardEvent,
  competition: EspnScoreboardEvent['competitions'][number] | undefined,
): { competitionName: string; roundName: string | null } {
  const note = competition?.altGameNote?.trim()
  if (note && note.includes(',')) {
    const [comp, ...rest] = note.split(',')
    return { competitionName: comp.trim() || 'FIFA World Cup', roundName: rest.join(',').trim() || null }
  }
  const roundFromSlug = event.season?.slug ? prettifySlug(event.season.slug) : null
  return { competitionName: note || 'FIFA World Cup', roundName: roundFromSlug }
}

export function mapEspnScoreboardEvent(event: EspnScoreboardEvent, updatedAt = new Date().toISOString()): FootballMatchUpsert {
  const competition = event.competitions?.[0]
  const competitors = competition?.competitors ?? []
  const home = competitors.find((c) => c.homeAway === 'home')
  const away = competitors.find((c) => c.homeAway === 'away')
  const homeName = home?.team?.displayName ?? 'TBD'
  const awayName = away?.team?.displayName ?? 'TBD'
  const homeId = espnTeamId(home?.team?.id)
  const awayId = espnTeamId(away?.team?.id)
  const venueName = competition?.venue?.fullName ?? null
  const venueCity = cleanCity(competition?.venue?.address?.city)
  // Real ESPN payloads nest status under competitions[0].status; fall back to
  // the (rare) top-level status for safety.
  const statusType = competition?.status?.type ?? event.status?.type
  const statusShort = espnStatusShort(statusType)
  const statusLong = statusType?.description ?? statusType?.name ?? 'Not Started'
  const seasonYear = event.season?.year ?? 2026
  const { competitionName, roundName } = parseEspnCompetition(event, competition)
  const providerId = Number.parseInt(event.id, 10) || 0

  return {
    provider: 'espn',
    provider_fixture_id: providerId,
    short_id: `espn${event.id}`,
    league_id: 1,
    season: seasonYear,
    competition_name: competitionName,
    round_name: roundName,
    home_team_id: homeId,
    home_team_name: homeName,
    home_team_code: null,
    home_team_logo: null,
    away_team_id: awayId,
    away_team_name: awayName,
    away_team_code: null,
    away_team_logo: null,
    kickoff_at: event.date,
    venue_name: venueName,
    venue_city: venueCity,
    status_short: statusShort,
    status_long: statusLong,
    raw_payload: event,
    updated_at: updatedAt,
  }
}

// Maps football-data.org's coarse status set to our short codes.
const FOOTBALL_DATA_STATUS_SHORT: Record<string, string> = {
  SCHEDULED: 'NS',
  TIMED: 'NS',
  IN_PLAY: 'LIVE',
  PAUSED: 'HT',
  FINISHED: 'FT',
  POSTPONED: 'PST',
  SUSPENDED: 'SUSP',
  CANCELLED: 'CANC',
  CANCELED: 'CANC',
}

export function mapFootballDataMatch(match: FootballDataMatch, updatedAt = new Date().toISOString()): FootballMatchUpsert {
  const statusShort = FOOTBALL_DATA_STATUS_SHORT[match.status] ?? 'NS'
  const seasonYear = match.season?.startDate ? Number.parseInt(match.season.startDate.slice(0, 4), 10) || 2026 : 2026
  const roundName = match.group
    ? prettifyFootballDataLabel(match.group)
    : match.stage
      ? prettifyFootballDataLabel(match.stage)
      : null

  return {
    provider: 'football-data',
    provider_fixture_id: match.id,
    short_id: `fd${match.id}`,
    league_id: 1,
    season: seasonYear,
    competition_name: match.competition?.name?.trim() || 'FIFA World Cup',
    round_name: roundName,
    home_team_id: match.homeTeam?.id ?? null,
    home_team_name: match.homeTeam?.name ?? 'TBD',
    home_team_code: match.homeTeam?.tla ?? null,
    home_team_logo: match.homeTeam?.crest ?? null,
    away_team_id: match.awayTeam?.id ?? null,
    away_team_name: match.awayTeam?.name ?? 'TBD',
    away_team_code: match.awayTeam?.tla ?? null,
    away_team_logo: match.awayTeam?.crest ?? null,
    kickoff_at: match.utcDate,
    venue_name: match.venue ?? null,
    venue_city: null,
    status_short: statusShort,
    status_long: prettifyFootballDataLabel(match.status),
    raw_payload: match,
    updated_at: updatedAt,
  }
}

// "LAST_16" -> "Last 16", "GROUP_STAGE" -> "Group Stage", "A" -> "Group A".
function prettifyFootballDataLabel(label: string): string {
  if (/^[A-L]$/i.test(label.trim())) return `Group ${label.trim().toUpperCase()}`
  return label
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => (/^\d+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

// Guards against writing placeholder brackets ("Winner Match 49", "TBD", "1A")
// over real team names. Applied before upsert so live pairs are never clobbered.
export function isPlaceholderTeam(name?: string | null): boolean {
  if (!name || !name.trim()) return true
  const n = name.trim()
  if (/^[1-4][A-L]$/i.test(n)) return true
  return /\b(winner|loser|tbd|tba|runner-?up)\b|to be (determined|confirmed)|^match\s*\d+$|^(1st|2nd|3rd)\b/i.test(n)
}

export function canUpdateTeams(home?: string | null, away?: string | null): boolean {
  return !isPlaceholderTeam(home) && !isPlaceholderTeam(away)
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
