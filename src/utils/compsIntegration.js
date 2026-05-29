/**
 * src/utils/compsIntegration.js — Career-comp ensemble integration.
 *
 * Combines the season-projection pipeline output with the career-comparables
 * nearest-neighbour estimate (compsProjectedPPG) via a confidence-weighted
 * blend. See .claude/tasks/projection-b3-career-comp-integration.md.
 */
import { findCareerComps, compsProjectedPPG } from './careerComps'

const MAX_COMP_WEIGHT = 0.35

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

/**
 * @param {string} playerId
 * @param {Object} playersMap
 * @param {Object} careerStats
 * @param {Object} positionPeakPPG
 * @param {string} position
 * @param {number} pipelinePPG        the pipeline's final clamped projectedPPG
 * @param {string} pipelineConfidence 'low' | 'medium' | 'high'
 * @returns {{
 *   blendedPPG: number, compPPG: number|null, compCount: number,
 *   compAvgSimilarity: number|null, compConfidence: number, compBlendWeight: number
 * }}
 */
export function computeCompBlend(
  playerId, playersMap, careerStats, positionPeakPPG, position,
  pipelinePPG, pipelineConfidence
) {
  const comps   = findCareerComps(playerId, playersMap, careerStats, positionPeakPPG)
  const nComps  = comps.length
  const compPPG = compsProjectedPPG(comps, positionPeakPPG, position)
  const avgSim  = nComps > 0
    ? Math.round(comps.reduce((s, c) => s + c.similarity, 0) / nComps)
    : null

  let subseasonCount = 0
  for (const c of comps) {
    subseasonCount += Math.min(c.theirSubsequentSeasons?.length ?? 0, 2)
  }

  const eligible = compPPG != null && nComps >= 1 && subseasonCount >= 2
  if (!eligible) {
    return {
      blendedPPG: pipelinePPG, compPPG, compCount: nComps,
      compAvgSimilarity: avgSim, compConfidence: 0, compBlendWeight: 0,
    }
  }

  const countFactor   = Math.min(nComps / 3, 1)
  const simFactor     = clamp((avgSim - 60) / 25, 0, 1)
  const seasonsFactor = clamp(subseasonCount / 4, 0.5, 1)
  const compConfidence = 0.45 * countFactor + 0.40 * simFactor + 0.15 * seasonsFactor

  const pipelineUncertainty = ({ low: 1.0, medium: 0.6, high: 0.25 })[pipelineConfidence] ?? 0.6
  const compBlendWeight = MAX_COMP_WEIGHT * compConfidence * pipelineUncertainty
  const alpha = 1 - compBlendWeight

  const blendedPPG = clamp(alpha * pipelinePPG + (1 - alpha) * compPPG, 0, 40)

  return {
    blendedPPG, compPPG, compCount: nComps,
    compAvgSimilarity: avgSim, compConfidence, compBlendWeight,
  }
}
