/**
 * src/utils/projectionSignals.js — Veteran projection signal helpers.
 *
 * Byte-identical ports of the inline isBreakout / isBounceBack / isTdReliant
 * logic in dynastyScore.js (computeDynastyScore — "Special signals" and
 * "TD dependency signal" blocks). dynastyScore.js is intentionally left
 * untouched in this batch; a future task should refactor it to import these
 * so the duplicated logic cannot drift. Keep the thresholds and TD_STAT_KEYS
 * here identical to that file.
 */
import { interpolateAgeCurve } from './ageCurve'

// Identical to dynastyScore.js TD_STAT_KEYS.
const TD_STAT_KEYS = [
  'rush_td', 'rec_td', 'pass_td',
  'rush_2pt', 'rec_2pt', 'pass_2pt',
  'def_td', 'def_st_td', 'st_td', 'fum_rec_td',
]

/**
 * isBreakout: young player producing far above their age-expected level.
 * Mirrors dynastyScore.js: rawRatio = (currentPPG/peakPPG) / (expectedMedian/peakPPG).
 *
 * @param {number|null} age          player age
 * @param {number}      currentPPG   most recent qualifying season PPG
 * @param {Array}       curve        empirical age curve for the position
 * @param {number}      peakPPG      positionPeakPPG for the position (cancels out;
 *                                   pass `positionPeakPPG?.[position] ?? 20`)
 * @returns {boolean}
 */
export function computeBreakoutFlag(age, currentPPG, curve, peakPPG) {
  const expectedMedianPPG = age != null ? interpolateAgeCurve(curve, age) : peakPPG * 0.7
  const ageFactor = expectedMedianPPG / peakPPG
  const rawRatio  = ageFactor > 0 ? (currentPPG / peakPPG) / ageFactor : 0
  return age != null && age <= 24 && rawRatio > 1.3
}

/**
 * isBounceBack: the season before the most recent one was games-shortened
 * (< 10 GP) and the most recent season matched or beat prior career bests.
 * Mirrors dynastyScore.js. Note: `qualifying` only holds GP>=8 seasons, so the
 * "shortened" prior season is an 8–9 GP season (see Edge cases).
 *
 * @param {Array<{ppg:number, gamesPlayed:number}>} qualifying  oldest → newest
 * @returns {boolean}
 */
export function computeBounceBackFlag(qualifying) {
  if (!Array.isArray(qualifying) || qualifying.length < 2) return false
  const ppgs       = qualifying.map(s => s.ppg)
  const currentPPG = ppgs[ppgs.length - 1]
  const prevSeason = qualifying[qualifying.length - 2]
  if ((prevSeason.gamesPlayed ?? 0) >= 10) return false
  const priorMax      = Math.max(...ppgs.slice(0, -1))
  const secondHighest = [...ppgs].sort((a, b) => b - a)[1]   // copy — avoid mutating ppgs
  return currentPPG >= priorMax || currentPPG >= secondHighest
}

/**
 * isTdReliant: share of the most recent qualifying season's fantasy points
 * that came from TD / 2-pt stats exceeds 40%. Mirrors dynastyScore.js.
 *
 * @param {Object|undefined} stats           most recent qualifying season raw stats
 * @param {number|undefined} totalFP         that season's total fantasy points
 * @param {Object|null}      scoringSettings league scoring settings
 * @returns {{ tdDependency: number|null, isTdReliant: boolean }}
 *          tdDependency is null when it cannot be computed (no scoring settings
 *          or no stats) — a sentinel, distinct from a genuine 0.
 */
export function computeTdReliance(stats, totalFP, scoringSettings) {
  if (!scoringSettings || !stats) return { tdDependency: null, isTdReliant: false }
  let tdPoints = 0
  for (const key of TD_STAT_KEYS) {
    const statVal    = stats[key]
    const multiplier = scoringSettings[key]
    if (statVal != null && multiplier != null) tdPoints += statVal * multiplier
  }
  const tdDependency = tdPoints / Math.max(totalFP ?? 0, 1)
  return { tdDependency, isTdReliant: tdDependency > 0.40 }
}
