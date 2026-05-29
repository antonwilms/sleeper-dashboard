/**
 * src/utils/efficiencyMetrics.js — Per-opportunity efficiency factor.
 *
 * Computes efficiency metrics from a player's most recent qualifying
 * season, normalises each as a percentile within its position cohort (with
 * shrinkage toward neutral for low-sample players), and aggregates them into a
 * single efficiencyFactor multiplier for the season projection.
 *
 * See .claude/tasks/projection-c1-efficiency-metrics.md.
 *
 * Primary-position only — position multiplicity (rushing QBs, receiving RBs,
 * multi-role WRs) is not modelled here. Deliberate C1 simplification; see Q3.
 *
 * QB INT%: stat key is `pass_int` (interceptions thrown), verified present in
 * cached Sleeper season-totals data. Lower INT% is better — the metric is
 * inverted in the composite (invert: true).
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

// Per-position metric config. `ratio(s)` computes the raw metric from a season
// stats object; `oppKey` is the opportunity denominator (also the shrinkage
// sample); `shrinkK` is the shrinkage prior strength in opportunity units;
// `invert` flags metrics where lower is better (INT%).
//
const POSITION_METRICS = {
  QB: [
    { name: 'ypa',        weight: 0.55, oppKey: 'pass_att', shrinkK: 80, invert: false, ratio: s => (s.pass_yd  ?? 0) / (s.pass_att ?? 0) },
    { name: 'passTdRate', weight: 0.20, oppKey: 'pass_att', shrinkK: 80, invert: false, ratio: s => (s.pass_td  ?? 0) / (s.pass_att ?? 0) },
    { name: 'intRate',    weight: 0.25, oppKey: 'pass_att', shrinkK: 80, invert: true,  ratio: s => (s.pass_int ?? 0) / (s.pass_att ?? 0) },
  ],
  RB: [
    { name: 'ypc',        weight: 0.80, oppKey: 'rush_att', shrinkK: 40, invert: false, ratio: s => (s.rush_yd ?? 0) / (s.rush_att ?? 0) },
    { name: 'rushTdRate', weight: 0.20, oppKey: 'rush_att', shrinkK: 40, invert: false, ratio: s => (s.rush_td ?? 0) / (s.rush_att ?? 0) },
  ],
  WR: [
    { name: 'ypt',        weight: 0.45, oppKey: 'rec_tgt', shrinkK: 25, invert: false, ratio: s => (s.rec_yd ?? 0) / (s.rec_tgt ?? 0) },
    { name: 'catchRate',  weight: 0.25, oppKey: 'rec_tgt', shrinkK: 25, invert: false, ratio: s => (s.rec ?? 0) / (s.rec_tgt ?? 0) },
    { name: 'ypr',        weight: 0.10, oppKey: 'rec',     shrinkK: 15, invert: false, ratio: s => (s.rec_yd ?? 0) / (s.rec ?? 0) },
    { name: 'recTdRate',  weight: 0.20, oppKey: 'rec_tgt', shrinkK: 25, invert: false, ratio: s => (s.rec_td ?? 0) / (s.rec_tgt ?? 0) },
  ],
  // TE uses the WR metric set & weights; cohort pools are position-separate.
}
POSITION_METRICS.TE = POSITION_METRICS.WR

// Minimum opportunities for a player-season to enter a cohort pool (keeps
// pure-noise scrubs out of the percentile reference).
const MIN_COHORT_OPPS = { pass_att: 50, rush_att: 30, rec_tgt: 20, rec: 12 }

// Module-level cohort cache, keyed by careerStats identity (rebuilds only when
// careerStats is a new object — i.e. once per session). Mirrors careerComps.js.
const cohortCache = { careerStats: null, table: null }

function buildCohortTable(careerStats, playersMap) {
  const refSeason  = Math.max(...Object.keys(careerStats).map(Number))
  const seasonData = careerStats[refSeason] ?? {}
  const pools = {
    QB: { ypa: [], passTdRate: [], intRate: [] },
    RB: { ypc: [], rushTdRate: [] },
    WR: { ypt: [], ypr: [], catchRate: [], recTdRate: [] },
    TE: { ypt: [], ypr: [], catchRate: [], recTdRate: [] },
  }
  for (const [pid, d] of Object.entries(seasonData)) {
    const pos = playersMap?.[pid]?.position
    const s   = d?.stats
    if (!s || !pools[pos]) continue
    if (pos === 'QB') {
      const att = s.pass_att ?? 0
      if (att >= MIN_COHORT_OPPS.pass_att) {
        pools.QB.ypa.push((s.pass_yd  ?? 0) / att)
        pools.QB.passTdRate.push((s.pass_td  ?? 0) / att)
        pools.QB.intRate.push((s.pass_int ?? 0) / att)
      }
    } else if (pos === 'RB') {
      const car = s.rush_att ?? 0
      if (car >= MIN_COHORT_OPPS.rush_att) {
        pools.RB.ypc.push((s.rush_yd ?? 0) / car)
        pools.RB.rushTdRate.push((s.rush_td ?? 0) / car)
      }
    } else { // WR or TE
      const tgt = s.rec_tgt ?? 0
      const rec = s.rec ?? 0
      if (tgt >= MIN_COHORT_OPPS.rec_tgt) {
        pools[pos].ypt.push((s.rec_yd ?? 0) / tgt)
        pools[pos].catchRate.push(rec / tgt)
        pools[pos].recTdRate.push((s.rec_td ?? 0) / tgt)
      }
      if (rec >= MIN_COHORT_OPPS.rec) pools[pos].ypr.push((s.rec_yd ?? 0) / rec)
    }
  }
  for (const pos of Object.keys(pools)) {
    for (const m of Object.keys(pools[pos])) pools[pos][m].sort((a, b) => a - b)
  }
  return pools
}

function getCohortTable(careerStats, playersMap) {
  if (cohortCache.careerStats !== careerStats) {
    cohortCache.careerStats = careerStats
    cohortCache.table = buildCohortTable(careerStats, playersMap)
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
 *   efficiencyFactor: number,            // 0.90–1.10
 *   efficiencyIndex:  number|null,       // [-1, 1] aggregate; null if no metrics
 *   efficiencyMetrics: Object|null,      // { [metricName]: rawValue|null }; null if none
 * }}
 */
