/**
 * src/utils/projectionSignals.js — Shared veteran projection signal helpers.
 *
 * Single source of truth for isBreakout / isBounceBack / isTdReliant; imported
 * by both dynastyScore.js and seasonProjection.js (Step 5c). Bounce-back
 * definition corrected per audit D1-A / F2-C (2026-06-12): down year is now
 * the calendar season immediately before the current qualifying season, and
 * sub-8-GP injury years are visible via classifyInjurySeason.
 */
import { interpolateAgeCurve } from './ageCurve'
import { classifyInjurySeason } from './durabilitySignals'

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
 * isBounceBack: the calendar season immediately before the current qualifying
 * season (`downSeason = current.season − 1`) was a genuine down year, AND the
 * current season matched or beat the best PPG over all prior qualifying seasons.
 *
 * Down-year conditions (exactly one must hold):
 *   (a) The previous qualifying entry IS `downSeason` and has gamesPlayed < 10
 *       (8–9 GP shortened qualifying season). No injury-evidence gate — an 8–9 GP
 *       qualifying season is a meaningful-sample contributor season by construction.
 *   (b) `careerStats[downSeason][playerId]` exists with gamesPlayed < 8 AND
 *       `classifyInjurySeason` returns true (base trigger + contributor evidence;
 *       backup-noise seasons and 0-GP full-IR without adjacent rescue are excluded).
 *       This makes sub-8-GP injury years — including 0-GP full-IR — visible (F2-C).
 *
 * Recovery: `current.ppg >= priorMax` where `priorMax` is the max PPG over all
 * qualifying seasons except the current one (D1-A: never include current season
 * in its own baseline).
 *
 * Requires ≥ 2 qualifying seasons (≥ 1 prior for the priorMax baseline).
 *
 * @param {Array<{season:number, ppg:number, gamesPlayed:number}>} qualifying  oldest → newest, GP ≥ 8
 * @param {Object} careerStats  full careerStats (all seasons incl. sub-8-GP)
 * @param {string} playerId
 * @param {string} position
 * @returns {boolean}
 */
export function computeBounceBackFlag(qualifying, careerStats, playerId, position) {
  if (!Array.isArray(qualifying) || qualifying.length < 2) return false

  const current  = qualifying[qualifying.length - 1]
  const priors   = qualifying.slice(0, -1)
  const priorMax = Math.max(...priors.map(s => s.ppg))

  const downSeason = current.season - 1
  const prevQ      = priors[priors.length - 1]

  // (a) the immediately-preceding season was a games-shortened (8–9 GP) qualifying season
  const shortQualifyingPrior =
    prevQ.season === downSeason && (prevQ.gamesPlayed ?? 0) < 10

  // (b) F2-C: the immediately-preceding season was a sub-8-GP (incl. 0-GP full-IR)
  //     season classified as a genuine injury season (contributor evidence in it
  //     or an adjacent season — see durabilitySignals.js; backup noise excluded).
  const downEntry = careerStats?.[downSeason]?.[playerId]
  const subQualifyingInjury =
    downEntry != null &&
    (downEntry.gamesPlayed ?? 0) < 8 &&
    classifyInjurySeason(careerStats, playerId, position, downSeason)

  if (!shortQualifyingPrior && !subQualifyingInjury) return false

  // Recovery: current PPG matched/beat the best PRIOR qualifying season (D1-A:
  // priors only — never include the current season in its own baseline).
  return current.ppg >= priorMax
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
