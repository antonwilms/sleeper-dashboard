/**
 * src/utils/projectionSnapshot.js — Daily projection snapshot builder and writer.
 *
 * Captures a contemporaneous record of the projection pipeline's inputs and
 * outputs once per UTC day, keyed by date, so future backtests have a real
 * before-the-fact dataset to grade against.
 *
 * Two public exports:
 *   buildProjectionSnapshot — pure builder, no I/O
 *   writeProjectionSnapshot — idempotent writer; skips if same-day record exists
 *
 * Idempotency: skip-if-exists by UTC date (not by leagueId). If multiple leagues
 * are opened in the same UTC day, the first one to complete the projection pipeline
 * is captured; subsequent leagues are silently skipped. See Risks section in the
 * task file for v2 multi-league alternatives.
 */

import { getCacheRecord, setCache } from './cache'
import { buildTeamDepthChart } from './teamContext'
import { computeKTCPositionPercentile } from './dynastyScore'

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Derives a human-readable scoring basis label from leagueData.scoringSettings.
 * Returns 'unknown' if scoringSettings is null/undefined.
 *
 * @param {object|null} scoringSettings
 * @returns {'half_ppr'|'ppr'|'standard'|'te_premium'|'custom'|'unknown'}
 */
function deriveScoringBasis(scoringSettings) {
  if (!scoringSettings) return 'unknown'
  const rec     = scoringSettings.rec
  const bonusFD = scoringSettings.bonus_rec_fd ?? 0
  const tep     = scoringSettings.bonus_rec_te ?? 0
  // TE-premium must be checked before plain PPR (rec=1 alone looks like PPR)
  if (rec === 1   && tep > 0)                   return 'te_premium'
  if (rec === 1   && bonusFD === 0 && tep === 0) return 'ppr'
  if (rec === 0.5 && tep === 0)                  return 'half_ppr'
  if (rec === 0   && tep === 0)                  return 'standard'
  return 'custom'
}

/**
 * Returns 'YYYY-MM-DD' from a Date object using UTC components.
 *
 * @param {Date} date
 * @returns {string}
 */
function dateKeyUTC(date) {
  return date.toISOString().slice(0, 10)
}

/**
 * Builds the `players` block of the snapshot.
 *
 * Includes only players where:
 *   - seasonProjections[player_id] exists
 *   - playerMap[player_id].team is non-null (i.e. on an active NFL roster)
 *
 * @param {Object} seasonProjections  { [player_id]: projection object }
 * @param {Object} playerMap          leagueData.playerMap
 * @param {Map}    ktcMap             Map<player_id, { value, confidence }>
 * @returns {Object}  { [player_id]: { nfl_team, status, depthChartOrder, ktc, projection } }
 */
function buildPlayersBlock(seasonProjections, playerMap, ktcMap) {
  const players = {}

  for (const [playerId, projection] of Object.entries(seasonProjections)) {
    const info = playerMap[playerId]
    if (!info?.team) continue  // no team → exclude

    const position = info.position

    // KTC: null if player not in ktcMap; otherwise compute position percentile
    let ktc = null
    const ktcEntry = ktcMap?.get(playerId)
    if (ktcEntry != null) {
      const positionPercentile = computeKTCPositionPercentile(
        playerId, position, ktcMap, playerMap
      )
      ktc = { value: ktcEntry.value, positionPercentile }
    }

    players[playerId] = {
      nfl_team:        info.team,
      status:          info.status ?? null,
      depthChartOrder: info.depth_chart_order ?? null,
      ktc,
      projection,      // verbatim — no field whitelist; future fields ride along
    }
  }

  return players
}

/**
 * Builds the `teamDepthCharts` block.
 *
 * Calls the existing buildTeamDepthChart for each team that appears in the
 * snapshot's players set, then narrows to { playerId, fullName, depthOrder, status }.
 *
 * playerRows is passed through to buildTeamDepthChart to preserve its ghost-entry
 * filter (which excludes playerMap entries with no age and no playerRows entry).
 * Passing an empty array would silently drop more entries than expected.
 *
 * @param {Set<string>}  teamsInSnapshot   NFL team abbreviations seen in `players`
 * @param {Object}       playerMap
 * @param {Array}        playerRows        playerRowsWithProj — needed by buildTeamDepthChart
 * @returns {Object}  { [nflTeam]: { QB: [...], RB: [...], WR: [...], TE: [...] } }
 */
