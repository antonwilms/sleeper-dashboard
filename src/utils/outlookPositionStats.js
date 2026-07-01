// view-only; never feeds projectedPPG, dynasty score, or any factors entry; pure

import { QUALIFYING_GP } from './outlookConsistency.js'
import { passerRating } from './efficiencyMetrics.js'
import { computeSeasonAverages } from './nflStats.js'

// Metric ids per position. TE aliases WR.
export const POSITION_STAT_METRICS = {
  QB: ['cmpPct', 'passerRating', 'sacks'],
  RB: ['rushShare', 'rbTargetShare', 'yardsPerCarry'],
  WR: ['targetShare', 'airYardsShare', 'aDOT'],
}
POSITION_STAT_METRICS.TE = POSITION_STAT_METRICS.WR

// Which metric ids read the reused historicalShares series (vs careerStats counting).
const SHARE_FROM_HISTORICAL = new Set(['rushShare', 'targetShare'])

/**
 * View-only team receiving denominators per season. Mirrors
 * computeHistoricalTeamTotals (teamContext.js:191) EXACTLY — gamesPlayed>=1 players,
 * current-team attribution via playerMap[pid].team — and additionally sums rec_air_yd.
 * Used as the denominator for RB target share and WR/TE air-yards share (correct
 * team-total shares, never per-game-share averages). Never feeds projection/scoring.
 * Note: team-changer's prior-season share is measured against current team (current-team
 * attribution mirrors computeHistoricalTeamTotals; per-season-team is a future refinement).
 * @returns {{ [season:number]: { [team:string]: { recTgt:number, recAirYd:number } } }}
 */
export function buildTeamReceivingTotals(careerStats, playerMap) {
  const result = {}
  if (!careerStats || !playerMap) return result
  for (const [seasonStr, seasonData] of Object.entries(careerStats)) {
    const season = Number(seasonStr)
    const teams = {}
    for (const [pid, data] of Object.entries(seasonData)) {
      if (!data || (data.gamesPlayed ?? 0) < 1) continue
      const team = playerMap[pid]?.team
      if (!team) continue
      const s = data.stats ?? {}
      const recTgt = s.rec_tgt ?? 0
      const recAirYd = s.rec_air_yd ?? 0
      if (!teams[team]) teams[team] = { recTgt: 0, recAirYd: 0 }
      teams[team].recTgt += recTgt
      teams[team].recAirYd += recAirYd
    }
    result[season] = teams
  }
  return result
}

/**
 * Compute a single metric value for one player-season from counting components.
 * Returns number|null. Never returns NaN.
 * @private
 */
function computeMetricValue(id, seasonData, { season, team, teamReceivingTotals }) {
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
    const denom = teamReceivingTotals?.[season]?.[team]?.recTgt ?? 0
    if (denom <= 0) return null
    const v = Math.round((tgt / denom) * 1000) / 1000
    return Number.isFinite(v) ? v : null
  }
  if (id === 'airYardsShare') {
    const airYd = s.rec_air_yd ?? 0
    if (airYd <= 0 || !team) return null
    const denom = teamReceivingTotals?.[season]?.[team]?.recAirYd ?? 0
    if (denom <= 0) return null
    const v = Math.round((airYd / denom) * 1000) / 1000
    return Number.isFinite(v) ? v : null
  }
  return null
}

/**
 * Per-metric per-season series for one player, oldest->newest, gp>=QUALIFYING_GP and
 * finite-value only. Rates recomputed from counting components (never stored rate keys).
 * rushShare/targetShare REUSE historicalShares (identical to the Opp-trend series);
 * rbTargetShare/airYardsShare use teamReceivingTotals; cmpPct via computeSeasonAverages;
 * passerRating via efficiencyMetrics.passerRating; yardsPerCarry/aDOT via direct division;
 * sacks = stats.pass_sack count.
 * @param {string} playerId
 * @param {'QB'|'RB'|'WR'|'TE'} position
 * @param {object} careerStats
 * @param {object} deps  { historicalShares, teamReceivingTotals, playerMap }
 * @returns {{ [metricId:string]: Array<{ season:number, value:number }> }}
 */
export function buildPositionStatSeries(playerId, position, careerStats, deps) {
  const { historicalShares, teamReceivingTotals, playerMap } = deps ?? {}
  const metrics = POSITION_STAT_METRICS[position] ?? []
  const result = {}
  for (const m of metrics) result[m] = []
  if (metrics.length === 0) return result

  const team = playerMap?.[playerId]?.team ?? null
  const shareMetrics = metrics.filter(m => SHARE_FROM_HISTORICAL.has(m))
  const countingMetrics = metrics.filter(m => !SHARE_FROM_HISTORICAL.has(m))

  // historicalShares entries are already gp>=8 gated and oldest→newest
  for (const entry of (historicalShares?.[playerId] ?? [])) {
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
      for (const m of countingMetrics) {
        const v = computeMetricValue(m, seasonData, { season, team, teamReceivingTotals })
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
