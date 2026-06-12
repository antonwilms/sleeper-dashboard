/**
 * src/utils/teamRzShare.js — Team-aggregated red-zone share factor (D3).
 *
 * A player's RZ opportunities ÷ their team's total RZ opportunities.
 * Distinct from D2's own-rate RZ usage (player RZ opps ÷ own opps):
 *   corr(own-rate, team-RZ-share) ≈ 0.39 → genuinely independent dimensions.
 *
 * Empirical validation (2012–2025, 14 seasons):
 *   - Standardized partial β vs next-season PPG: +0.20 (RB), +0.17 (WR/TE)
 *     after controlling for own-rate, overall share, and snap share.
 *   - Monotonic quintile response: both RB and WR/TE step up every quintile.
 *   - Own-rate's own partial β is *negative* in the same model → team-share
 *     carries the RZ predictive signal that own-rate does not.
 *
 * Normalization: cohort-percentile + shrinkage-to-50 (D2 pattern).
 * Magnitude: ±5%, [0.95, 1.05], neutral 1.0.
 * QB: gated out (starter owns ~100% of team RZ pass attempts → ~zero discrimination).
 *
 * See .claude/tasks/projection-team-rz-share.md for full empirical justification.
 *
 * Modelled on usageMetrics.js — cohort table keyed by careerStats identity,
 * percentileRank + shrinkage-toward-50, NEUTRAL sentinel, single clamp.
 * Per the Thread-B precedent the tiny helpers are duplicated here rather than
 * imported from other frozen modules.
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function percentileRank(sortedPool, value) {
  if (sortedPool.length === 0) return 50
  let below = 0
  for (const v of sortedPool) { if (v < value) below++ }
  return Math.round((below / sortedPool.length) * 100)
}

// ── Per-position config ────────────────────────────────────────────────────────
// rzKey    : player's RZ opportunity stat key
// oppKey   : player opportunity gate denominator (same as D2 own-rate)
// denomKey : key in historicalTeamTotals[season][team] for the team denominator
// minOpp   : player opportunity gate (mirrors D2 / C1 MIN_COHORT_OPPS per position)
// shrinkK  : shrinkage prior strength in opportunity units (reuses D2 values)
const RZ_SHARE_CONFIG = {
  RB: { category: 'rush', rzKey: 'rush_rz_att', oppKey: 'rush_att', denomKey: 'rushRz', minOpp: 30, shrinkK: 40 },
  WR: { category: 'rec',  rzKey: 'rec_rz_tgt',  oppKey: 'rec_tgt',  denomKey: 'recRz',  minOpp: 20, shrinkK: 25 },
}
// TE uses the WR config; cohort pools are position-separate.
RZ_SHARE_CONFIG.TE = RZ_SHARE_CONFIG.WR

// Minimum team denominator: guards against retired-player undercount noise.
// From 2024 distribution: min legit team ≈ 24 rec, 10 rush — floor 20 handles both.
const MIN_TEAM_DENOM = 20

// Module-level cohort cache, keyed by careerStats identity (rebuilds only when
// careerStats is a new object — i.e. once per session). Mirrors usageMetrics.js.
// Keyed by careerStats identity; also reads historicalTeamTotals — correctness assumes it only changes together with careerStats.
const cohortCache = { careerStats: null, table: null }

/**
 * Build the cohort table for the reference (most-recent) season.
 * For each qualifying player (opp ≥ minOpp, team denom ≥ MIN_TEAM_DENOM),
 * compute their team-RZ-share and add it to the position pool.
 */
