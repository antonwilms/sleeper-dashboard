// view-only; never feeds projectedPPG, dynasty score, or any factors entry; pure

export const QUALIFYING_GP        = 8   // season counts toward the window (matches dynastyScore.js)
export const WINDOW_SEASONS       = 3   // pool the last N qualifying seasons
export const MIN_POOLED_GAMES     = 10  // pooled finite games needed for an inline SD
export const PER_SEASON_MIN_GAMES = 8   // a season needs this many finite games for its own SD/CV

const BOOM_MULT = 1.5
const BUST_MULT = 0.5

/**
 * Finite per-game fantasy points for one season, from careerStats[season][id].weeklyPoints.
 * weeklyPoints is an object keyed by week ({"1":12.3,…}); Object.values handles object or array.
 * @param {object|undefined} seasonData  careerStats[season][playerId]
 * @returns {number[]}  finite per-game points (may be empty); never throws
 */
export function extractGamePoints(seasonData) {
  const wp = seasonData?.weeklyPoints
  if (!wp) return []
  return Object.values(wp).filter(Number.isFinite)
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
 * One season's distribution. Null-safe.
 * @param {object|undefined} seasonData
 * @returns {{ games:number, mean:number|null, sd:number|null, cv:number|null }}
 */
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