function buildTeamDepthChartsBlock(teamsInSnapshot, playerMap, playerRows) {
  const teamDepthCharts = {}

  for (const nflTeam of teamsInSnapshot) {
    const full = buildTeamDepthChart(nflTeam, playerMap, playerRows)

    // Narrow from buildTeamDepthChart's richer shape to the snapshot-level fields only.
    // Per-player rows already carry dynasty score / KTC — no need to duplicate at team level.
    const narrow = {}
    for (const [pos, entries] of Object.entries(full)) {
      narrow[pos] = entries.map(e => ({
        playerId:   e.player_id,
        fullName:   e.full_name,
        depthOrder: e.depthOrder,
        status:     playerMap[e.player_id]?.status ?? null,
      }))
    }

    teamDepthCharts[nflTeam] = narrow
  }

  return teamDepthCharts
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pure builder: composes the snapshot object from already-loaded state.
 * Does not touch IndexedDB or the network. Deterministic given its inputs.
 *
 * @param {object} args
 * @param {Object} args.seasonProjections   { [player_id]: projection object }
 * @param {Object} args.playerMap           leagueData.playerMap
 * @param {Map}    args.ktcMap              Map<player_id, { value, confidence }>
 * @param {Array}  args.playerRows          playerRowsWithProj — passed to buildTeamDepthChart
 * @param {Object} args.scoringSettings     leagueData.scoringSettings (stored verbatim + derives basis)
 * @param {string} args.leagueId
 * @param {number} [args.currentSeason]     last season in careerStats; targetSeason = +1
 * @param {Date}   [args.now]               Override for tests; defaults to new Date()
 * @returns {{
 *   schemaVersion: 2,
 *   capturedAt:    string,
 *   targetSeason:  number|null,
 *   currentSeason: number|null,
 *   scoringBasis:  string,
 *   scoringSettings: object|null,
 *   leagueId:      string,
 *   teamDepthCharts: Object,
 *   players:       Object,
 * }}
 */
export function buildProjectionSnapshot({
  seasonProjections,
  playerMap,
  ktcMap,
  playerRows,
  scoringSettings,
  leagueId,
  currentSeason,
  now,
}) {
  const capturedAt    = (now ?? new Date()).toISOString()
  const scoringBasis  = deriveScoringBasis(scoringSettings)

  const cs           = Number.isFinite(currentSeason) ? currentSeason : null
  const targetSeason = Number.isFinite(currentSeason) ? currentSeason + 1 : null

  const players = buildPlayersBlock(seasonProjections, playerMap, ktcMap)

  // Collect the set of NFL teams that appear in the players block
  const teamsInSnapshot = new Set(
    Object.values(players).map(p => p.nfl_team)
  )

  const teamDepthCharts = buildTeamDepthChartsBlock(
    teamsInSnapshot, playerMap, playerRows
  )

  return {
    schemaVersion: 2,
    capturedAt,
    targetSeason,
    currentSeason: cs,
    scoringBasis,
    scoringSettings: scoringSettings ?? null,
    leagueId,
    teamDepthCharts,
    players,
  }
}

/**
 * Idempotent writer: checks for an existing same-date snapshot, builds and
 * stores one if absent. Uses permanent TTL (999999 min) so the record survives
 * until explicitly cleared and is always picked up by the export pipeline.
 *
 * Skip-if-exists is intentional: the snapshot is supposed to be contemporaneous.
 * Same-day overwrites after a data refresh would silently move the timestamp.
 * See "first-league-of-the-day-wins" note in the task file (Risks §2).
 *
 * @param {object} args  Same as buildProjectionSnapshot
 * @returns {Promise<{ written: boolean, reason?: string, key?: string, bytes?: number }>}
 */
export async function writeProjectionSnapshot(args) {
  const dateKey = dateKeyUTC(args.now ?? new Date())
  const cacheKey = `projection-snapshots/${dateKey}`

  // Idempotency check — skip if a live record already exists for today
  const existing = await getCacheRecord(cacheKey)
  if (existing !== null) {
    return { written: false, reason: 'already-exists' }
  }

  const snapshot = buildProjectionSnapshot(args)
  const json     = JSON.stringify(snapshot)
  const bytes    = new TextEncoder().encode(json).length

  // 999999-minute TTL ≈ 1.9 years — treated as permanent by the export pipeline's
  // isLive() check (expiresAt > Date.now()), ensuring snapshots survive in IndexedDB
  // until explicitly cleared and always appear in the next export ZIP.
  await setCache(cacheKey, snapshot, 999999)

  return { written: true, key: cacheKey, bytes }
}
