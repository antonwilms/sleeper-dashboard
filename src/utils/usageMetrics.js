/**
 * src/utils/usageMetrics.js — Snap-share & red-zone usage factors (D2).
 *
 * Two active PPG multipliers derived from a player's most recent qualifying
 * season, each normalised as a percentile within its position cohort (with
 * shrinkage toward neutral for low-sample players):
 *
 *   1. Snap share        — off_snp / tm_off_snp  (field-time signal)
 *   2. Own-rate RZ usage — position-specific RZ opportunity own-rate:
 *        RB    → rush_rz_att / rush_att
 *        WR/TE → rec_rz_tgt  / rec_tgt
 *        QB    → pass_rz_att / pass_att
 *
 * See .claude/tasks/projection-d2-snap-share-and-rz-usage.md.
 *
 * Modelled exactly on efficiencyMetrics.js (cohort table keyed by careerStats
 * identity, percentileRank + shrinkage-toward-50, NEUTRAL sentinel, single
 * clamp). Per the Thread-B precedent the tiny clamp / percentileRank helpers are
 * DUPLICATED here rather than imported from efficiencyMetrics.js (frozen).
 *
 * Primary-position only — position multiplicity (rushing QBs, receiving RBs) is
 * not modelled (C1/C3 precedent). QB is gated OUT of snap share: the data shows
 * QB snap share is near-constant (~0.95, p10 0.81), so it carries little signal
 * and would wrongly penalise injury-fill starters; QBs stay in scope for RZ
 * pass-rate (median 0.135 with meaningful variance).
 *
 * Older-season coverage: off_snp / tm_off_snp / *_rz_* are confirmed present in
 * the 2025 fixture; pre-2025 cached seasons may lack them. This degrades
 * gracefully — a player whose most-recent season lacks the fields gets a neutral
 * factor (null rate), and seasons missing the fields simply contribute nothing
 * to the cohort pool via the MIN-opportunity gate. The reference cohort is always
 * the max (most recent) season, which is current for any active player.
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Port of dynastyScore.js's private percentileRank — generic util, replicated
// per the Thread B precedent (helper modules duplicate small dynastyScore
// helpers rather than importing private symbols).
function percentileRank(sortedPool, value) {
  if (sortedPool.length === 0) return 50
  let below = 0
  for (const v of sortedPool) { if (v < value) below++ }
  return Math.round((below / sortedPool.length) * 100)
}

// ── Signal A: snap share ───────────────────────────────────────────────────
// RB / WR / TE only (QB gated out — see module header).
const SNAP_POSITIONS = new Set(['RB', 'WR', 'TE'])
const MIN_SNAP_OPPS  = 100   // off_snp ≥ 100 (≈ half-season) to enter the cohort
const SNAP_SHRINK_K  = 200   // shrinkage prior strength, in off_snp units

// ── Signal B: own-rate red-zone usage ──────────────────────────────────────
// Per-position config: `category` is the scored category, `rzKey` the RZ
// opportunity count, `oppKey` the opportunity denominator (also the shrinkage
// sample); `minOpp` (reuse C1 MIN_COHORT_OPPS) gates the cohort pool; `shrinkK`
// (reuse C1 shrinkage strengths) is the prior strength in opportunity units.
const RZ_CONFIG = {
  QB: { category: 'pass', rzKey: 'pass_rz_att', oppKey: 'pass_att', minOpp: 50, shrinkK: 80 },
  RB: { category: 'rush', rzKey: 'rush_rz_att', oppKey: 'rush_att', minOpp: 30, shrinkK: 40 },
  WR: { category: 'rec',  rzKey: 'rec_rz_tgt',  oppKey: 'rec_tgt',  minOpp: 20, shrinkK: 25 },
}
// TE uses the WR config; cohort pools are position-separate.
RZ_CONFIG.TE = RZ_CONFIG.WR

// Module-level cohort cache, keyed by careerStats identity (rebuilds only when
// careerStats is a new object — i.e. once per session). Mirrors efficiencyMetrics.js.
const cohortCache = { careerStats: null, table: null }

function buildUsageCohortTable(careerStats, playersMap) {
  const refSeason  = Math.max(...Object.keys(careerStats).map(Number))
  const seasonData = careerStats[refSeason] ?? {}
  const pools = {
    QB: { snap: [], rz: [] },   // QB.snap stays empty (gated out)
    RB: { snap: [], rz: [] },
    WR: { snap: [], rz: [] },
    TE: { snap: [], rz: [] },
  }
  for (const [pid, d] of Object.entries(seasonData)) {
    const pos = playersMap?.[pid]?.position
    const s   = d?.stats
    if (!s || !pools[pos]) continue

    // Snap share — RB/WR/TE only.
    if (SNAP_POSITIONS.has(pos)) {
      const snaps = s.off_snp    ?? 0
      const team  = s.tm_off_snp ?? 0
      if (snaps >= MIN_SNAP_OPPS && team > 0) pools[pos].snap.push(snaps / team)
    }

    // RZ own-rate — primary category per position.
    const rz = RZ_CONFIG[pos]
    if (rz) {
      const opp = s[rz.oppKey] ?? 0
      if (opp >= rz.minOpp) pools[pos].rz.push((s[rz.rzKey] ?? 0) / opp)
    }
  }
  for (const pos of Object.keys(pools)) {
    pools[pos].snap.sort((a, b) => a - b)
    pools[pos].rz.sort((a, b) => a - b)
  }
  return pools
}

function getUsageCohortTable(careerStats, playersMap) {
  if (cohortCache.careerStats !== careerStats) {
    cohortCache.careerStats = careerStats
    cohortCache.table = buildUsageCohortTable(careerStats, playersMap)
  }
  return cohortCache.table
}

/**
 * @param {string} position          'QB' | 'RB' | 'WR' | 'TE'
 * @param {Object|undefined} lastSeasonStats  raw .stats of the player's most
 *                                            recent qualifying season
 * @param {Object} careerStats
 * @param {Object} playersMap
 * @returns {{
 *   snapShare:       number|null,   // off_snp/tm_off_snp, 3dp; null when missing or QB
 *   snapShareFactor: number,        // multiplier [0.94, 1.06]; 1.0 when neutral
 *   rzUsageRate:     number|null,   // primary-category RZ own-rate, 3dp; null when missing
 *   rzUsageFactor:   number,        // multiplier [0.95, 1.05]; 1.0 when neutral
 *   rzUsageCategory: string|null,   // 'rush' | 'rec' | 'pass' | null
 * }}
 */
