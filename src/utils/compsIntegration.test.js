import { describe, it, expect } from 'vitest'
import { computeCompBlend } from './compsIntegration.js'

// peakPPG baseline for WR
const PEAK = { WR: 20 }

// Helper: makes a season entry for a player with given fantasyPoints and gamesPlayed.
function season(fp, gp = 10) {
  return { fantasyPoints: fp, gamesPlayed: gp }
}

// For findCareerComps to find comps, the target must have >= 2 qualifying seasons
// and candidate must have >= targetVector.length seasons + some subsequent seasons.
// All players in playersMap with the same position are evaluated.
// Each test uses unique player IDs to avoid the module-level compsCache interfering.

describe('computeCompBlend', () => {
  it('no comps — target has only 1 qualifying season → blendedPPG equals pipelinePPG, weight 0', () => {
    // 1-season target → targetVector.length < 2 → findCareerComps returns []
    const careerStats = { 2023: { nc1_t: season(150) } }
    const playersMap  = { nc1_t: { position: 'WR' } }
    const r = computeCompBlend('nc1_t', playersMap, careerStats, PEAK, 'WR', 12, 'medium')
    expect(r.blendedPPG).toBe(12)
    expect(r.compBlendWeight).toBe(0)
    expect(r.compCount).toBe(0)
  })

  it('comps present but compPPG null — comp has no subsequent seasons → ineligible path', () => {
    // Target: 2 seasons; Comp: exactly 2 seasons (same arc) → theirSubsequentSeasons = []
    // → compsProjectedPPG returns null → not eligible → blendedPPG = pipelinePPG
    const careerStats = {
      2022: { nc2_t: season(100), nc2_c: season(100) },
      2023: { nc2_t: season(120), nc2_c: season(120) },
    }
    const playersMap = { nc2_t: { position: 'WR' }, nc2_c: { position: 'WR' } }
    const r = computeCompBlend('nc2_t', playersMap, careerStats, PEAK, 'WR', 12, 'medium')
    expect(r.blendedPPG).toBe(12)
    expect(r.compBlendWeight).toBe(0)
    expect(r.compPPG).toBeNull()
  })

  it('comps present, < 2 subsequent seasons total — ineligible path', () => {
    // Target: 2 seasons; Comp: 3 seasons (2 matching + 1 subsequent) → subseasonCount = 1 < 2
    const careerStats = {
      2021: { nc3_t: season(100), nc3_c: season(100) },
      2022: { nc3_t: season(120), nc3_c: season(120) },
      2023: { nc3_c: season(130) },  // only comp has 2023 (subsequent season)
    }
    const playersMap = { nc3_t: { position: 'WR' }, nc3_c: { position: 'WR' } }
    const r = computeCompBlend('nc3_t', playersMap, careerStats, PEAK, 'WR', 12, 'medium')
    expect(r.blendedPPG).toBe(12)
    expect(r.compBlendWeight).toBe(0)
    // compPPG is not null (comp has 1 subsequent season), but still ineligible
    expect(r.compCount).toBe(1)
  })

  it('eligible, low pipeline confidence → blendedPPG between pipelinePPG and compPPG', () => {
    // Target: 2 seasons; Comp: 4 seasons (2 matching + 2 subsequent) → subseasonCount = 2 ≥ 2
    const careerStats = {
      2020: { nc4_t: season(100), nc4_c: season(100) },
      2021: { nc4_t: season(120), nc4_c: season(120) },
      2022: { nc4_c: season(130) },
      2023: { nc4_c: season(140) },
    }
    const playersMap = { nc4_t: { position: 'WR' }, nc4_c: { position: 'WR' } }
    // compPPG = avg of 2 subsequent seasons: (130/10 * 20 + 140/10 * 20)/2... wait
    // theirSubsequentSeasons holds normalised arc values (PPG/peakPPG)
    // subsequent v1 = (130/10)/20 = 0.65; subsequent v2 = (140/10)/20 = 0.70
    // compsProjectedPPG = (0.65*20 + 0.70*20)/2 = (13 + 14)/2 = 13.5
    const pipelinePPG = 10
    const r = computeCompBlend('nc4_t', playersMap, careerStats, PEAK, 'WR', pipelinePPG, 'low')
    expect(r.compBlendWeight).toBeGreaterThan(0)
    expect(r.blendedPPG).toBeGreaterThan(pipelinePPG)  // comp pulls up (compPPG > pipelinePPG)
    expect(r.blendedPPG).toBeLessThan(r.compPPG ?? Infinity)
  })

  it('eligible, high pipeline confidence → smaller blend weight than low confidence', () => {
    const careerStats = {
      2020: { nc5_t: season(100), nc5_c: season(100) },
      2021: { nc5_t: season(120), nc5_c: season(120) },
      2022: { nc5_c: season(130) },
      2023: { nc5_c: season(140) },
    }
    const playersMap = { nc5_t: { position: 'WR' }, nc5_c: { position: 'WR' } }
    const pipelinePPG = 10
    const rLow  = computeCompBlend('nc5_t', playersMap, careerStats, PEAK, 'WR', pipelinePPG, 'low')
    // Need fresh player IDs for the second call (different cache entry)
    const careerStats2 = {
      2020: { nc5b_t: season(100), nc5b_c: season(100) },
      2021: { nc5b_t: season(120), nc5b_c: season(120) },
      2022: { nc5b_c: season(130) },
      2023: { nc5b_c: season(140) },
    }
    const playersMap2 = { nc5b_t: { position: 'WR' }, nc5b_c: { position: 'WR' } }
    const rHigh = computeCompBlend('nc5b_t', playersMap2, careerStats2, PEAK, 'WR', pipelinePPG, 'high')
    expect(rHigh.compBlendWeight).toBeLessThan(rLow.compBlendWeight)
  })

  it('clamp — blendedPPG clamped to 40 when pipelinePPG is very high', () => {
    // With pipelinePPG=50 and eligible comps, blended will exceed 40 → clamp to 40
    const careerStats = {
      2020: { cl6_t: season(100), cl6_c: season(100) },
      2021: { cl6_t: season(120), cl6_c: season(120) },
      2022: { cl6_c: season(130) },
      2023: { cl6_c: season(140) },
    }
    const playersMap = { cl6_t: { position: 'WR' }, cl6_c: { position: 'WR' } }
    const r = computeCompBlend('cl6_t', playersMap, careerStats, PEAK, 'WR', 50, 'low')
    expect(r.blendedPPG).toBeLessThanOrEqual(40)
    if (r.compBlendWeight > 0) {
      // If comps were found and eligible, the raw blend would be > 40
      expect(r.blendedPPG).toBe(40)
    }
  })

  it('compBlendWeight upper bound ≤ MAX_COMP_WEIGHT (0.35)', () => {
    // 3 comps with identical arcs (similarity 100), each with 2+ subsequent seasons
    // pipelineConfidence 'low' → pipelineUncertainty = 1.0
    // compConfidence could reach 1.0 → compBlendWeight = 0.35 × 1.0 × 1.0 = 0.35
    const careerStats = {
      2020: { mw_t: season(100), mw_c1: season(100), mw_c2: season(100), mw_c3: season(100) },
      2021: { mw_t: season(120), mw_c1: season(120), mw_c2: season(120), mw_c3: season(120) },
      2022: { mw_c1: season(130), mw_c2: season(130), mw_c3: season(130) },
      2023: { mw_c1: season(140), mw_c2: season(140), mw_c3: season(140) },
    }
    const playersMap = {
      mw_t:  { position: 'WR' },
      mw_c1: { position: 'WR' },
      mw_c2: { position: 'WR' },
      mw_c3: { position: 'WR' },
    }
    const r = computeCompBlend('mw_t', playersMap, careerStats, PEAK, 'WR', 12, 'low')
    expect(r.compBlendWeight).toBeLessThanOrEqual(0.35)
    if (r.compCount >= 3) {
      // With 3 perfectly similar comps and low pipeline confidence, weight should reach max
      expect(r.compBlendWeight).toBeCloseTo(0.35, 1)
    }
  })
})
