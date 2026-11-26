// P5c (player-popup-season-phase.md) — the pop-up's live season, built from Sleeper weekly rows (App's
// defence load, live entry). View-only: never imported by projection/scoring. Sleeper rows are sparse —
// an absent counting key in a `gp === 1` week is 0; bye = no `TEAM_<team>` row that week, or one with
// `opponent == null`.

import { calculateFantasyPoints } from './fantasyPoints'
import { GAME_LOG_COLUMNS, findScheduleGame, deriveGameResult, formatWeather } from './gameLog'
import { normalizeTeamForSchedule } from './nflStats'

// The live season's entry of App's `defenceWeeklyByYear`, keyed on nflState.season. null when unknown.
export function selectLiveWeekly(byYear, nflState) {
  const live = parseInt(nflState?.season, 10)
  return Number.isFinite(live) ? (byYear?.[live] ?? null) : null
}

// → { [id]: { points, games } } over every gp === 1 row; TEAM_* skipped. Same arithmetic, same order,
// as weeklyRanks.js's seasonPointsFromWeekly.
export function liveSeasonLines(weeks, scoringSettings) {
  const out = {}
  for (const wk of weeks ?? []) {
    for (const [id, row] of Object.entries(wk?.rows ?? {})) {
      if (id.startsWith('TEAM_')) continue
      if (row?.stats?.gp !== 1) continue
      const line = (out[id] ??= { points: 0, games: 0 })
      line.points += calculateFantasyPoints(row.stats, scoringSettings ?? {})
      line.games += 1
    }
  }
  return out
}

export const LIVE_GAME_LOG_COLUMNS = Object.fromEntries(
  Object.entries(GAME_LOG_COLUMNS).map(([pos, cols]) => [pos, cols.filter(c => c.id !== 'epa')])
)

const n = (v) => String(v ?? 0)

// One played week's production from a Sleeper stats object, ordered as LIVE_GAME_LOG_COLUMNS[pos].
// Counting keys absent → 0 (Sleeper omits zeros). aDOT = rec_air_yd / rec_tgt to 1 dp, '—' when
// rec_tgt is 0/absent or rec_air_yd is absent. `stats` null → every column '—'.
export function computeLiveGameLogValues(position, stats) {
  const pos = LIVE_GAME_LOG_COLUMNS[position] ? position : 'WR'
  if (!stats) return LIVE_GAME_LOG_COLUMNS[pos].map(() => '—')
  if (pos === 'QB') {
    return [`${n(stats.pass_cmp)}/${n(stats.pass_att)}`, n(stats.pass_yd), n(stats.pass_td), n(stats.pass_int)]
  }
  if (pos === 'RB') {
    return [n(stats.rush_att), n(stats.rush_yd), n(stats.rush_td), n(stats.rec_tgt), n(stats.rec)]
  }
  const adot = stats.rec_tgt > 0 && stats.rec_air_yd != null
    ? (stats.rec_air_yd / stats.rec_tgt).toFixed(1) : '—'
  return [n(stats.rec_tgt), n(stats.rec), n(stats.rec_yd), n(stats.rec_td), adot]
}

/**
 * Rows for the live season, in the GameLogSection row shape (kind 'played' | 'bye', seasonType 'REG',
 * week, opponent, resultText, spread, total, roof, roundLabel: null, weather, production, pts).
 * Per loaded week, ascending (a failed week has no entry → no row):
 *  - row?.stats?.gp === 1 → played: team = row.team ?? playerTeam; production + PTS
 *    (calculateFantasyPoints(row.stats, scoringSettings ?? {})).
 *  - else team = row?.team ?? playerTeam; no team or 'FA' → no row (unknown, not a guess);
 *    TEAM_<team> absent or opponent == null → bye row; otherwise did-not-play: the context block with
 *    production all '—' and pts null.
 * Schedule join: normalizeTeamForSchedule(team) (Sleeper → era-accurate), then findScheduleGame /
 * deriveGameResult / formatWeather on that code; spread/total/roof off the schedule game.
 */
export function buildLiveGameLogRows({ position, weeks, playerId, playerTeam, scoringSettings, scheduleGames }) {
  const rows = []
  const ordered = [...(weeks ?? [])].sort((a, b) => a.week - b.week)
  for (const { week, rows: weekRows } of ordered) {
    const row = weekRows?.[playerId]
    const played = row?.stats?.gp === 1
    const team = row?.team ?? playerTeam
    if (!played && (!team || team === 'FA')) continue
    if (!played) {
      const teamRow = weekRows?.[`TEAM_${team}`]
      if (!teamRow || teamRow.opponent == null) {
        rows.push({ week, seasonType: 'REG', kind: 'bye' })
        continue
      }
    }
    const schedTeam = normalizeTeamForSchedule(team)
    const schedGame = findScheduleGame(scheduleGames, week, schedTeam)
    const { opponent, resultText } = deriveGameResult(schedGame, schedTeam)
    rows.push({
      week, seasonType: 'REG', kind: 'played',
      opponent, resultText,
      spread: schedGame?.spreadLine ?? null,
      total: schedGame?.totalLine ?? null,
      roof: schedGame?.roof ?? null,
      roundLabel: null,
      weather: formatWeather(schedGame),
      production: computeLiveGameLogValues(position, played ? row.stats : null),
      pts: played ? calculateFantasyPoints(row.stats, scoringSettings ?? {}) : null,
    })
  }
  return rows
}
