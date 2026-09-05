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

import { getCacheRecord, setCache, listCacheRecords } from './cache'
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

// ─── inputStatus block builders (D1a, schema v3) ──────────────────────────────
//
// Every entry is { loaded: boolean, count: number|null, detail?: object }. `loaded` is a
// LABEL only — see shouldWriteProjectionSnapshot below, which this file does not change.
// A `false` here must still let the snapshot write; it means the reader can no longer treat
// this input as silently-neutral-and-fine.

/**
 * `college` — collegeCoverage is `null` when the loader rejected (distinct from resolving with
 * empty data), otherwise `{ [year]: { receiving, rushing, passing } }` player counts
 * (see cfbd.js `countCollegeCoverage`). `count` is the sum of the three categories at the
 * most recent covered year; `detail.years` names every year with an empty/null category.
 */
function buildCollegeStatus(collegeCoverage) {
  if (collegeCoverage == null) return { loaded: false, count: 0, detail: { years: [] } }

  const years = Object.keys(collegeCoverage)
  const emptyYears = years.filter(year => {
    const c = collegeCoverage[year] ?? {}
    return (c.receiving ?? 0) === 0 || (c.rushing ?? 0) === 0 || (c.passing ?? 0) === 0
  })

  let count = 0
  if (years.length > 0) {
    const anchorYear = Math.max(...years.map(Number))
    const anchor = collegeCoverage[anchorYear] ?? {}
    count = (anchor.receiving ?? 0) + (anchor.rushing ?? 0) + (anchor.passing ?? 0)
  }

  return { loaded: years.length > 0 && emptyYears.length === 0, count, detail: { years: emptyYears } }
}

/**
 * `nflDraft` — nflDraftCoverage is `null` on a rejected loader, otherwise `{ [year]: pickCount }`
 * for every year the store returned (see App.jsx's derivation of loadNflDraftPicks' result).
 * `loaded` requires a non-zero pick count for `targetSeason` specifically — key presence alone
 * (a store-down year mapped to `[]`) must not read as loaded (correction 4's defect class).
 * `detail.years` lists only years with at least one pick; `detail.matched` is the Sleeper-matched
 * player count from `nflDraftMatches` (a plain object — `Object.keys(...).length` is correct).
 */
function buildNflDraftStatus(nflDraftCoverage, nflDraftMatches, targetSeason) {
  const matched = nflDraftMatches ? Object.keys(nflDraftMatches).length : 0

  if (nflDraftCoverage == null) {
    return { loaded: false, count: 0, detail: { years: [], matched } }
  }

  const years = Object.keys(nflDraftCoverage).filter(y => (nflDraftCoverage[y] ?? 0) > 0)
  const count = Object.values(nflDraftCoverage).reduce((sum, c) => sum + (c ?? 0), 0)
  const targetCount = targetSeason != null ? (nflDraftCoverage[targetSeason] ?? 0) : 0

  return { loaded: targetCount > 0, count, detail: { years, matched } }
}

/**
 * `ktc` — `count` is matched players (`ktcMap.size` — correction 1: ktcMap is a Map, never
 * `Object.keys(ktcMap).length`, which would silently read 0). `detail.rows` is the raw scraped
 * row count (~464 players + ~36 pick rows that matchKTCToSleeper deliberately drops — see
 * docs/integrations.md for that floor), not scoped to matched players.
 */
function buildKtcStatus(ktcMap, ktcRowCount) {
  const count = ktcMap ? ktcMap.size : 0
  return { loaded: count > 0, count, detail: { rows: ktcRowCount ?? null } }
}

/** `priorSnapshotTeams` — `loaded: false` when there is no prior snapshot; legitimate, not a defect. */
function buildPriorSnapshotStatus(priorTeamByPlayer) {
  if (priorTeamByPlayer == null) return { loaded: false, count: 0 }
  return { loaded: true, count: Object.keys(priorTeamByPlayer).length }
}

/** `depthChart` — count only, over the snapshot's own player set (not all of playerMap). */
function buildDepthChartStatus(players) {
  let count = 0
  for (const p of Object.values(players)) {
    if (p.depthChartOrder != null) count++
  }
  return { loaded: count > 0, count }
}

/**
 * `careerStats` — `detail.seasons` and `detail.provenance` (`{ [season]: path }`).
 * Season keys are strings: `Object.keys(careerStats)` already yields strings while the loader's
 * season variable is a number, and JSON round-trips an object key to a string regardless — so
 * converting anywhere else would be a lie the round-trip corrects. Never put provenance on
 * `careerStats` itself as a key (23 call sites derive the season list from its keys via
 * `Object.keys(careerStats).map(Number)`; a non-numeric key sorts as NaN and silently becomes
 * `currentSeason`). Path vocabulary is the loader's own three strings
 * (`'cache-hit'|'data-store'|'live-api'`), carried through untouched rather than remapped.
 */
