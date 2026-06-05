/**
 * src/utils/momentum.js — Multi-season production-momentum signal.
 *
 * Compares the most recent two-season average PPG against the prior
 * two-season average, normalised by mean PPG.
 *
 * Single source of truth: both dynastyScore.js (computeDynastyScore) and
 * seasonProjection.js (Step 5) import computeMomentum from this module.
 */

/**
 * @param {number[]} ppgs    PPG per qualifying season, oldest → newest
 *                           (a qualifying season = gamesPlayed >= 8).
 * @param {number}   meanPPG Mean of all qualifying-season PPGs.
 * @returns {{ momentum: number|null, momentumLabel: string|null }}
 *          Both null when fewer than 4 qualifying seasons exist.
 */
export function computeMomentum(ppgs, meanPPG) {
  if (!Array.isArray(ppgs) || ppgs.length < 4) {
    return { momentum: null, momentumLabel: null }
  }
  const n = ppgs.length
  const recentAvg = (ppgs[n - 1] + ppgs[n - 2]) / 2
  const priorAvg  = (ppgs[n - 3] + ppgs[n - 4]) / 2
  const momentum  = (recentAvg - priorAvg) / Math.max(meanPPG, 1)

  let momentumLabel
  if      (momentum >  0.20) momentumLabel = 'accelerating'
  else if (momentum >  0.05) momentumLabel = 'improving'
  else if (momentum >= -0.05) momentumLabel = 'stable'
  else if (momentum >= -0.20) momentumLabel = 'slowing'
  else                        momentumLabel = 'decelerating'

  return { momentum, momentumLabel }
}
