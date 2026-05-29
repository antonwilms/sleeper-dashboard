/**
 * src/utils/seasonProjection.test.js
 *
 * Integration tests for computeNextSeasonProjection — exercises the full
 * pipeline end-to-end with hand-crafted fixtures from src/__fixtures__/factories.js.
 *
 * WHAT THESE TESTS DO
 * -------------------
 * Each test constructs the 15 inputs that computeNextSeasonProjection needs,
 * calls the function, and asserts structural and behavioural outputs. They are
 * complementary to factorsSchema.test.js (schema contract) and cover:
 *   - Happy-path signal interaction (all 56 vet keys, confidence, PPG range)
 *   - Graceful degradation (1 qualifying season, no scoring settings, no comps)
 *   - combinedNewFactor clamp binding (upper 1.30, lower 0.78)
 *   - KTC signals as capture-only (never move projectedPPG)
 *   - Comp-blend integration (blendedPPG ≠ pipelinePPG when comps eligible)
 *   - Rookie path (all 42 keys, rookieAgeAtDraft substitution, college signals, D1 draft slot)
 *
 * CACHE ISOLATION
 * ---------------
 * careerComps.js has a module-level compsCache (Map keyed by player ID) that
 * persists across tests. Every test uses a unique player ID (P_* constants)
 * so no test gets a stale cached result from another. See factories.js header.
 *
 * efficiencyMetrics.js has a cohortCache keyed by careerStats object identity.
 * Each test passes its own careerStats object, so the cohort is always rebuilt.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('./cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))

import { computeNextSeasonProjection } from './seasonProjection.js'
import {
  makeVet, makeRookie,
  clampHiCareerStats, clampLoCareerStats,
  breakoutCurves, compBlendCareerStats,
  makeKtcMap, defaultPPRScoring,
} from '../__fixtures__/factories.js'

// ─── Expected key sets (mirrors factorsSchema.test.js) ────────────────────────
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
  'ktcHistDelta', 'ktcHistDeltaPct', 'ktcHistVolatility', 'ktcHistVolatilityPct',
  'ktcHistTrajectorySlope', 'ktcHistTrajectoryNormalized', 'ktcHistTrajectoryLabel',
  'ktcHistRankVsMedianTrend', 'ktcHistRankVsMedianLabel', 'ktcHistValueVsPosMedian',
  'ktcHistSampleSize', 'ktcHistWindowSpanDays', 'ktcHistConfidence',
])

// 36 pre-D1 keys + 6 D1 NFL-draft keys = 42 total.
// NOTE: D1 keys (nflDraftMultiplier etc.) are rookie-path only — do NOT add to VET_FACTORS_KEYS.
const ROOKIE_FACTORS_KEYS = new Set([
  'basePPG', 'ageDelta', 'shareTrend', 'regressionFactor', 'durabilityFactor',
  'teamFactor', 'depthFactor', 'ktcMult', 'collegeMult', 'ktcPct',
  'collegeBase', 'productionTrend', 'productionTrendAdjust',
  'finalYearDominator', 'finalYearAdjust', 'breakoutAge', 'breakoutAgeFactor',
  'collegeContribution', 'rookieAgeAtDraft',
  'positionMultiplicityRatio', 'primaryCategory', 'primaryCategoryPoints', 'secondaryCategoryPoints',
  'ktcHistDelta', 'ktcHistDeltaPct', 'ktcHistVolatility', 'ktcHistVolatilityPct',
  'ktcHistTrajectorySlope', 'ktcHistTrajectoryNormalized', 'ktcHistTrajectoryLabel',
  'ktcHistRankVsMedianTrend', 'ktcHistRankVsMedianLabel', 'ktcHistValueVsPosMedian',
  'ktcHistSampleSize', 'ktcHistWindowSpanDays', 'ktcHistConfidence',
  // NEW (D1) — NFL draft slot
  'nflDraftMultiplier', 'nflDraftRound', 'nflDraftPick',
  'nflDraftTier', 'nflDraftMatchSource', 'rookieMultiplierProduct',
])

// ─── Assertion helpers ────────────────────────────────────────────────────────

function assertFactorKeys(factors, expected, label) {
  const actual  = new Set(Object.keys(factors))
  const missing = [...expected].filter(k => !actual.has(k))
  const extra   = [...actual].filter(k => !expected.has(k))
  if (missing.length || extra.length) {
    const lines = [`${label} factors key mismatch:`]
    if (missing.length) lines.push(`  Missing: ${missing.join(', ')}`)
    if (extra.length)   lines.push(`  Extra:   ${extra.join(', ')}`)
    throw new Error(lines.join('\n'))
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VET PATH TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeNextSeasonProjection — vet path integration', () => {

  // ── Test 1: Happy-path fully-equipped vet ────────────────────────────────
  it('happy-path vet: emits 56 keys, reasonable PPG, valid confidence', () => {
    const r = computeNextSeasonProjection(...makeVet({ playerId: 'P_VET_1' }).asArgs())

    expect(r, 'result must not be null').not.toBeNull()
    expect(r.confidence, 'confidence').toBe('high')                   // 5 qualifying seasons
    assertFactorKeys(r.factors, VET_FACTORS_KEYS, 'Happy-path vet')

    // projectedPPG is positive and within the global clamp
    expect(r.projectedPPG, 'projectedPPG > 0').toBeGreaterThan(0)
    expect(r.projectedPPG, 'projectedPPG < 40').toBeLessThan(40)

    // combinedNewFactor is always within the declared clamp
    expect(r.factors.combinedNewFactor, 'combinedNewFactor ≥ 0.78').toBeGreaterThanOrEqual(0.78)
    expect(r.factors.combinedNewFactor, 'combinedNewFactor ≤ 1.30').toBeLessThanOrEqual(1.30)

    // projectedGames within valid range
    expect(r.projectedGames).toBeGreaterThanOrEqual(8)
    expect(r.projectedGames).toBeLessThanOrEqual(17)
  })

  // ── Test 2: Bare-minimum vet (1 qualifying season) ───────────────────────
  it('bare-minimum vet: 1 qualifying season degrades gracefully', () => {
    // years_exp=2, single qualifying 2024 season — bypasses rookie gate (years_exp>1)
    const cs = { 2024: { P_VET_2: { fantasyPoints: 154, gamesPlayed: 14, dnpWeeks: 0,
      stats: { rush_att: 20, rush_yd: 100 } } } }

    const r = computeNextSeasonProjection(
      ...makeVet({ playerId: 'P_VET_2', player: { years_exp: 2 }, careerStats: cs }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.confidence).toBe('low')                          // 1 season < 3 threshold
    expect(r.projectedPPG).toBeGreaterThan(0)                // still produces a number
    assertFactorKeys(r.factors, VET_FACTORS_KEYS, 'Bare-minimum vet')

    // Signals that require ≥2 qualifying seasons → null sentinels
    expect(r.factors.isBounceBack,
      'isBounceBack null with 1 qualifying season').toBeNull()

    // No scoring settings → tdDependency cannot be computed
    expect(r.factors.tdDependency,
      'tdDependency null without scoringSettings').toBeNull()

    // Momentum needs ≥4 seasons → null
    expect(r.factors.momentumLabel,
      'momentumLabel null with 1 qualifying season').toBeNull()
    // momentumFactor sentinel is 1.00 when label is null
    expect(r.factors.momentumFactor).toBe(1)

    // KTC sentinels when ktcHistory is null
    expect(r.factors.ktcHistSampleSize).toBe(0)
    expect(r.factors.ktcHistConfidence).toBe('none')
    expect(r.factors.ktcHistDelta).toBeNull()
  })

  // ── Test 3: combinedNewFactor clamp binds from above ─────────────────────
  it('clamp from above: combinedNewFactor === 1.30 when all signals are maximally positive', () => {
    // ppgs = [8,8,8,14,14] with 2023 GP=9 → momentum accelerating, trajectory max,
    // bounce-back true. breakoutCurves gives medianPPG=7.5 at age 24 → breakout true.
    // qbQuality score=100 → qbQualityFactor=1.05. No scoring settings → tdReliance neutral.
    //
    // Raw product = 1.05 * 1.08 * 1.08 * 1.05 * 1.00 * 1.07 * ~1.00 ≈ 1.376 > 1.30
    // → clamp binds to exactly 1.30.
    const r = computeNextSeasonProjection(
      ...makeVet({
        playerId:        'P_CLAMP_HI',
        player:          { age: 24, years_exp: 5 },
        careerStats:     clampHiCareerStats('P_CLAMP_HI'),
        empiricalCurves: breakoutCurves(),
        qbQualityByTeam: { KC: 100 },   // score 100 → qbQualityFactor = 1.05
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.factors.combinedNewFactor,
      `clamp from above: expected 1.3, got ${r.factors.combinedNewFactor}. ` +
      `Signals: qbQ=${r.factors.qbQualityFactor}, mom=${r.factors.momentumFactor}, ` +
      `breakout=${r.factors.breakoutFactor}, bounce=${r.factors.bounceBackFactor}, ` +
      `traj=${r.factors.trajectoryFactor}, eff=${r.factors.efficiencyFactor}`
    ).toBe(1.3)

    // Confirm the signals that drove the clamp actually fired
    expect(r.factors.momentumLabel).toBe('accelerating')
    expect(r.factors.isBreakout).toBe(true)
    expect(r.factors.isBounceBack).toBe(true)
    expect(r.factors.qbQualityFactor).toBe(1.05)
    // trajectoryFactor approaches but may not hit 1.07 exactly due to floating-point;
    // the important thing is it is significantly positive (driving the clamp to bind).
    expect(r.factors.trajectoryFactor).toBeGreaterThan(1.05)
  })

  // ── Test 4: combinedNewFactor clamp binds from below ─────────────────────
  it('clamp from below: combinedNewFactor === 0.78 when all signals are maximally negative', () => {
    // ppgs = [14,14,14,8,8] → decelerating momentum (0.92), trajectory min (0.93).
    // qbQuality score=0 → qbQualityFactor=0.95.
    // TD-reliant last season (rush_td=8, fp=112) with scoring → tdRelianceFactor=0.93.
    // Age 26 > 24 → no breakout. Prior GP=14 → no bounce-back.
    //
    // Raw product ≈ 0.95 * 0.92 * 1.00 * 1.00 * 0.93 * 0.938 * ~0.94 ≈ 0.717 < 0.78
    // → clamp binds to exactly 0.78.
    const scoringSettings = { rush_yd: 0.1, rush_td: 6, rush_att: 0 }

    const r = computeNextSeasonProjection(
      ...makeVet({
        playerId:        'P_CLAMP_LO',
        player:          { age: 26, years_exp: 5, team: 'DAL' },
        careerStats:     clampLoCareerStats('P_CLAMP_LO'),
        qbQualityByTeam: { DAL: 0 },    // score 0 → qbQualityFactor = 0.95
        scoringSettings,
        teamContext:     { teamOffense: { DAL: { rank: 16 } } },
        depthMap:        { P_CLAMP_LO: { depthOrder: 1 } },
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.factors.combinedNewFactor,
      `clamp from below: expected 0.78, got ${r.factors.combinedNewFactor}. ` +
      `Signals: qbQ=${r.factors.qbQualityFactor}, mom=${r.factors.momentumFactor}, ` +
      `tdReliance=${r.factors.tdRelianceFactor}, traj=${r.factors.trajectoryFactor}, ` +
      `eff=${r.factors.efficiencyFactor}`
    ).toBe(0.78)

    // Confirm the signals that drove the clamp actually fired
    expect(r.factors.momentumLabel).toBe('decelerating')
    expect(r.factors.isTdReliant).toBe(true)
    expect(r.factors.qbQualityFactor).toBe(0.95)
  })

  // ── Test 5: KTC signals are capture-only (never move projectedPPG) ────────
  it('ktcHistory signals are capture-only: projectedPPG identical with or without KTC data', () => {
    // Two identical fixtures except ktcHistory. Both get no comps (single-player
    // playersMap) so pipelinePPG = projectedPPG in both cases.
    const base = { playerId: 'P_KTC_1', player: { age: 26, years_exp: 5 } }

    const rNoKtc = computeNextSeasonProjection(
      ...makeVet({ ...base, playerId: 'P_KTC_1', ktcHistory: null }).asArgs()
    )
    const rWithKtc = computeNextSeasonProjection(
      ...makeVet({
        ...base,
        playerId: 'P_KTC_2',
        ktcHistory: {
          series: {
            P_KTC_2: [
              { date: '2025-01-01', value: 5000, positionRank: 5, valueVsPosMedian: 1.2 },
              { date: '2025-01-08', value: 5500, positionRank: 4, valueVsPosMedian: 1.3 },
            ],
          },
        },
      }).asArgs()
    )

    expect(rNoKtc).not.toBeNull()
    expect(rWithKtc).not.toBeNull()

    // projectedPPG must be identical — KTC is capture-only
    expect(rWithKtc.projectedPPG,
      `KTC must not move projectedPPG: noKTC=${rNoKtc.projectedPPG}, withKTC=${rWithKtc.projectedPPG}`
    ).toBe(rNoKtc.projectedPPG)

    // KTC factors differ as expected
    expect(rNoKtc.factors.ktcHistSampleSize).toBe(0)
    expect(rWithKtc.factors.ktcHistSampleSize).toBe(2)
    expect(rWithKtc.factors.ktcHistDelta).not.toBeNull()
    expect(rNoKtc.factors.ktcHistDelta).toBeNull()
  })

  // ── Test 6: Comp blend actually moves the projection ─────────────────────
  it('comp blend: compBlendWeight > 0 and projectedPPG ≠ pipelinePPG when comps are eligible', () => {
    // Target: P_COMP_TGT, 2 qualifying seasons (confidence='low') → high comp weight.
    // Comp: P_COMP_C1, 4 seasons (first 2 identical to target → similarity=100,
    // subsequent 2 at PPG=17 → compPPG=17, well above pipelinePPG≈13).
    const tgtId  = 'P_COMP_TGT'
    const compId = 'P_COMP_C1'
    const cs = compBlendCareerStats(tgtId, compId)

    const r = computeNextSeasonProjection(
      ...makeVet({
        playerId:    tgtId,
        player:      { age: 26, years_exp: 3 },
        careerStats: cs,
        extraPlayers: {
          [compId]: { position: 'RB', age: 30, years_exp: 7, team: 'SF' },
        },
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.confidence).toBe('low')               // 2 qualifying seasons

    expect(r.factors.compBlendWeight,
      'compBlendWeight must be positive when comps are eligible'
    ).toBeGreaterThan(0)

    expect(r.factors.compCount,
      'at least one comp found'
    ).toBeGreaterThanOrEqual(1)

    // The blend must have moved the output away from the pure pipeline estimate.
    expect(r.projectedPPG,
      `projectedPPG (${r.projectedPPG}) should differ from pipelinePPG (${r.factors.pipelinePPG}) ` +
      `when compBlendWeight=${r.factors.compBlendWeight} and compPPG=${r.factors.compPPG}`
    ).not.toBe(r.factors.pipelinePPG)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ROOKIE PATH TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeNextSeasonProjection — rookie path integration', () => {

  // ── Test 7: Year-1 rookie baseline ───────────────────────────────────────
  it('year-1 rookie: emits 42 keys, positive PPG, age lookup at current age', () => {
    // years_exp=0, age=22 → rookieAgeAtDraft=22, ageMult=1.05
    // ktcMap with 5 WRs so ktcPct is non-null.
    // College: peakDominator=32 → collegeBase=1.20; improving trend; breakoutAge=19.
    const playerId = 'P_ROO_1'
    const playersMap = { [playerId]: { position: 'WR', age: 22, years_exp: 0, team: 'KC' } }
    const ktcMap = makeKtcMap(playerId, 'WR', 8000, playersMap)

    const collegeStats = {
      [playerId]: {
        peakDominator:    32,          // → collegeBase = 1.20
        productionTrend:  'improving', // → productionTrendAdjust = 0.05
        finalYearDominator: 30,
        seasonsPlayed:    3,
        breakoutAge:      19,          // → breakoutAgeFactor = 1.05
      },
    }

    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId,
        player:       { position: 'WR', age: 22, years_exp: 0 },
        extraPlayers: Object.fromEntries(
          [...ktcMap.keys()].filter(k => k !== playerId).map(k => [k, playersMap[k]])
        ),
        ktcMap,
        collegeStats,
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.confidence).toBe('rookie')
    assertFactorKeys(r.factors, ROOKIE_FACTORS_KEYS, 'Year-1 rookie')

    expect(r.projectedPPG).toBeGreaterThan(0)
    expect(r.projectedPPG).toBeLessThan(40)

    // Draft-age substitution: years_exp=0 → rookieAgeAtDraft = age - 0 = 22
    expect(r.factors.rookieAgeAtDraft).toBe(22)
    // ageDelta in the rookie factors is the ageMult, which for age 22 = 1.05
    expect(r.factors.ageDelta).toBe(1.05)

    // ktcPct non-null (≥5 WRs in ktcMap + playersMap)
    expect(r.factors.ktcPct).not.toBeNull()
    expect(r.factors.ktcMult).toBeGreaterThan(0.70)
    expect(r.factors.ktcMult).toBeLessThanOrEqual(1.30)

    // College signals fired
    expect(r.factors.collegeBase).toBeCloseTo(1.20, 3)
    expect(r.factors.breakoutAgeFactor).toBeCloseTo(1.05, 3)
  })

  // ── Test 8: Year-2 sophomore — draft-age substitution fires ──────────────
  it('sophomore (years_exp=1, age=23): rookieAgeAtDraft=22, ageMult=1.05 not 0.95', () => {
    // With years_exp=1 and age=23: candidate = 23-1 = 22. ageMult lookup → 1.05.
    // Without substitution (years_exp=0 and age=23): ageAtDraft=23, ageMult=0.95.
    // Both should be on the rookie path; the substitution makes them differ.

    const rSoph = computeNextSeasonProjection(
      ...makeRookie({ playerId: 'P_ROO_SOPH', player: { age: 23, years_exp: 1 } }).asArgs()
    )
    const rAge23 = computeNextSeasonProjection(
      ...makeRookie({ playerId: 'P_ROO_SOPH2', player: { age: 23, years_exp: 0 } }).asArgs()
    )

    expect(rSoph).not.toBeNull()
    expect(rAge23).not.toBeNull()

    // Sophomore: draft-age substitution fires → looks up age 22 bucket
    expect(rSoph.factors.rookieAgeAtDraft,
      'sophomore rookieAgeAtDraft should be 22 (age minus yearsExp)').toBe(22)
    expect(rSoph.factors.ageDelta,
      'sophomore ageDelta should be 1.05 (age-22 bucket)').toBe(1.05)

    // True year-1 at age 23: no substitution needed (years_exp=0 → ageAtDraft=23)
    expect(rAge23.factors.rookieAgeAtDraft).toBe(23)
    expect(rAge23.factors.ageDelta,
      'age-23 rookie ageDelta should be 0.95').toBe(0.95)

    // projectedPPG differs because ageMult differs (1.05 vs 0.95)
    expect(rSoph.projectedPPG,
      'sophomore (ageMult=1.05) should project higher than same-age year-0 (ageMult=0.95)'
    ).toBeGreaterThan(rAge23.projectedPPG)
  })

  // ── Test 9: Year-4 failed-to-launch routed to rookie path ────────────────
  it('year-4 failed-to-launch (years_exp=3, no qualifying seasons): rookieAgeAtDraft=null, uses current age', () => {
    // years_exp=3 → yearsExp > 1, so the rookieAgeAtDraft gate does NOT fire.
    // qualifying.length=0 (no seasons with GP≥8) → routes to rookie path.
    // ageForLookup = current age = 25 → ageMult = 0.82 (the >23 bucket).
    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId: 'P_ROO_Y4',
        player:   { position: 'WR', age: 25, years_exp: 3 },
        // careerStats has one season but GP<8 → doesn't qualify
        careerStats: {
          2023: { P_ROO_Y4: { fantasyPoints: 14, gamesPlayed: 4, dnpWeeks: 3, stats: {} } },
        },
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.confidence).toBe('rookie')

    // Gate correctly skipped: yearsExp=3 > 1 → rookieAgeAtDraft stays null
    expect(r.factors.rookieAgeAtDraft,
      'rookieAgeAtDraft must be null for years_exp=3').toBeNull()

    // ageForLookup falls back to current age (25) → ageMult = 0.82
    expect(r.factors.ageDelta,
      'ageDelta must be 0.82 for ageForLookup=25').toBe(0.82)

    // Projection is still a positive number
    expect(r.projectedPPG).toBeGreaterThan(0)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // D1 — NFL draft slot tests (Tests 11–19)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Test 11: Top-3 pick fires multiplier and adjustmentSummary ───────────
  it('D1 top-3 pick: nflDraftMultiplier=1.30, tier=top-3, adjustmentSummary includes top-3 line', () => {
    const playerId = 'P_D1_TOP3'
    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId,
        player:          { position: 'WR', age: 21, years_exp: 0 },
        nflDraftMatches: { [playerId]: { year: 2024, round: 1, pick: 1 } },
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.confidence).toBe('rookie')
    expect(r.factors.nflDraftMultiplier).toBe(1.30)
    expect(r.factors.nflDraftTier).toBe('top-3')
    expect(r.factors.nflDraftRound).toBe(1)
    expect(r.factors.nflDraftPick).toBe(1)
    expect(r.factors.nflDraftMatchSource).toBe('matched')
    expect(r.adjustmentSummary).toContain('Top-3 NFL draft pick ↑↑')
  })

  // ── Test 12: Player absent from nflDraftMatches → unmatched sentinel ─────
  it('D1 unmatched: empty nflDraftMatches → multiplier=1.0, source=unmatched, no draft summary line', () => {
    const playerId = 'P_D1_UNMATCH'
    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId,
        nflDraftMatches: {},   // player not in map
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.factors.nflDraftMultiplier).toBe(1.0)
    expect(r.factors.nflDraftTier).toBeNull()
    expect(r.factors.nflDraftMatchSource).toBe('unmatched')
    // No NFL draft adjustment summary lines
    const draftLines = r.adjustmentSummary.filter(l => l.includes('NFL draft') || l.includes('NFL pick'))
    expect(draftLines).toHaveLength(0)
  })

  // ── Test 13: null nflDraftMatches → same neutral defaults ────────────────
  it('D1 null nflDraftMatches: same neutral defaults as unmatched', () => {
    const playerId = 'P_D1_NULL'
    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId,
        nflDraftMatches: null,
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.factors.nflDraftMultiplier).toBe(1.0)
    expect(r.factors.nflDraftTier).toBeNull()
    expect(r.factors.nflDraftMatchSource).toBe('unmatched')
  })

  // ── Test 14: Year-4 rookie-path hit — draft factor still applies ──────────
  it('D1 year-4 rookie-path: nflDraftMultiplier=0.68 (r5) still fires on no-qualifying-seasons path', () => {
    const playerId = 'P_D1_Y4'
    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId,
        player:          { position: 'WR', age: 25, years_exp: 3 },
        careerStats:     {},
        nflDraftMatches: { [playerId]: { year: 2021, round: 5, pick: 150 } },
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.confidence).toBe('rookie')
    expect(r.factors.nflDraftMultiplier).toBe(0.68)
    expect(r.factors.nflDraftTier).toBe('r5')
    expect(r.factors.nflDraftMatchSource).toBe('matched')
  })

  // ── Test 15: rookieMultiplierProduct clamp binds from above (1.85) ────────
  it('D1 clamp above: top-3 pick + high KTC + strong college → rookieMultiplierProduct=1.85', () => {
    const playerId = 'P_D1_CLAMP_HI'
    // age=21 → ageMult=1.15
    // KTC: player at 9000, pads at 500/1000/1500/2000 → player ranked highest → ktcPct=100 → ktcMult=1.30
    // college: peakDom=32 (1.20) + improving (+0.05) + finalYr=32/32 ratio≥0.85 (+0.03) + breakoutAge=19 (×1.05)
    //   collegeMult = clamp(1.28, 0.80, 1.26) = 1.26; collegeContribution = clamp(1.26×1.05, 0.75, 1.25) = 1.25
    // draft: round=1, pick=1 → 1.30
    // raw = 1.15 × 1.30 × 1.25 × 1.30 ≈ 2.43 → clamp → 1.85
    const playersMap = { [playerId]: { position: 'WR', age: 21, years_exp: 0, team: 'KC' } }
    // Build KTC map manually: target at top
    const ktcMapHi = new Map()
    ktcMapHi.set(playerId, { value: 9000, confidence: 'high' })
    for (let i = 1; i <= 4; i++) {
      const padId = `ktc_d1_hi_${i}`
      ktcMapHi.set(padId, { value: i * 500, confidence: 'low' })
      playersMap[padId] = { position: 'WR', age: 25, years_exp: 3, team: 'SF' }
    }

    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId,
        player:          { position: 'WR', age: 21, years_exp: 0 },
        extraPlayers:    Object.fromEntries(
          Object.entries(playersMap).filter(([k]) => k !== playerId)
        ),
        ktcMap:          ktcMapHi,
        collegeStats: {
          [playerId]: {
            peakDominator:      32,
            productionTrend:    'improving',
            finalYearDominator: 32,
            seasonsPlayed:      3,
            breakoutAge:        19,
          },
        },
        nflDraftMatches: { [playerId]: { year: 2024, round: 1, pick: 1 } },
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.factors.rookieMultiplierProduct,
      `clamp should bind to 1.85; got ${r.factors.rookieMultiplierProduct}. ` +
      `age=${r.factors.ageDelta}, ktc=${r.factors.ktcMult}, col=${r.factors.collegeContribution}, ` +
      `draft=${r.factors.nflDraftMultiplier}`
    ).toBe(1.85)

    // projectedPPG ≤ baseline × 1.85 (WR baseline = 7 → 12.95), after Math.round(×10)/10 rounding → ≤ 13.0
    expect(r.projectedPPG).toBeLessThanOrEqual(Math.round(7 * 1.85 * 10) / 10)
  })

  // ── Test 16: rookieMultiplierProduct clamp binds from below (0.45) ────────
  it('D1 clamp below: old rookie + R7 + weak college → rookieMultiplierProduct=0.45', () => {
    const playerId = 'P_D1_CLAMP_LO_R'
    // age=25, years_exp=0 → ageMult=0.82 (>23 bucket)
    // no KTC → ktcMult=1.0
    // college: peakDom=15 (0.92) + declining (-0.07) + finalYr=5/15 ratio<0.55 (-0.05) + no breakoutAge (1.0)
    //   collegeMult = clamp(0.80, 0.80, 1.26) = 0.80; collegeContribution = clamp(0.80, 0.75, 1.25) = 0.80
    // draft: round=7 → 0.58
    // raw = 0.82 × 1.0 × 0.80 × 0.58 ≈ 0.380 < 0.45 → clamp → 0.45
    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId,
        player:          { position: 'WR', age: 25, years_exp: 0 },
        ktcMap:          null,
        collegeStats: {
          [playerId]: {
            peakDominator:      15,
            productionTrend:    'declining',
            finalYearDominator: 5,
            seasonsPlayed:      3,
            breakoutAge:        null,
          },
        },
        nflDraftMatches: { [playerId]: { year: 2024, round: 7, pick: 232 } },
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.factors.rookieMultiplierProduct,
      `clamp should bind to 0.45; got ${r.factors.rookieMultiplierProduct}. ` +
      `age=${r.factors.ageDelta}, ktc=${r.factors.ktcMult}, col=${r.factors.collegeContribution}, ` +
      `draft=${r.factors.nflDraftMultiplier}`
    ).toBe(0.45)
  })

  // ── Test 17: Mid-pack R2 pick — clamp does not bind ───────────────────────
  it('D1 mid-pack: R2 pick + neutral inputs → rookieMultiplierProduct within (0.45, 1.85)', () => {
    const playerId = 'P_D1_MID'
    // age=22 → ageMult=1.05; no KTC → ktcMult=1.0; no college → collegeContribution=1.0
    // round=2 → nflDraftMultiplier=0.92
    // raw = 1.05 × 1.0 × 1.0 × 0.92 = 0.966 → no clamp
    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId,
        player:          { position: 'WR', age: 22, years_exp: 0 },
        ktcMap:          null,
        collegeStats:    null,
        nflDraftMatches: { [playerId]: { year: 2024, round: 2, pick: 40 } },
      }).asArgs()
    )

    expect(r).not.toBeNull()
    const rmp = r.factors.rookieMultiplierProduct
    expect(rmp, 'clamp must not bind from above').not.toBe(1.85)
    expect(rmp, 'clamp must not bind from below').not.toBe(0.45)
    expect(rmp, 'must be in (0.45, 1.85)').toBeGreaterThan(0.45)
    expect(rmp).toBeLessThan(1.85)
    // Also confirm the draft factor is applied (not 1.0)
    expect(r.factors.nflDraftMultiplier).toBe(0.92)
    expect(r.factors.nflDraftTier).toBe('r2')
  })

  // ── Test 18: Vet path unaffected — no D1 keys in vet factors ─────────────
  it('D1 vet path unaffected: passing nflDraftMatches does not inject D1 keys into vet factors', () => {
    const playerId = 'P_D1_VET'
    const r = computeNextSeasonProjection(
      ...makeVet({
        playerId,
        nflDraftMatches: { [playerId]: { year: 2020, round: 1, pick: 1 } },
      }).asArgs()
    )

    expect(r).not.toBeNull()
    // None of the D1 keys must appear in vet factors
    expect(r.factors).not.toHaveProperty('nflDraftMultiplier')
    expect(r.factors).not.toHaveProperty('nflDraftTier')
    expect(r.factors).not.toHaveProperty('nflDraftRound')
    expect(r.factors).not.toHaveProperty('nflDraftPick')
    expect(r.factors).not.toHaveProperty('nflDraftMatchSource')
    expect(r.factors).not.toHaveProperty('rookieMultiplierProduct')
    // Vet factors schema still intact
    assertFactorKeys(r.factors, VET_FACTORS_KEYS, 'Vet path with nflDraftMatches arg')
  })

  // ── Test 19: Rookie schema extension — exactly 42 keys ───────────────────
  it('D1 rookie schema: factors object has exactly 42 keys (36 pre-D1 + 6 D1)', () => {
    const playerId = 'P_D1_SCHEMA'
    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId,
        nflDraftMatches: { [playerId]: { year: 2024, round: 1, pick: 4 } },
      }).asArgs()
    )

    expect(r).not.toBeNull()
    assertFactorKeys(r.factors, ROOKIE_FACTORS_KEYS, 'D1 rookie schema (42 keys)')
    expect(Object.keys(r.factors)).toHaveLength(42)
  })

  // ── Test 10: Rookie with no college data ─────────────────────────────────
  it('rookie without college data: collegeMult=1.0, college keys are null sentinels', () => {
    const r = computeNextSeasonProjection(
      ...makeRookie({
        playerId:    'P_ROO_NOCOL',
        player:      { position: 'WR', age: 22, years_exp: 0 },
        collegeStats: null,
      }).asArgs()
    )

    expect(r).not.toBeNull()
    expect(r.confidence).toBe('rookie')
    expect(r.projectedPPG).toBeGreaterThan(0)

    // With no college data: all college fields are null or default
    expect(r.factors.collegeContribution,
      'collegeContribution should be 1.0 with no college data').toBeCloseTo(1.0, 3)

    // Individual college factor sentinels
    expect(r.factors.productionTrend).toBeNull()
    expect(r.factors.finalYearDominator).toBeNull()
    expect(r.factors.breakoutAge).toBeNull()

    // collegeBase: peakDominator is null → remains 1.0 (the default)
    expect(r.factors.collegeBase).toBeCloseTo(1.0, 3)
    // breakoutAgeFactor: breakoutAge is null → stays 1.0
    expect(r.factors.breakoutAgeFactor).toBeCloseTo(1.0, 3)
  })
})