function buildCareerStatsStatus(careerStats, careerProvenance) {
  if (!careerStats) return { loaded: false, count: null, detail: { seasons: [], provenance: {} } }

  const seasons = Object.keys(careerStats)
  const provenance = {}
  for (const season of seasons) {
    const path = careerProvenance?.[season]
    if (path !== undefined) provenance[season] = path
  }

  return { loaded: seasons.length > 0, count: seasons.length, detail: { seasons, provenance } }
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
 * @param {Object|null} [args.careerStats]         leagueData-independent career map, season-keyed
 * @param {Object} [args.careerProvenance]         { [season]: 'cache-hit'|'data-store'|'live-api' }
 * @param {Object|null} [args.nflDraftMatches]      matchNflDraftToSleeper's plain-object result
 * @param {Object|null} [args.nflDraftCoverage]     { [year]: pickCount }; null = loader rejected
 * @param {Object|null} [args.collegeCoverage]      { [year]: { receiving, rushing, passing } }; null = rejected
 * @param {Object|null} [args.priorTeamByPlayer]    { [playerId]: nfl_team }; null = no prior snapshot
 * @param {number|null} [args.ktcRowCount]          raw scraped KTC row count (players + picks)
 * @returns {{
 *   schemaVersion: 3,
 *   capturedAt:    string,
 *   targetSeason:  number|null,
 *   currentSeason: number|null,
 *   scoringBasis:  string,
 *   scoringSettings: object|null,
 *   leagueId:      string,
 *   teamDepthCharts: Object,
 *   players:       Object,
 *   inputStatus:   Object,
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
  careerStats,
  careerProvenance,
  nflDraftMatches,
  nflDraftCoverage,
  collegeCoverage,
  priorTeamByPlayer,
  ktcRowCount,
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

  const inputStatus = {
    college:            buildCollegeStatus(collegeCoverage),
    nflDraft:           buildNflDraftStatus(nflDraftCoverage, nflDraftMatches, targetSeason),
    ktc:                buildKtcStatus(ktcMap, ktcRowCount),
    priorSnapshotTeams: buildPriorSnapshotStatus(priorTeamByPlayer),
    depthChart:         buildDepthChartStatus(players),
    careerStats:        buildCareerStatsStatus(careerStats, careerProvenance),
  }

  return {
    schemaVersion: 3,
    capturedAt,
    targetSeason,
    currentSeason: cs,
    scoringBasis,
    scoringSettings: scoringSettings ?? null,
    leagueId,
    teamDepthCharts,
    players,
    inputStatus,
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

/**
 * Pure precondition gate for the daily snapshot write effect (App.jsx).
 * Returns true only when every projection input that would otherwise be captured
 * NEUTRAL has either produced data or settled (its load attempt resolved/rejected).
 *
 * Gates collegeStats/nflDraftMatches/priorTeamByPlayer on SETTLED-NESS, not non-null:
 * in CFBD/data-store-disabled or no-prior-snapshot sessions those inputs stay null
 * forever and the snapshot must still be written (neutral college/draft and a null
 * prior-team map are the correct permanent truths there).
 * See .claude/tasks/snapshot-input-gating.md.
 *
 * @param {object} args
 * @param {object|null} args.seasonProjections
 * @param {object|null} args.playerMap        leagueData.playerMap
 * @param {Map|null}    args.ktcMap
 * @param {object|null} args.scoringSettings  leagueData.scoringSettings
 * @param {string|null|undefined} args.leagueId
 * @param {object|null} args.careerStats
 * @param {boolean}     args.collegeSettled    loadCollegeStats() has resolved or rejected
 * @param {boolean}     args.nflDraftSettled   loadNflDraftPicks() has resolved or rejected
 * @param {boolean}     args.priorTeamSettled  loadPriorSnapshotTeams() has resolved or rejected
 * @returns {boolean}
 */
export function shouldWriteProjectionSnapshot({
  seasonProjections,
  playerMap,
  ktcMap,
  scoringSettings,
  leagueId,
  careerStats,
  collegeSettled,
  nflDraftSettled,
  priorTeamSettled,
}) {
  if (!seasonProjections || !playerMap || !ktcMap || !scoringSettings) return false
  if (!leagueId)   return false
  if (!careerStats) return false
  if (!collegeSettled || !nflDraftSettled || !priorTeamSettled) return false
  return true
}

/**
 * Reads the most-recent projection snapshot strictly BEFORE today's UTC date
 * and returns { [playerId]: nfl_team } for team-change detection. Returns null
 * when no prior snapshot exists.
 * @param {Date} [now]
 * @returns {Promise<Object|null>}
 */
export async function loadPriorSnapshotTeams(now = new Date()) {
  const todayKey = dateKeyUTC(now)
  const allRecords = await listCacheRecords('projection-snapshots/')

  let latestDate = null
  let latestKey  = null
  for (const { key } of allRecords) {
    const dateStr = key.slice('projection-snapshots/'.length)
    if (dateStr >= todayKey) continue  // skip today and future
    if (latestDate === null || dateStr > latestDate) {
      latestDate = dateStr
      latestKey  = key
    }
  }

  if (latestKey === null) return null

  const record = await getCacheRecord(latestKey)
  if (!record?.data?.players) return null

  const teamByPlayer = {}
  for (const [pid, entry] of Object.entries(record.data.players)) {
    if (entry.nfl_team != null) teamByPlayer[pid] = entry.nfl_team
  }
  return teamByPlayer
}
