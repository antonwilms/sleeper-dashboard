// view-only; never feeds projectedPPG, dynasty score, or any factors entry; pure

import { QUALIFYING_GP } from './outlookConsistency.js'
import { passerRating } from './efficiencyMetrics.js'
import { computeSeasonAverages } from './nflStats.js'
import { resolvePlayerTeam } from './playerTeam.js'

// Metric ids per position. TE aliases WR.
export const POSITION_STAT_METRICS = {
  QB: ['cmpPct', 'passerRating', 'sacks'],
  RB: ['rushShare', 'rbTargetShare', 'yardsPerCarry'],
  WR: ['targetShare', 'airYardsShare', 'aDOT'],
}
POSITION_STAT_METRICS.TE = POSITION_STAT_METRICS.WR

// Which metric ids read the per-season-team share series (vs careerStats counting).
const SHARE_FROM_SERIES = new Set(['rushShare', 'targetShare'])

/**
 * View-only per-season-team rushing/receiving denominators. Same gamesPlayed>=1
 * discipline as computeHistoricalTeamTotals; entity gating here is playerMap
 * membership, which both excludes the `TEAM_<abbr>` aggregate pseudo-rows
 * (playersMap never carries `TEAM_*` keys — teamContext excludes them by id via
 * `isTeamAggregateId`) and drops directory-absent (retired) ids — a deliberate
 * view-only divergence from teamContext, which keeps them (R2 denominator
 * repair). Attribution is via playerTeam.resolvePlayerTeam
 * (season grain — careerStats[season][id].team, era-accurate domain; NOT
 * playerMap[pid].team), and additionally sums rec_air_yd. A record with no resolved per-season team
 * contributes to no denominator (graceful omit, never NaN). Used as the denominator
 * for RB rush/target share and WR/TE target/air-yards share (correct team-total
 * shares, never per-game-share averages). Never feeds projection/scoring.
 * @param {object} careerStats  { [season]: { [pid]: { gamesPlayed, team, stats:{...} } } }
 * @param {object} playerMap    { [pid]: { position } } — membership gate only (never team)
 * @returns {{ [season:number]: { [team:string]: { rushAtt:number, rec:number, recTgt:number, recAirYd:number } } }}
 */
export function buildTeamShareTotals(careerStats, playerMap) {
  const result = {}
  for (const [season, seasonData] of Object.entries(careerStats)) {
    const teamTotals = {}
    for (const [playerId, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 1) continue
      const player = playerMap[playerId]
      if (!player) continue
      const team = resolvePlayerTeam({ careerStats }, playerId, season)
      if (!team) continue
      if (!teamTotals[team]) teamTotals[team] = { rushAtt: 0, rec: 0, recTgt: 0, recAirYd: 0 }
      const s = data.stats ?? {}
      teamTotals[team].rushAtt   += s.rush_att    ?? 0
      teamTotals[team].rec       += s.rec         ?? 0
      teamTotals[team].recTgt    += s.rec_tgt     ?? 0
      teamTotals[team].recAirYd  += s.rec_air_yd  ?? 0
    }
    result[season] = teamTotals
  }
  return result
}

/**
 * View-only per-season-team share series — the per-season-team analogue of
 * teamContext.computeHistoricalShares, with the IDENTICAL output shape and math.
 * Oldest→newest, gp>=8, RB=rush_att share, WR/TE=rec_tgt share (fallback rec share),
 * r3 rounding, QB skipped. The ONLY difference from computeHistoricalShares: team
 * attribution is via playerTeam.resolvePlayerTeam (season grain — careerStats[season][id].team,
 * era-accurate domain) not playerMap[pid].team.
 * playerMap is used for the membership gate + position + QB-skip only — never for team.
 * Never feeds projection/scoring.
 * @param {object} careerStats
 * @param {object} teamShareTotals  buildTeamShareTotals(careerStats, playerMap) output
 * @param {object} playerMap        { [pid]: { position } } — membership gate + position only
 * @returns {{ [pid:string]: Array<{ season:number, share:number, gamesPlayed:number }> }}
 */
export function buildPerSeasonTeamShares(careerStats, teamShareTotals, playerMap) {
  const result = {}
  const allSeasons = Object.keys(careerStats).map(Number).sort()

  for (const season of allSeasons) {
    const seasonData = careerStats[season] ?? {}
    for (const [playerId, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 8) continue
      const player = playerMap[playerId]
      if (!player) continue
      const pos = player.position
      if (!['RB', 'WR', 'TE'].includes(pos)) continue
      const team = resolvePlayerTeam({ careerStats }, playerId, season)
      if (!team) continue
      const teamTotals = teamShareTotals[season]?.[team]
      if (!teamTotals) continue

      const s = data.stats ?? {}
      let share = null
      if (pos === 'RB') {
        const rushAtt = s.rush_att ?? 0
        if (rushAtt > 0) share = rushAtt / Math.max(teamTotals.rushAtt, 1)
      } else {
        const recTgt = s.rec_tgt ?? 0
        if (recTgt > 0 && teamTotals.recTgt > 0) {
          share = recTgt / Math.max(teamTotals.recTgt, 1)
        } else {
          const rec = s.rec ?? 0
          if (rec > 0) share = rec / Math.max(teamTotals.rec, 1)
        }
      }
      if (share === null || !isFinite(share)) continue

      if (!result[playerId]) result[playerId] = []
      result[playerId].push({ season, share: Math.round(share * 1000) / 1000, gamesPlayed: data.gamesPlayed })
    }
  }
  return result
}