function buildCohortTable(careerStats, playersMap, historicalTeamTotals) {
  const refSeason  = Math.max(...Object.keys(careerStats).map(Number))
  const seasonData = careerStats[refSeason] ?? {}
  const teamTotals = historicalTeamTotals?.[refSeason] ?? {}

  const pools = { RB: [], WR: [], TE: [] }

  for (const [pid, d] of Object.entries(seasonData)) {
    const pos = playersMap?.[pid]?.position
    const cfg = RZ_SHARE_CONFIG[pos]
    if (!cfg) continue
    const s = d?.stats
    if (!s) continue

    const opp   = s[cfg.oppKey] ?? 0
    if (opp < cfg.minOpp) continue

    const team  = playersMap[pid]?.team
    if (!team) continue
    const denom = teamTotals[team]?.[cfg.denomKey] ?? 0
    if (denom < MIN_TEAM_DENOM) continue

    const share = (s[cfg.rzKey] ?? 0) / denom
    if (!isFinite(share)) continue
    pools[pos].push(share)
  }

  for (const pos of Object.keys(pools)) {
    pools[pos].sort((a, b) => a - b)
  }
  return pools
}

function getCohortTable(careerStats, playersMap, historicalTeamTotals) {
  if (cohortCache.careerStats !== careerStats) {
    cohortCache.careerStats = careerStats
    cohortCache.table = buildCohortTable(careerStats, playersMap, historicalTeamTotals)
  }
  return cohortCache.table
}

/**
 * Compute the team-aggregated red-zone share factor (D3).
 *
 * @param {string}      position            'QB' | 'RB' | 'WR' | 'TE'
 * @param {Object|null} lastSeasonStats     raw .stats of the player's most-recent qualifying season
 * @param {number}      season              the season of lastSeasonStats (= lastQ.season)
 * @param {string|null} playerTeam          player's current team abbreviation
 * @param {Object|null} historicalTeamTotals  { [season]: { [team]: { rushRz, recRz, … } } }
 * @param {Object}      careerStats         full career stats (for cohort building)
 * @param {Object}      playersMap          { [player_id]: SleeperPlayer }
 * @returns {{
 *   teamRzShare:         number|null,   // player's RZ opps / team RZ total, 3dp; null when neutral
 *   teamRzShareFactor:   number,        // multiplier [0.95, 1.05]; 1.0 when neutral
 *   teamRzShareCategory: 'rush'|'rec'|null
 * }}
 */
export function computeTeamRzShareFactor(
  position, lastSeasonStats, season, playerTeam,
  historicalTeamTotals, careerStats, playersMap,
) {
  const NEUTRAL = { teamRzShare: null, teamRzShareFactor: 1.0, teamRzShareCategory: null }

  // QB gated out: one passer per team → ~100% of team RZ pass opps → zero discrimination.
  const cfg = RZ_SHARE_CONFIG[position]
  if (!cfg) return NEUTRAL

  if (!lastSeasonStats || !careerStats) return NEUTRAL
  if (!playerTeam || !historicalTeamTotals) return NEUTRAL

  const teamTotals = historicalTeamTotals[season]
  if (!teamTotals) return NEUTRAL

  const teamEntry = teamTotals[playerTeam]
  if (!teamEntry) return NEUTRAL

  const denom = teamEntry[cfg.denomKey] ?? 0
  if (denom < MIN_TEAM_DENOM) return NEUTRAL

  const opp = lastSeasonStats[cfg.oppKey] ?? 0
  if (opp < cfg.minOpp) return NEUTRAL

  const own   = lastSeasonStats[cfg.rzKey] ?? 0
  const share = own / denom
  if (!isFinite(share)) return NEUTRAL

  // Cohort percentile + shrinkage
  const pool     = getCohortTable(careerStats, playersMap, historicalTeamTotals)[position] ?? []
  const pct      = pool.length > 0 ? percentileRank(pool, share) : 50
  const shrunkPct = (opp * pct + cfg.shrinkK * 50) / (opp + cfg.shrinkK)
  const index    = (shrunkPct - 50) / 50                        // [-1, 1]
  const factor   = clamp(1 + index * 0.05, 0.95, 1.05)

  return {
    teamRzShare:         Math.round(share * 1000) / 1000,
    teamRzShareFactor:   Math.round(factor * 1000) / 1000,
    teamRzShareCategory: cfg.category,
  }
}
