/**
 * src/utils/relevance.js
 *
 * Pure relevance-filter helpers for the player Explorer candidate pool.
 * Extracted from App.jsx so they can be unit-tested independently.
 * Called at the same point in the playerRows memo — this is not a pipeline reorder.
 *
 * Roster-absence tightens the stale-team+KTC rule (Rule 6): a player definitively
 * absent from a complete current nflverse roster is no longer rescued by having a
 * stale Sleeper team field + lingering KTC value (the Roethlisberger-class retiree).
 * When the roster feed is unavailable or incomplete (rosterComplete=false), behavior
 * is byte-identical to the prior logic — the 'unknown' path is always safe.
 */

/**
 * True if the player has gamesPlayed > 0 in any of the last `lookback` seasons.
 *
 * @param {object} careerStats  { [season]: { [playerId]: { gamesPlayed, ... } } }
 * @param {string} playerId
 * @param {number} mostRecentSeason
 * @param {number} [lookback=2]
 * @returns {boolean}
 */
export function playedRecently(careerStats, playerId, mostRecentSeason, lookback = 2) {
  for (let i = 0; i < lookback; i++) {
    const season = mostRecentSeason - i
    if ((careerStats[season]?.[playerId]?.gamesPlayed ?? 0) > 0) return true
  }
  return false
}

/**
 * Returns the roster membership status of a player from a resolved nflverse roster.
 * Returns 'unknown' when roster data is unavailable or incomplete — callers must
 * fall back to the prior behavior when 'unknown'.
 *
 * @param {string} playerId
 * @param {Set<string>|null} rosterIds
 * @param {boolean} rosterComplete
 * @returns {'present'|'absent'|'unknown'}
 */
export function rosterStatusOf(playerId, rosterIds, rosterComplete) {
  if (!rosterComplete || !rosterIds) return 'unknown'
  return rosterIds.has(playerId) ? 'present' : 'absent'
}

/**
 * Returns true if the player should appear in the Explorer.
 *
 * Evaluation order — rostered players and current rookies are always kept
 * BEFORE any roster gate, so the roster signal never hides them:
 *
 *   1. Ghost entry (no age/team/years_exp/full_name)  → exclude
 *   2. rosteredIds.has(id)                            → keep (guarantee)
 *   3. years_exp === 0 AND age > 0                    → keep (guarantee)
 *      [rs = rosterStatusOf(id, rosterIds, rosterComplete)]
 *   4. rs === 'present'                               → keep (new additive signal)
 *   5. playedRecently (last 2 seasons)                → keep (unchanged)
 *   6. onNflTeam AND inKtc AND rs !== 'absent'        → keep (tightened from prior)
 *      When rs === 'unknown', this is byte-identical to the prior behavior.
 *   7. else                                           → exclude
 *
 * The only players newly excluded vs the prior logic are those satisfying all of:
 *   (a) not rostered  (b) not current rookies  (c) no play in last 2 seasons
 *   (d) kept solely by Rule 6 (stale team + KTC)  (e) definitively absent from
 *   a complete current roster. When rosterComplete is false, zero behavior change.
 *
 * @param {{
 *   row: object,
 *   playerMap: object,
 *   rosteredIds: Set<string>,
 *   ktcMap: Map<string,object>|null,
 *   careerStats: object,
 *   mostRecentSeason: number,
 *   rosterIds: Set<string>|null,
 *   rosterComplete: boolean,
 * }} args
 * @returns {boolean}
 */
export function isRelevantPlayer({
  row,
  playerMap,
  rosteredIds,
  ktcMap,
  careerStats,
  mostRecentSeason,
  rosterIds,
  rosterComplete,
}) {
  const playerId = row.player_id
  const info = playerMap[playerId] ?? {}

  // 1. Ghost entry — no meaningful identity data
  if (
    (!info.age || info.age === 0) &&
    !info.team &&
    !info.years_exp &&
    !info.full_name
  ) return false

  // 2. Rostered players are always relevant
  if (rosteredIds.has(playerId)) return true

  // 3. Current rookies with a known age are always relevant
  if (row.years_exp === 0 && row.age && row.age > 0) return true

  const rs = rosterStatusOf(playerId, rosterIds, rosterComplete)

  // 4. Authoritative roster presence — additive keep-signal, never excludes
  if (rs === 'present') return true

  // 5. Played in any of the last 2 seasons
  if (playedRecently(careerStats, playerId, mostRecentSeason, 2)) return true

  // 6. On an active NFL team AND tracked by KTC (catches offseason FAs the market values).
  //    Tightened: rs === 'absent' breaks this rescue for definitively-retired players
  //    (e.g. Roethlisberger — stale PIT team but absent from roster_2025).
  //    When rs === 'unknown' (roster unavailable/incomplete), behavior is unchanged.
  const onNflTeam = row.nfl_team && row.nfl_team !== 'FA'
  const inKtc = ktcMap?.has(playerId) ?? false
  if (onNflTeam && inKtc && rs !== 'absent') return true

  return false
}
