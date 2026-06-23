// view-only; never feeds projection/dynasty score; pure.
// Precedents:
//   share series = teamContext.computeHistoricalShares
//   latest-vs-prior delta convention = Profile Role-History "vs Prior" cell (PlayersTab.jsx:546-563)
//   cohort-percentile discipline = usageMetrics.js (percentileRank within position cohort, :40-45,71-104)

const SNAP_POSITIONS = new Set(['RB', 'WR', 'TE'])
// ±1pp dead-band — matches the Profile Role-History "vs Prior" thresholds
const TREND_EPS = 0.01
const MIN_COHORT = 6

// QB snap omitted: near-constant (~0.95), no signal — usageMetrics.js gates it out the same way

function r2(x) { return Math.round(x * 100) / 100 }
function r3(x) { return Math.round(x * 1000) / 1000 }

function quantile(sorted, q) {
  const idx = q * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function tertiles(pool) {
  if (pool.length < MIN_COHORT) return null
  const sorted = [...pool].sort((a, b) => a - b)
  return [quantile(sorted, 0.33), quantile(sorted, 0.67)]
}

/**
 * Per-season usage history for one player, oldest→newest.
 * Snap% derived from careerStats (no existing multi-season snap aggregator);
 * share REUSED from the precomputed historicalShares series (not recomputed).
 *
 * @param {string} playerId
 * @param {string} position         'QB'|'RB'|'WR'|'TE'
 * @param {Object} careerStats      { [season]: { [pid]: { gamesPlayed, fantasyPoints, stats:{off_snp,tm_off_snp} } } }
 * @param {Object} historicalShares { [pid]: [{ season, share, gamesPlayed }] }  (oldest→newest; RB/WR/TE; gp≥8)
 * @returns {Array<{ season:number, games:number, ppg:number,
 *                   snapPct:number|null, share:number|null, shareMetric:'carry'|'target'|null }>}
 */
export function buildUsageHistory(playerId, position, careerStats, historicalShares) {
  if (!careerStats) return []
  const seasons = Object.keys(careerStats).map(Number).sort()
  if (seasons.length === 0) return []

  const shareMetric = position === 'RB' ? 'carry'
    : (position === 'WR' || position === 'TE') ? 'target'
    : null

  const shareBySeason = new Map((historicalShares?.[playerId] ?? []).map(e => [e.season, e.share]))

  const result = []
  for (const season of seasons) {
    const d = careerStats[season]?.[playerId]
    if (!d || (d.gamesPlayed ?? 0) < 1) continue

    const games = d.gamesPlayed
    const ppg = d.gamesPlayed > 0 ? r2(d.fantasyPoints / d.gamesPlayed) : 0

    let snapPct = null
    if (SNAP_POSITIONS.has(position) && d.stats?.off_snp != null && d.stats?.tm_off_snp > 0) {
      snapPct = r3(d.stats.off_snp / d.stats.tm_off_snp)
    }

    // QB → always null (QBs are skipped in computeHistoricalShares)
    const share = shareMetric !== null ? (shareBySeason.get(season) ?? null) : null

    result.push({ season, games, ppg, snapPct, share, shareMetric })
  }

  return result
}

/**
 * Latest-vs-prior trend over one metric key. Only seasons where history[i][key] != null
 * are considered; needs ≥2 → else null (insufficient). Uniform shape for snapPct and share.
 * @param {Array} history  buildUsageHistory output (oldest→newest)
 * @param {'snapPct'|'share'} key
 * @returns {{ latest, prior, delta, direction:'up'|'down'|'flat', latestSeason, priorSeason } | null}
 */
export function computeUsageTrend(history, key) {
  const pts = (history ?? []).filter(h => h[key] != null)
  if (pts.length < 2) return null
  const a = pts[pts.length - 2], b = pts[pts.length - 1]
  const delta = b[key] - a[key]
  const direction = delta > TREND_EPS ? 'up' : delta < -TREND_EPS ? 'down' : 'flat'
  return { latest: b[key], prior: a[key], delta, direction, latestSeason: b.season, priorSeason: a.season }
}

/**
 * Position-cohort tertile cutoffs for most-recent snap% and most-recent share,
 * over the supplied per-player usage histories. Data-defined (tertiles), not
 * hand-picked — mirrors usageMetrics' percentile-within-cohort discipline.
 * @param {Array}  rows         relevant rows ({ player_id, position })
 * @param {Map}    usageByPlayer player_id → buildUsageHistory output (precomputed; avoids rebuild)
 * @returns {{ [pos]: { snap:[t33,t67]|null, share:[t33,t67]|null } }}  null pool when <MIN_COHORT (=6)
 */
export function buildRoleCohort(rows, usageByPlayer) {
  const pools = {}
  for (const row of rows) {
    const pos = row.position
    if (!['RB', 'WR', 'TE'].includes(pos)) continue
    if (!pools[pos]) pools[pos] = { snap: [], share: [] }
    const h = usageByPlayer.get(row.player_id)
    if (!h || h.length === 0) continue

    let latestSnap = null, latestShare = null
    for (let i = h.length - 1; i >= 0; i--) {
      if (latestSnap === null && h[i].snapPct != null) latestSnap = h[i].snapPct
      if (latestShare === null && h[i].share != null) latestShare = h[i].share
      if (latestSnap !== null && latestShare !== null) break
    }

    if (latestSnap !== null) pools[pos].snap.push(latestSnap)
    if (latestShare !== null) pools[pos].share.push(latestShare)
  }

  const cohort = {}
  for (const pos of ['RB', 'WR', 'TE']) {
    cohort[pos] = {
      snap: pools[pos] ? tertiles(pools[pos].snap) : null,
      share: pools[pos] ? tertiles(pools[pos].share) : null,
    }
  }
  return cohort
}

/**
 * Descriptive role label from the player's MOST-RECENT snap% + share, banded against
 * the cohort tertiles. Purely descriptive (not advice). null (→ '—') for QB, missing
 * share, or an unbanded (thin) cohort.
 * @returns {string|null}
 */
export function classifyRole({ position, snapPct, share }, cohort) {
  if (position === 'QB' || share == null) return null
  if (!['RB', 'WR', 'TE'].includes(position)) return null
  const c = cohort?.[position]
  if (!c || !c.share) return null

  const [c33, c67] = c.share
  // snap 67th-percentile cutoff — used for the top-band qualifier only
  const s67 = c.snap?.[1] ?? null

  if (position === 'RB') {
    if (share >= c67 && snapPct != null && s67 != null && snapPct >= s67) return 'Every-down back'
    if (share >= c67) return 'Lead back'
    if (share >= c33) return 'Committee back'
    return 'Rotational back'
  } else {
    if (share >= c67 && snapPct != null && s67 != null && snapPct >= s67) return 'Every-down'
    if (share >= c67) return 'Primary target'
    if (share >= c33) return 'Secondary target'
    return 'Rotational'
  }
}
