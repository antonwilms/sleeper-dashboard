/**
 * src/utils/playerTeam.js
 *
 * VIEW-ONLY. The SINGLE player→team resolution point for joins against
 * teamcontext (`src/api/teamContext.js`) and the NFL schedule — both of
 * which key by ERA-ACCURATE team abbr. Never feeds projection/scoring;
 * guarded by src/__tests__/teamContextViewOnly.test.js.
 *
 * Two input grains, two input domains:
 * - Season grain (`careerStats[season][playerId].team`, season-totals schema
 *   v3): already ERA-ACCURATE — the normalization chain below is a verified
 *   identity on this domain (exhaustive scan of nfl/season-totals/2012–2025,
 *   zero anomalies).
 * - Week grain (nflverse gamelogs `games[].team`): CURRENT-FRANCHISE domain
 *   in every season — the era remap here is load-bearing.
 *
 * `eraTeam` mirrors the data repo's `lib/nflverse.mjs` `eraTeam` — a future
 * franchise move/rename must update both repos together.
 *
 * `playerMap[pid].team` (Sleeper's CURRENT team, incl. `LAR`) is
 * deliberately NOT an input here — it identifies a player's *current* team,
 * which is meaningless for a historical (season, week) join.
 */

import { normalizeTeamForSchedule } from './nflStats.js'

/**
 * App-side mirror of the data repo's era remap (lib/nflverse.mjs eraTeam). Maps a
 * current-franchise abbr to the era-accurate abbr for old seasons; identity otherwise.
 * A future relocation/rename must be added in BOTH repos together.
 */
export function eraTeam(abbr, season) {
  if (abbr === 'LA'  && season <= 2015) return 'STL'
  if (abbr === 'LAC' && season <= 2016) return 'SD'
  if (abbr === 'LV'  && season <= 2019) return 'OAK'
  return abbr
}

/**
 * Resolve a player's ERA-ACCURATE team code for a season (week omitted) or a specific week.
 * - Season grain: careerStats[season][playerId].team (season-totals schema v3 — already
 *   era-accurate; the normalization chain is a verified identity on that domain).
 * - Week grain:   gameLogPlayers[playerId].games[].team (nflverse gamelogs — CURRENT-FRANCHISE
 *   domain in all seasons; the era remap here is load-bearing). Caller supplies
 *   loadNflGameLogs(season).players.
 * Returns null when unresolved — never throws, never NaN.
 * @param {{ careerStats?: object, gameLogPlayers?: object }} sources
 * @param {string} playerId
 * @param {number|string} season
 * @param {number|null} [week]
 * @returns {string|null}
 */
export function resolvePlayerTeam({ careerStats, gameLogPlayers } = {}, playerId, season, week = null) {
  const yr = Number(season)
  if (!playerId || !Number.isFinite(yr)) return null
  let raw
  if (week == null) {
    raw = careerStats?.[yr]?.[playerId]?.team ?? null
  } else {
    raw = gameLogPlayers?.[playerId]?.games?.find(g => g.week === week)?.team ?? null
  }
  if (!raw) return null
  return eraTeam(normalizeTeamForSchedule(raw), yr)
}
