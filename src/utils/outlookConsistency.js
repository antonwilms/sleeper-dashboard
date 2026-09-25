// view-only; never feeds projectedPPG, dynasty score, or any factors entry; pure

export const QUALIFYING_GP        = 8   // season counts toward the window (matches dynastyScore.js)
export const WINDOW_SEASONS       = 3   // pool the last N qualifying seasons
export const MIN_POOLED_GAMES     = 10  // pooled finite games needed for an inline SD
export const PER_SEASON_MIN_GAMES = 8   // a season needs this many finite games for its own SD/CV

const BOOM_MULT = 1.5
const BUST_MULT = 0.5

/**
 * Finite per-game fantasy points for one season, from careerStats[season][id].weeklyPoints — the
 * SCALED series (league/half-PPR ratio applied). For aggregates that sit beside league-basis
 * season figures; a surface that DISPLAYS individual weeks uses extractDisplayGamePoints instead.
 * weeklyPoints is an object keyed by week ({"1":12.3,…}); Object.values handles object or array.
 * @param {object|undefined} seasonData  careerStats[season][playerId]
 * @returns {number[]}  finite per-game points (may be empty); never throws
 */
// PROVISIONAL(heuristic): per-game points over weeklyPoints scaled by each season's league/half-PPR ratio · an aggregate shown beside league-basis PPG, so it must stay on the league basis, and the store has no per-week league values · per-week scoring keys in season-totals (D-47)
export function extractGamePoints(seasonData) {
  const wp = seasonData?.weeklyPoints
  if (!wp) return []
  return Object.values(wp).filter(Number.isFinite)
}

/**
 * The weekly series a surface that DISPLAYS individual weeks should render, and its basis.
 * weekly-points-display-basis.md §2.1. Never feeds an aggregate that must match a league-basis
 * season total — those read seasonData.weeklyPoints (scaled) via extractGamePoints.
 * @returns {{ weeklyPoints: object|Array|null, basis: 'half_ppr'|'league'|null }}
 */
export function resolveDisplayWeeklyPoints(seasonData) {
  if (seasonData == null || typeof seasonData !== 'object') return { weeklyPoints: null, basis: null }
  if (seasonData.sourceWeeklyPoints !== undefined) {
    const src = seasonData.sourceWeeklyPoints
    if (seasonData.sourceScoringBasis === 'half_ppr') return { weeklyPoints: src, basis: 'half_ppr' }
    if (seasonData.sourceScoringBasis === null) return { weeklyPoints: src, basis: 'league' }
    return { weeklyPoints: null, basis: null }
  }
  if (seasonData.scoringBasis === 'half_ppr') {
    return { weeklyPoints: seasonData.weeklyPoints ?? null, basis: 'half_ppr' }
  }
  return { weeklyPoints: null, basis: null }
}

/** Finite display-series points for one season, plus its basis (resolver over extractable values). */
export function extractDisplayGamePoints(seasonData) {
  const { weeklyPoints, basis } = resolveDisplayWeeklyPoints(seasonData)
  if (!weeklyPoints) return { points: [], basis }
  return { points: Object.values(weeklyPoints).filter(Number.isFinite), basis }
}

function mean(xs) {
  if (!xs.length) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

// Population SD (÷ N): describes the realized spread of this fixed set of observed games,
// not an estimate of a larger population parameter.
function populationStdDev(xs, m) {
  if (!xs.length) return null
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length)
}

/**
 * Mean / population SD / CV over an arbitrary finite point list. sd is null below
 * MIN_POOLED_GAMES (the same floor computeConsistency applies to its pooled SD); cv null when
 * sd is null or mean ≤ 0.
 * @param {number[]} points
 * @returns {{ games:number, mean:number|null, sd:number|null, cv:number|null }}
 */
export function summarizeGamePoints(points) {
  const games = points.length
  const m = mean(points)
  const sd = games >= MIN_POOLED_GAMES ? populationStdDev(points, m) : null
  const cv = (sd != null && m > 0) ? sd / m : null
  return { games, mean: m, sd, cv }
}

/**
 * One season's distribution. Null-safe.
 * @param {object|undefined} seasonData
 * @returns {{ games:number, mean:number|null, sd:number|null, cv:number|null }}
 */
// Its cv is invariant under a uniform per-season scale (scaled and source series agree); the
// pooled cv in computeConsistency is not, when the window's seasons have different ratios.
export function computeSeasonConsistency(seasonData) {
  const pts = extractGamePoints(seasonData)
  const games = pts.length
  const m = mean(pts)
  const sd = games >= PER_SEASON_MIN_GAMES ? populationStdDev(pts, m) : null
  const cv = (sd != null && m > 0) ? sd / m : null
  return { games, mean: m, sd, cv }
}

/**
 * Pooled distribution over a player's last WINDOW_SEASONS qualifying (gp>=QUALIFYING_GP) seasons.
 * @param {object|null} careerStats  { [season]: { [pid]: { gamesPlayed, weeklyPoints, ... } } }
 * @param {string} playerId
 * @returns {null | {
 *   window: number, pooledGames: number, mean: number|null, sd: number|null,
 *   cv: number|null, boomRate: number|null, bustRate: number|null,
 *   seasons: Array<{ season:number, games:number, mean:number|null, sd:number|null, cv:number|null }>
 * }}
 */
export function computeConsistency(careerStats, playerId) {
  if (!careerStats) return null

  const allSeasons = Object.keys(careerStats).map(Number).sort((a, b) => b - a)

  const windowSeasons = []
  for (const s of allSeasons) {
    if (windowSeasons.length >= WINDOW_SEASONS) break
    const gp = careerStats[s]?.[playerId]?.gamesPlayed ?? 0
    if (gp >= QUALIFYING_GP) windowSeasons.push(s)
  }

  if (windowSeasons.length === 0) return null

  const seasons = []
  const pooled = []
  for (const s of windowSeasons) {
    const sd = careerStats[s][playerId]
    seasons.push({ season: s, ...computeSeasonConsistency(sd) })
    for (const v of extractGamePoints(sd)) pooled.push(v)
  }

  const pooledGames = pooled.length
  const m = mean(pooled)
  const sd = pooledGames >= MIN_POOLED_GAMES ? populationStdDev(pooled, m) : null
  const cv = (sd != null && m > 0) ? sd / m : null

  let boomRate = null
  let bustRate = null
  if (sd != null && m > 0) {
    boomRate = pooled.filter(x => x >= BOOM_MULT * m).length / pooledGames
    bustRate = pooled.filter(x => x <= BUST_MULT * m).length / pooledGames
  }

  return { window: windowSeasons.length, pooledGames, mean: m, sd, cv, boomRate, bustRate, seasons }
}