export function computeUsageFactors(position, lastSeasonStats, careerStats, playersMap) {
  const NEUTRAL = {
    snapShare: null, snapShareFactor: 1.0,
    rzUsageRate: null, rzUsageFactor: 1.0, rzUsageCategory: null,
  }
  if (!lastSeasonStats || !careerStats) return NEUTRAL
  const pools = getUsageCohortTable(careerStats, playersMap)[position]
  if (!pools) return NEUTRAL

  // ── Signal A — snap share (RB / WR / TE only) ─────────────────────────────
  let snapShare = null
  let snapShareFactor = 1.0
  if (SNAP_POSITIONS.has(position)) {
    const snaps = lastSeasonStats.off_snp    ?? null
    const team  = lastSeasonStats.tm_off_snp ?? null
    if (snaps != null && team != null && team > 0) {
      const raw = snaps / team
      if (isFinite(raw)) {
        snapShare = Math.round(raw * 1000) / 1000
        const pool = pools.snap ?? []
        const pct  = pool.length > 0 ? percentileRank(pool, raw) : 50
        // Shrink the percentile toward 50 (neutral) for low-snap players.
        const shrunkPct = (snaps * pct + SNAP_SHRINK_K * 50) / (snaps + SNAP_SHRINK_K)
        const index = (shrunkPct - 50) / 50          // [-1, 1]
        snapShareFactor = clamp(1 + index * 0.06, 0.94, 1.06)
      }
    }
  }

  // ── Signal B — own-rate red-zone usage (primary category) ─────────────────
  let rzUsageRate = null
  let rzUsageFactor = 1.0
  let rzUsageCategory = null
  const rz = RZ_CONFIG[position]
  if (rz) {
    const opp = lastSeasonStats[rz.oppKey] ?? null
    if (opp != null && opp > 0) {
      const raw = (lastSeasonStats[rz.rzKey] ?? 0) / opp
      if (isFinite(raw)) {
        rzUsageRate = Math.round(raw * 1000) / 1000
        rzUsageCategory = rz.category
        const pool = pools.rz ?? []
        const pct  = pool.length > 0 ? percentileRank(pool, raw) : 50
        const shrunkPct = (opp * pct + rz.shrinkK * 50) / (opp + rz.shrinkK)
        const index = (shrunkPct - 50) / 50
        rzUsageFactor = clamp(1 + index * 0.05, 0.95, 1.05)
      }
    }
  }

  return { snapShare, snapShareFactor, rzUsageRate, rzUsageFactor, rzUsageCategory }
}