export function computeEfficiencyFactor(position, lastSeasonStats, careerStats, playersMap) {
  const NEUTRAL = { efficiencyFactor: 1.0, efficiencyIndex: null, efficiencyMetrics: null }
  const config = POSITION_METRICS[position]
  if (!config || !lastSeasonStats || !careerStats) return NEUTRAL

  const pools = getCohortTable(careerStats, playersMap)[position] ?? {}

  const rawMetrics = {}
  const available  = []
  for (const m of config) {
    const opps = lastSeasonStats[m.oppKey] ?? 0
    if (opps <= 0) { rawMetrics[m.name] = null; continue }
    const raw = m.ratio(lastSeasonStats)
    if (!isFinite(raw)) { rawMetrics[m.name] = null; continue }
    rawMetrics[m.name] = Math.round(raw * 1000) / 1000

    const pool = pools[m.name] ?? []
    const pct  = pool.length > 0 ? percentileRank(pool, raw) : 50
    // Shrink the percentile toward 50 (neutral) for low-sample players.
    const shrunkPct = (opps * pct + m.shrinkK * 50) / (opps + m.shrinkK)
    let sub = (shrunkPct - 50) / 50          // [-1, 1]
    if (m.invert) sub = -sub
    available.push({ weight: m.weight, sub })
  }

  if (available.length === 0) return NEUTRAL

  const wSum = available.reduce((a, x) => a + x.weight, 0)
  const efficiencyIndex = available.reduce((a, x) => a + (x.weight / wSum) * x.sub, 0)
  const efficiencyFactor = clamp(1 + efficiencyIndex * 0.10, 0.90, 1.10)

  return { efficiencyFactor, efficiencyIndex, efficiencyMetrics: rawMetrics }
}
