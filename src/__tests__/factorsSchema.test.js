/**
 * src/__tests__/factorsSchema.test.js
 *
 * Schema contract for computeNextSeasonProjection's `factors` object.
 *
 * Asserts that every projection run emits EXACTLY the documented set of
 * `factors` keys — no more, no fewer. This catches accidental key renames,
 * removals, or drift across batches without requiring a snapshot.
 *
 * Key sets are derived by reading the return statements in
 * src/utils/seasonProjection.js (vet path lines 457–501 + ...ktcSignals,
 * rookie path rookieProjection() + ...ktcSignals). If a batch adds or renames
 * a key, update the corresponding set here — test failure is the forcing
 * function.
 *
 * NOTE: The plan document (test-infra-setup.md) counts 55 vet keys ("42 + 13")
 * but its own VET_FACTORS_KEYS enumeration actually has 43 + 13 = 56 keys.
 * Current code is the authoritative source; the canonical count here is 56.
 */

import { describe, it, expect, vi } from 'vitest'

// ktcHistory.js → dataStore.js uses import.meta.env.VITE_* and cache.js uses idb.
// Both load cleanly in Node (lazy DB access), but mock cache to be safe and
// consistent with projectionSnapshot.test.js.
vi.mock('../utils/cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))

import { computeNextSeasonProjection } from '../utils/seasonProjection.js'

// ─── Canonical key sets (derived from current seasonProjection.js) ────────────

// Vet-path factors: 43 explicit keys + 13 ktcSignals = 56 total.
// Derived from the `return { ... factors: { ... ...ktcSignals } }` block.
const VET_FACTORS_KEYS = new Set([
  'basePPG', 'ageDelta', 'shareTrend', 'regressionFactor', 'regressionFactorRaw',
  'consistencyScore', 'consistencyBand', 'consistencyScale',
  'durabilityFactor', 'teamFactor', 'depthFactor',
  'momentumFactor', 'momentumLabel', 'absenceShapeFactor', 'absenceShape',
  'shareTrendRaw', 'shareVolatilityLabel', 'shareVolatilityScale',
  'qbQualityFactor', 'qbQualityScore', 'combinedNewFactor',
  'isBreakout', 'breakoutFactor', 'isBounceBack', 'bounceBackFactor',
  'isTdReliant', 'tdRelianceFactor', 'tdDependency',
  'trajectoryFactor', 'trajectoryNormalized',
  'efficiencyFactor', 'efficiencyIndex', 'efficiencyMetrics',
  'positionMultiplicityRatio', 'primaryCategory', 'primaryCategoryPoints', 'secondaryCategoryPoints',
  'pipelinePPG', 'compPPG', 'compCount', 'compAvgSimilarity', 'compConfidence', 'compBlendWeight',
  // ktcSignals (13):
  'ktcHistDelta', 'ktcHistDeltaPct', 'ktcHistVolatility', 'ktcHistVolatilityPct',
  'ktcHistTrajectorySlope', 'ktcHistTrajectoryNormalized', 'ktcHistTrajectoryLabel',
  'ktcHistRankVsMedianTrend', 'ktcHistRankVsMedianLabel', 'ktcHistValueVsPosMedian',
  'ktcHistSampleSize', 'ktcHistWindowSpanDays', 'ktcHistConfidence',
])

// Rookie-path factors: 23 explicit keys + 13 ktcSignals + 6 D1 NFL-draft = 42 total.
// Derived from rookieProjection()'s `factors` object + the { ...r.factors, ...ktcSignals } spread.
// NOTE: D1 keys are rookie-path only — do NOT add them to VET_FACTORS_KEYS.
const ROOKIE_FACTORS_KEYS = new Set([
  'basePPG', 'ageDelta', 'shareTrend', 'regressionFactor', 'durabilityFactor',
  'teamFactor', 'depthFactor', 'ktcMult', 'collegeMult', 'ktcPct',
  'collegeBase', 'productionTrend', 'productionTrendAdjust',
  'finalYearDominator', 'finalYearAdjust', 'breakoutAge', 'breakoutAgeFactor',
  'collegeContribution', 'rookieAgeAtDraft',
  'positionMultiplicityRatio', 'primaryCategory', 'primaryCategoryPoints', 'secondaryCategoryPoints',
  // ktcSignals (13):
  'ktcHistDelta', 'ktcHistDeltaPct', 'ktcHistVolatility', 'ktcHistVolatilityPct',
  'ktcHistTrajectorySlope', 'ktcHistTrajectoryNormalized', 'ktcHistTrajectoryLabel',
  'ktcHistRankVsMedianTrend', 'ktcHistRankVsMedianLabel', 'ktcHistValueVsPosMedian',
  'ktcHistSampleSize', 'ktcHistWindowSpanDays', 'ktcHistConfidence',
  // D1 — NFL draft slot (6):
  'nflDraftMultiplier', 'nflDraftRound', 'nflDraftPick',
  'nflDraftTier', 'nflDraftMatchSource', 'rookieMultiplierProduct',
])

// ─── Assertion helper ─────────────────────────────────────────────────────────

/**
 * Asserts both directions: every key in expected is in actual, and vice versa.
 * Produces a clear failure message listing missing/extra keys by name.
 */
function assertFactorsKeySet(factors, expected, label) {
  const actual  = new Set(Object.keys(factors))
  const missing = [...expected].filter(k => !actual.has(k))
  const extra   = [...actual].filter(k => !expected.has(k))
  if (missing.length > 0 || extra.length > 0) {
    const lines = [`${label} factors key mismatch:`]
    if (missing.length) lines.push(`  Missing from output: ${missing.join(', ')}`)
    if (extra.length)   lines.push(`  Extra in output:     ${extra.join(', ')}`)
    throw new Error(lines.join('\n'))
  }
}

// ─── Minimal fixtures ─────────────────────────────────────────────────────────

// Vet fixture: WR with 5 qualifying seasons → exercises the full veteran pipeline.
const VET_ID = 'vet_schema_contract'

const vetPlayersMap = {
  [VET_ID]: { position: 'WR', age: 26, years_exp: 5, team: 'SF', depth_chart_order: 1 },
}

function vetSeason(fp, gp = 14) {
  return { fantasyPoints: fp, gamesPlayed: gp, stats: {}, dnpWeeks: 0 }
}

const vetCareerStats = {
  2020: { [VET_ID]: vetSeason(168, 14) },
  2021: { [VET_ID]: vetSeason(195, 15) },
  2022: { [VET_ID]: vetSeason(210, 16) },
  2023: { [VET_ID]: vetSeason(182, 14) },
  2024: { [VET_ID]: vetSeason(195, 15) },
}

// Base args shared by both vet calls below.
const SHARED_ARGS = [
  vetPlayersMap,
  vetCareerStats,
  {},                                      // empiricalCurves (empty → ageDelta stays 1.0)
  { QB: 20, RB: 18, WR: 18, TE: 14 },     // positionPeakPPG
  {},                                      // historicalShares
  { [VET_ID]: { depthOrder: 1 } },        // depthMap
  { teamOffense: { SF: { rank: 5 } } },   // teamContext
  null,                                    // scoringSettings
  null,                                    // ktcMap
  null,                                    // collegeStats
  2025,                                    // currentSeason
  null,                                    // qbQualityByTeam
  null,                                    // ktcHistory
]

// Rookie fixture: WR years_exp 0, empty careerStats → routes to rookie path.
const RK_ID = 'rk_schema_contract'

const rookiePlayersMap = {
  [RK_ID]: { position: 'WR', age: 22, years_exp: 0, team: 'KC', depth_chart_order: 1 },
}

const ROOKIE_ARGS = [
  rookiePlayersMap,
  {},                                      // empty careerStats → no qualifying seasons
  {},
  { QB: 20, RB: 18, WR: 18, TE: 14 },
  {},
  {},
  {},
  null,
  null,
  null,
  2025,
  null,
  null,
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeNextSeasonProjection — factors schema contract', () => {
  it('vet path returns a result (sanity check)', () => {
    const r = computeNextSeasonProjection(VET_ID, ...SHARED_ARGS)
    expect(r).not.toBeNull()
    expect(r.confidence).toMatch(/^(low|medium|high)$/)
    expect(r.factors).toBeTruthy()
  })

  it('vet path emits exactly the documented 56 factors keys (both directions)', () => {
    const r = computeNextSeasonProjection(VET_ID, ...SHARED_ARGS)
    assertFactorsKeySet(r.factors, VET_FACTORS_KEYS, 'Vet')
  })

  it('rookie path returns a result (sanity check)', () => {
    const r = computeNextSeasonProjection(RK_ID, ...ROOKIE_ARGS)
    expect(r).not.toBeNull()
    expect(r.confidence).toBe('rookie')
    expect(r.factors).toBeTruthy()
  })

  it('rookie path emits exactly the documented 42 factors keys (both directions)', () => {
    const r = computeNextSeasonProjection(RK_ID, ...ROOKIE_ARGS)
    assertFactorsKeySet(r.factors, ROOKIE_FACTORS_KEYS, 'Rookie')
  })

  it('vet factors value types and enum constraints', () => {
    const r = computeNextSeasonProjection(VET_ID, ...SHARED_ARGS)
    const f = r.factors

    // Numeric scalars
    expect(typeof f.basePPG).toBe('number')
    expect(f.basePPG).toBeGreaterThan(0)
    expect(typeof f.ageDelta).toBe('number')
    expect(typeof f.regressionFactor).toBe('number')
    expect(typeof f.durabilityFactor).toBe('number')
    expect(typeof f.combinedNewFactor).toBe('number')

    // combinedNewFactor is clamped [0.78, 1.30]
    expect(f.combinedNewFactor).toBeGreaterThanOrEqual(0.78)
    expect(f.combinedNewFactor).toBeLessThanOrEqual(1.30)

    // momentumLabel enum (or null when < 4 qualifying seasons; we have 5 so it fires)
    const MOMENTUM_LABELS = ['accelerating', 'improving', 'stable', 'slowing', 'decelerating', null]
    expect(MOMENTUM_LABELS).toContain(f.momentumLabel)

    // consistencyBand enum (we have 5 seasons so it fires)
    const CONSISTENCY_BANDS = ['steady', 'moderate', 'erratic', null]
    expect(CONSISTENCY_BANDS).toContain(f.consistencyBand)

    // ktcHist sentinel values when ktcHistory is null
    expect(f.ktcHistSampleSize).toBe(0)
    expect(f.ktcHistConfidence).toBe('none')
    expect(f.ktcHistDelta).toBeNull()

    // projectedPPG is a reasonable number
    expect(r.projectedPPG).toBeGreaterThan(0)
    expect(r.projectedPPG).toBeLessThan(40)

    // projectedGames in valid range
    expect(r.projectedGames).toBeGreaterThanOrEqual(8)
    expect(r.projectedGames).toBeLessThanOrEqual(17)
  })

  it('rookie factors value types and enum constraints', () => {
    const r = computeNextSeasonProjection(RK_ID, ...ROOKIE_ARGS)
    const f = r.factors

    expect(typeof f.basePPG).toBe('number')
    expect(typeof f.ktcMult).toBe('number')
    expect(typeof f.collegeMult).toBe('number')
    expect(typeof f.collegeContribution).toBe('number')

    // ktcPct is null when ktcMap is null
    expect(f.ktcPct).toBeNull()

    // Multiplicity fields are null on rookie path (no season stats)
    expect(f.positionMultiplicityRatio).toBeNull()
    expect(f.primaryCategory).toBeNull()
    expect(f.primaryCategoryPoints).toBeNull()
    expect(f.secondaryCategoryPoints).toBeNull()

    // ktcHist sentinels
    expect(f.ktcHistSampleSize).toBe(0)
    expect(f.ktcHistConfidence).toBe('none')
  })

  it('non-skill position returns null', () => {
    const k = computeNextSeasonProjection('kicker',
      { kicker: { position: 'K', age: 32, years_exp: 10, team: 'BAL' } },
      {},
      {},
      { QB: 20, RB: 18, WR: 18, TE: 14 },
      {}, {}, {}, null, null, null, 2025, null, null
    )
    expect(k).toBeNull()
  })
})
