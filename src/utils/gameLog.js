// dp-v2 Slice 4a — Game log section pure helpers. No React; view-only, mirrors the same
// view-only guarantees as the loaders it reads (src/api/nflGameLogs.js, src/api/nflSchedule.js).
//
// Field names below (completions/attempts/passingYards/… on a gamelogs games[] row) were
// confirmed at runtime against nflverse/gamelogs/2025.json — src/api/nflGameLogs.js is a
// pass-through loader that names only week/seasonType/team/opponent, so these have no other
// app-side corroboration (task file §1).

export const GAME_LOG_COLUMNS = {
  QB: [
    { id: 'cmpAtt', label: 'CMP/ATT' },
    { id: 'yds',    label: 'YDS' },
    { id: 'td',     label: 'TD' },
    { id: 'int',    label: 'INT' },
    { id: 'epa',    label: 'EPA/ATT' },
  ],
  RB: [
    { id: 'car', label: 'CAR' },
    { id: 'yds', label: 'YDS' },
    { id: 'td',  label: 'TD' },
    { id: 'tgt', label: 'TGT' },
    { id: 'rec', label: 'REC' },
    { id: 'epa', label: 'EPA/CAR' },
  ],
  WR: [
    { id: 'tgt',  label: 'TGT' },
    { id: 'rec',  label: 'REC' },
    { id: 'yds',  label: 'YDS' },
    { id: 'td',   label: 'TD' },
    { id: 'adot', label: 'aDOT' },
    { id: 'epa',  label: 'EPA/TGT' },
  ],
}
GAME_LOG_COLUMNS.TE = GAME_LOG_COLUMNS.WR

function ratio(num, den, decimals) {
  if (num == null || den == null || den === 0) return '—'
  return (num / den).toFixed(decimals)
}
function count(v) {
  return v == null ? '—' : String(v)
}

/**
 * One game's production values, ordered to match GAME_LOG_COLUMNS[position]. `game` null
 * (bye / did-not-play / no gamelogs row) renders every column `—`. Every rate is recomputed from
 * its counting components per game — never a stored rate, never averaged across games; a zero or
 * missing denominator renders `—`, not `0` (task file §3.3).
 */
export function computeGameLogValues(position, game) {
  const pos = GAME_LOG_COLUMNS[position] ? position : 'WR'
  if (!game) return GAME_LOG_COLUMNS[pos].map(() => '—')

  if (pos === 'QB') {
    return [
      game.completions != null && game.attempts != null ? `${game.completions}/${game.attempts}` : '—',
      count(game.passingYards),
      count(game.passingTds),
      count(game.passingInterceptions),
      ratio(game.passingEpa, game.attempts, 2),
    ]
  }
  if (pos === 'RB') {
    return [
      count(game.carries),
      count(game.rushingYards),
      count(game.rushingTds),
      count(game.targets),
      count(game.receptions),
      ratio(game.rushingEpa, game.carries, 2),
    ]
  }
  // WR / TE (and any unrecognised position, as a safe generic default)
  return [
    count(game.targets),
    count(game.receptions),
    count(game.receivingYards),
    count(game.receivingTds),
    ratio(game.receivingAirYards, game.targets, 1),
    ratio(game.receivingEpa, game.targets, 2),
  ]
}

/** The schedule row where `team` is either side, for `week`. Null-safe. */
export function findScheduleGame(games, week, team) {
  if (!games || !team) return null
  return games.find(g => g.week === week && (g.homeTeam === team || g.awayTeam === team)) ?? null
}

/**
 * Derives RESULT from the home-margin schedule field, oriented to `team`. `result` (and both
 * scores) are null for every unplayed game — renders `—`. Printing `result` verbatim would show
 * the opponent's margin for an away player (task file §3.1); this always re-derives from the
 * team's own scored/allowed points.
 */
export function deriveGameResult(schedGame, team) {
  if (!schedGame) return { opponent: null, resultText: '—' }
  const opponent = schedGame.homeTeam === team ? schedGame.awayTeam : schedGame.homeTeam
  if (schedGame.result == null || schedGame.homeScore == null || schedGame.awayScore == null) {
    return { opponent, resultText: '—' }
  }
  const isHome = schedGame.homeTeam === team
  const teamScore = isHome ? schedGame.homeScore : schedGame.awayScore
  const oppScore  = isHome ? schedGame.awayScore : schedGame.homeScore
  const margin    = isHome ? schedGame.result : -schedGame.result
  const letter = margin > 0 ? 'W' : margin < 0 ? 'L' : 'T'
  return { opponent, resultText: `${letter} ${teamScore}-${oppScore}` }
}

/** temp/wind render `—` when null — the honest indoor state, never coalesced to 0 (task §3.5). */
export function formatWeather(schedGame) {
  if (!schedGame) return '—'
  const t = schedGame.temp != null ? `${schedGame.temp}°` : '—'
  const w = schedGame.wind != null ? `${schedGame.wind}mph` : '—'
  return (t === '—' && w === '—') ? '—' : `${t} / ${w}`
}

/**
 * Builds one row per game the player's team played in `season`, week order, REG then POST.
 *
 * REG (weeks 1-18) is driven entirely by `weeklyStatus[week-1]` ('P' played / 'B' bye /
 * 'D' did-not-play — already classified at load time by sleeperStats.js). A bye renders a
 * labelled row with no schedule/production lookup. A week with no status recorded at all (a
 * failed fetch during the original career-history load) renders no row — absent data, not a
 * guess. POST has no weeklyStatus coverage, so it is enumerated directly from `gamesByWeek`.
 *
 * `resolveTeam(week)` and `scheduleGames` are supplied by the caller — this function is pure
 * over its inputs (no resolvePlayerTeam/schedule wiring here).
 */
export function buildGameLogRows({ position, weeklyStatus, weeklyPoints, gamesByWeek, scheduleGames, resolveTeam }) {
  const rows = []
  const status = weeklyStatus ?? []

  function buildPlayedRow(week, seasonType) {
    const team = resolveTeam(week)
    const game = gamesByWeek.get(week) ?? null
    const schedGame = findScheduleGame(scheduleGames, week, team)
    const { opponent, resultText } = deriveGameResult(schedGame, team)
    return {
      week, seasonType, kind: 'played',
      opponent, resultText,
      spread: schedGame?.spreadLine ?? null,
      total: schedGame?.totalLine ?? null,
      roof: schedGame?.roof ?? null,
      roundLabel: schedGame?.gameType ?? null,
      weather: formatWeather(schedGame),
      production: computeGameLogValues(position, game),
      pts: seasonType === 'REG' ? (weeklyPoints?.[week] ?? null) : null,
    }
  }

  for (let week = 1; week <= 18; week++) {
    const st = status[week - 1]
    if (st === 'B') {
      rows.push({ week, seasonType: 'REG', kind: 'bye' })
      continue
    }
    if (!st) continue // no status recorded for this week at all — no row, not a guess
    rows.push(buildPlayedRow(week, 'REG'))
  }

  const postWeeks = [...gamesByWeek.entries()]
    .filter(([, g]) => g.seasonType && g.seasonType !== 'REG')
    .map(([week]) => week)
    .sort((a, b) => a - b)

  for (const week of postWeeks) {
    rows.push(buildPlayedRow(week, 'POST'))
  }

  return rows
}