/**
 * Compute a single metric value for one player-season from counting components.
 * Returns number|null. Never returns NaN.
 * @private
 */
function computeMetricValue(id, seasonData, { season, team, teamShareTotals }) {
  const s = seasonData.stats ?? {}
  if (id === 'cmpPct') {
    const v = computeSeasonAverages(seasonData).compPct
    return v != null && Number.isFinite(v) ? v : null
  }
  if (id === 'passerRating') {
    const v = passerRating(s)
    return v != null && Number.isFinite(v) ? v : null
  }
  if (id === 'sacks') {
    const v = s.pass_sack
    if (v == null || !Number.isFinite(v)) return null
    return v
  }
  if (id === 'yardsPerCarry') {
    const att = s.rush_att ?? 0
    if (att <= 0) return null
    const v = (s.rush_yd ?? 0) / att
    return Number.isFinite(v) ? v : null
  }
  if (id === 'aDOT') {
    const tgt = s.rec_tgt ?? 0
    if (tgt <= 0) return null
    const v = (s.rec_air_yd ?? 0) / tgt
    return Number.isFinite(v) ? v : null
  }
  if (id === 'rbTargetShare') {
    const tgt = s.rec_tgt ?? 0
    if (tgt <= 0 || !team) return null
    const denom = teamShareTotals?.[season]?.[team]?.recTgt ?? 0
    if (denom <= 0) return null
    const v = Math.round((tgt / denom) * 1000) / 1000
    return Number.isFinite(v) ? v : null
  }
  if (id === 'airYardsShare') {
    const airYd = s.rec_air_yd ?? 0
    if (airYd <= 0 || !team) return null
    const denom = teamShareTotals?.[season]?.[team]?.recAirYd ?? 0
    if (denom <= 0) return null
    const v = Math.round((airYd / denom) * 1000) / 1000
    return Number.isFinite(v) ? v : null
  }
  return null
}

/**
 * Per-metric per-season series for one player, oldest->newest, gp>=QUALIFYING_GP and
 * finite-value only. Rates recomputed from counting components (never stored rate keys).
 * rushShare/targetShare read the per-season-team series (perSeasonTeamShares);
 * rbTargetShare/airYardsShare use teamShareTotals keyed by that season's per-season team;
 * cmpPct via computeSeasonAverages; passerRating via efficiencyMetrics.passerRating;
 * yardsPerCarry/aDOT via direct division; sacks = stats.pass_sack count.
 * @param {string} playerId
 * @param {'QB'|'RB'|'WR'|'TE'} position
 * @param {object} careerStats
 * @param {object} deps  { perSeasonTeamShares, teamShareTotals }
 * @returns {{ [metricId:string]: Array<{ season:number, value:number }> }}
 */
export function buildPositionStatSeries(playerId, position, careerStats, deps) {
  const { perSeasonTeamShares, teamShareTotals } = deps ?? {}
  const metrics = POSITION_STAT_METRICS[position] ?? []
  const result = {}
  for (const m of metrics) result[m] = []
  if (metrics.length === 0) return result

  const shareMetrics = metrics.filter(m => SHARE_FROM_SERIES.has(m))
  const countingMetrics = metrics.filter(m => !SHARE_FROM_SERIES.has(m))

  // perSeasonTeamShares entries are already gp>=8 gated and oldest→newest
  for (const entry of (perSeasonTeamShares?.[playerId] ?? [])) {
    if (!Number.isFinite(entry.share)) continue
    for (const m of shareMetrics) {
      result[m].push({ season: entry.season, value: entry.share })
    }
  }

  // Counting stats require gp>=QUALIFYING_GP
  if (careerStats && countingMetrics.length > 0) {
    const seasons = Object.keys(careerStats).map(Number).sort()
    for (const season of seasons) {
      const seasonData = careerStats[season]?.[playerId]
      if (!seasonData || (seasonData.gamesPlayed ?? 0) < QUALIFYING_GP) continue
      const seasonTeam = resolvePlayerTeam({ careerStats }, playerId, season)
      for (const m of countingMetrics) {
        const v = computeMetricValue(m, seasonData, { season, team: seasonTeam, teamShareTotals })
        if (v !== null && Number.isFinite(v)) {
          result[m].push({ season, value: v })
        }
      }
    }
  }

  return result
}

/**
 * Collapse one metric series into the cell summary.
 * @param {Array<{season,value}>} series  oldest->newest, already gp>=8 & finite
 * @param {number} eps  per-metric dead-band for direction (caller supplies)
 * @returns {null | {
 *   level:number, latestSeason:number,
 *   trend: null | { latest:number, prior:number, delta:number,
 *                   direction:'up'|'down'|'flat', latestSeason:number, priorSeason:number }
 * }}
 */
export function computeMetricSummary(series, eps) {
  if (!series || series.length === 0) return null
  const last = series[series.length - 1]
  if (series.length === 1) {
    return { level: last.value, latestSeason: last.season, trend: null }
  }
  const prior = series[series.length - 2]
  const delta = last.value - prior.value
  const deadBand = eps ?? 0
  const direction = delta > deadBand ? 'up' : delta < -deadBand ? 'down' : 'flat'
  return {
    level: last.value,
    latestSeason: last.season,
    trend: {
      latest: last.value,
      prior: prior.value,
      delta,
      direction,
      latestSeason: last.season,
      priorSeason: prior.season,
    },
  }
}
