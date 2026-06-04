/**
 * src/utils/seasonProjection.test.js
 *
 * Integration tests for computeNextSeasonProjection — exercises the full
 * pipeline end-to-end with hand-crafted fixtures from src/__fixtures__/factories.js.
 *
 * WHAT THESE TESTS DO
 * -------------------
 * Each test constructs the options object with 15 keys that computeNextSeasonProjection needs,
 * calls the function, and asserts structural and behavioural outputs. They are
 * complementary to factorsSchema.test.js (schema contract) and cover:
 *   - Happy-path signal interaction (all 61 vet keys, confidence, PPG range)
 *   - Graceful degradation (1 qualifying season, no scoring settings, no comps)
 *   - combinedNewFactor sanity-rail behavior (new envelope upper 1.50, lower 0.67)
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
  'qbQualityFactor', 'qbQualityScore', 'combinedNewFactor', 'combinedNewFactorRaw',
  'isBreakout', 'breakoutFactor', 'isBounceBack', 'bounceBackFactor',
  'isTdReliant', 'tdRelianceFactor', 'tdDependency',
  'trajectoryFactor', 'trajectoryNormalized',
  'efficiencyFactor', 'efficiencyIndex', 'efficiencyMetrics',
  // D2 — snap share & own-rate red-zone usage (5):
  'snapShare', 'snapShareFactor', 'rzUsageRate', 'rzUsageFactor', 'rzUsageCategory',
  'positionMultiplicityRatio', 'primaryCategory', 'primaryCategoryPoints', 'secondaryCategoryPoints',
  // aDOT capture-only (3):
  'adot', 'adotDelta', 'adotSampleSize',
  'pipelinePPG', 'compPPG', 'compCount', 'compAvgSimilarity', 'compConfidence', 'compBlendWeight',
  'ktcHistDelta', 'ktcHistDeltaPct', 'ktcHistVolatility', 'ktcHistVolatilityPct',
  'ktcHistTrajectorySlope', 'ktcHistTrajectoryNormalized', 'ktcHistTrajectoryLabel',
  'ktcHistRankVsMedianTrend', 'ktcHistRankVsMedianLabel', 'ktcHistValueVsPosMedian',
  'ktcHistSampleSize', 'ktcHistWindowSpanDays', 'ktcHistConfidence',
])

// 39 pre-D1 keys + 6 D1 NFL-draft keys = 45 total.
// NOTE: D1 keys (nflDraftMultiplier etc.) are rookie-path only — do NOT add to VET_FACTORS_KEYS.
const ROOKIE_FACTORS_KEYS = new Set([
  'basePPG', 'ageDelta', 'shareTrend', 'regressionFactor', 'durabilityFactor',
  'teamFactor', 'depthFactor', 'ktcMult', 'collegeMult', 'ktcPct',
  'collegeBase', 'productionTrend', 'productionTrendAdjust',
  'finalYearDominator', 'finalYearAdjust', 'breakoutAge', 'breakoutAgeFactor',
  'collegeContribution', 'rookieAgeAtDraft',
  'positionMultiplicityRatio', 'primaryCategory', 'primaryCategoryPoints', 'secondaryCategoryPoints',
  // aDOT capture-only (3) — always null on rookie path:
  'adot', 'adotDelta', 'adotSampleSize',
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

// ─── D2 cohort helpers ────────────────────────────────────────────────────────
// These build a reference-season (max year) cohort of RBs whose only purpose is
// to populate the snap-share / RZ percentile pools. They carry NO gamesPlayed, so
// they never qualify as career comps — projectedPPG moves only via the usage
// factors under test. Returns { extraSeasonEntries, extraPlayers } to splice into
// the target's careerStats[refYear] and playersMap.

function rbSnapCohort(prefix, shares) {
  const entries = {}
  const players = {}
  shares.forEach((sh, i) => {
    const id = `${prefix}_${i}`
    entries[id] = { stats: { off_snp: Math.round(sh * 1000), tm_off_snp: 1000 } }
    players[id] = { position: 'RB', age: 25, years_exp: 3, team: 'KC' }
  })
  return { extraSeasonEntries: entries, extraPlayers: players }
}

function rbRzCohort(prefix, rates) {
  const entries = {}
  const players = {}
  rates.forEach((rate, i) => {
    const id = `${prefix}_${i}`
    entries[id] = { stats: { rush_att: 100, rush_rz_att: Math.round(rate * 100) } }
    players[id] = { position: 'RB', age: 25, years_exp: 3, team: 'KC' }
  })
  return { extraSeasonEntries: entries, extraPlayers: players }
}

// Five-season RB career at a flat 12 PPG (168 / 14). The 2024 (most-recent) season
// carries the supplied `lastStats`; cohort entries are merged into 2024 so the
// percentile pools have spread.
function rbCareerWithLastStats(id, lastStats, cohortEntries, lastFp = 168) {
  const plain = (fp = 168, gp = 14) => ({ fantasyPoints: fp, gamesPlayed: gp, dnpWeeks: 0, stats: {} })
  return {
    2020: { [id]: plain() },
    2021: { [id]: plain() },
    2022: { [id]: plain() },
    2023: { [id]: plain() },
    2024: {
      [id]: { fantasyPoints: lastFp, gamesPlayed: 14, dnpWeeks: 0, stats: { ...lastStats } },
      ...cohortEntries,
    },
  }
}

const RB_SNAP_SPREAD = [0.20, 0.30, 0.40, 0.50, 0.60, 0.70]
const RB_RZ_SPREAD   = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]

// ═══════════════════════════════════════════════════════════════════════════════
// VET PATH TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeNextSeasonProjection — vet path integration', () => {

  // ── Test 1: Happy-path fully-equipped vet ────────────────────────────────
  it('happy-path vet: emits 65 keys, reasonable PPG, valid confidence', () => {
    const r = computeNextSeasonProjection(makeVet({ playerId: 'P_VET_1' }).asOptions())

    expect(r, 'result must not be null').not.toBeNull()
    expect(r.confidence, 'confidence').toBe('high')                   // 5 qualifying seasons
    assertFactorKeys(r.factors, VET_FACTORS_KEYS, 'Happy-path vet')

    // projectedPPG is positive and within the global clamp
    expect(r.projectedPPG, 'projectedPPG > 0').toBeGreaterThan(0)
    expect(r.projectedPPG, 'projectedPPG < 40').toBeLessThan(40)

    // combinedNewFactor is always within the sanity-rail envelope
    expect(r.factors.combinedNewFactor, 'combinedNewFactor ≥ 0.67').toBeGreaterThanOrEqual(0.67)
    expect(r.factors.combinedNewFactor, 'combinedNewFactor ≤ 1.50').toBeLessThanOrEqual(1.50)

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
      makeVet({ playerId: 'P_VET_2', player: { years_exp: 2 }, careerStats: cs }).asOptions()
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

  // ── Test 3: envelope was previously too tight — product now passes through ──
  it('was clamped above: combinedNewFactor now equals the true product (> 1.30, ≤ 1.50)', () => {
    // ppgs = [8,8,8,14,14] with 2023 GP=9 → momentum accelerating, trajectory max,
    // bounce-back true. breakoutCurves gives medianPPG=7.5 at age 24 → breakout true.
    // qbQuality score=100 → qbQualityFactor=1.05. No scoring settings → tdReliance neutral.
    //
    // Raw product = 1.05 * 1.08 * 1.08 * 1.05 * 1.00 * ~1.069 * ~1.00 ≈ 1.375
    // → was clamped to 1.30 under old [0.78,1.30]; now passes through under [0.67,1.50].
    const r = computeNextSeasonProjection(
      makeVet({
        playerId:        'P_CLAMP_HI',
        player:          { age: 24, years_exp: 5 },
        careerStats:     clampHiCareerStats('P_CLAMP_HI'),
        empiricalCurves: breakoutCurves(),
        qbQualityByTeam: { KC: 100 },   // score 100 → qbQualityFactor = 1.05
      }).asOptions()
    )

    expect(r).not.toBeNull()

    // The true product passes through without clamping
    expect(r.factors.combinedNewFactor).toBe(r.factors.combinedNewFactorRaw)
    expect(r.factors.combinedNewFactor,
      `combinedNewFactor should be > 1.30 (true product, unclamped); got ${r.factors.combinedNewFactor}`
    ).toBeGreaterThan(1.30)
    expect(r.factors.combinedNewFactor,
      `combinedNewFactor should be ≤ 1.50 (within new rail); got ${r.factors.combinedNewFactor}`
    ).toBeLessThanOrEqual(1.50)

    // Confirm the signals that drove the product actually fired
    expect(r.factors.momentumLabel).toBe('accelerating')
    expect(r.factors.isBreakout).toBe(true)
    expect(r.factors.isBounceBack).toBe(true)
    expect(r.factors.qbQualityFactor).toBe(1.05)
    expect(r.factors.trajectoryFactor).toBeGreaterThan(1.05)
  })

  // ── Test 4: envelope was previously too tight — product now passes through ──
  it('was clamped below: combinedNewFactor now equals the true product (< 0.78, ≥ 0.67)', () => {
    // ppgs = [14,14,14,8,8] → decelerating momentum (0.92), trajectory ≈ 0.938.
    // qbQuality score=0 → qbQualityFactor=0.95.
    // TD-reliant last season (rush_td=8, fp=112) with scoring → tdRelianceFactor=0.93.
    // Age 26 > 24 → no breakout. Prior GP=14 → no bounce-back.
    //
    // Raw product ≈ 0.95 * 0.92 * 0.93 * 0.938 * 0.94 ≈ 0.717 < 0.78
    // → was clamped to 0.78 under old [0.78,1.30]; now passes through under [0.67,1.50].
    const scoringSettings = { rush_yd: 0.1, rush_td: 6, rush_att: 0 }

    const r = computeNextSeasonProjection(
      makeVet({
        playerId:        'P_CLAMP_LO',
        player:          { age: 26, years_exp: 5, team: 'DAL' },
        careerStats:     clampLoCareerStats('P_CLAMP_LO'),
        qbQualityByTeam: { DAL: 0 },    // score 0 → qbQualityFactor = 0.95
        scoringSettings,
        teamContext:     { teamOffense: { DAL: { rank: 16 } } },
        depthMap:        { P_CLAMP_LO: { depthOrder: 1 } },
      }).asOptions()
    )

    expect(r).not.toBeNull()

    // The true product passes through without clamping
    expect(r.factors.combinedNewFactor).toBe(r.factors.combinedNewFactorRaw)
    expect(r.factors.combinedNewFactor,
      `combinedNewFactor should be < 0.78 (true product, unclamped); got ${r.factors.combinedNewFactor}`
    ).toBeLessThan(0.78)
    expect(r.factors.combinedNewFactor,
      `combinedNewFactor should be ≥ 0.67 (within new rail); got ${r.factors.combinedNewFactor}`
    ).toBeGreaterThanOrEqual(0.67)

    // Confirm the signals that drove the product actually fired
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
      makeVet({ ...base, playerId: 'P_KTC_1', ktcHistory: null }).asOptions()
    )
    const rWithKtc = computeNextSeasonProjection(
      makeVet({
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
      }).asOptions()
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
      makeVet({
        playerId:    tgtId,
        player:      { age: 26, years_exp: 3 },
        careerStats: cs,
        extraPlayers: {
          [compId]: { position: 'RB', age: 30, years_exp: 7, team: 'SF' },
        },
      }).asOptions()
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
// D2 — SNAP SHARE & OWN-RATE RED-ZONE USAGE
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeNextSeasonProjection — D2 snap share & RZ usage', () => {

  // ── High vs low snap share moves projectedPPG ────────────────────────────
  it('high snap share lifts projectedPPG; low snap share tempers it', () => {
    const hiCohort = rbSnapCohort('D2_SNHI_C', RB_SNAP_SPREAD)
    const rHi = computeNextSeasonProjection(
      makeVet({
        playerId: 'P_D2_SNAP_HI',
        player:   { position: 'RB', age: 26, years_exp: 5, team: 'KC' },
        careerStats: rbCareerWithLastStats('P_D2_SNAP_HI',
          { off_snp: 900, tm_off_snp: 1000 }, hiCohort.extraSeasonEntries),
        extraPlayers: hiCohort.extraPlayers,
      }).asOptions()
    )

    const loCohort = rbSnapCohort('D2_SNLO_C', RB_SNAP_SPREAD)
    const rLo = computeNextSeasonProjection(
      makeVet({
        playerId: 'P_D2_SNAP_LO',
        player:   { position: 'RB', age: 26, years_exp: 5, team: 'KC' },
        careerStats: rbCareerWithLastStats('P_D2_SNAP_LO',
          { off_snp: 150, tm_off_snp: 1000 }, loCohort.extraSeasonEntries),
        extraPlayers: loCohort.extraPlayers,
      }).asOptions()
    )

    expect(rHi.factors.snapShare).toBe(0.9)
    expect(rLo.factors.snapShare).toBe(0.15)
    expect(rHi.factors.snapShareFactor).toBeGreaterThan(1)
    expect(rLo.factors.snapShareFactor).toBeLessThan(1)
    expect(rHi.projectedPPG,
      `high-snap (${rHi.projectedPPG}) should exceed low-snap (${rLo.projectedPPG})`
    ).toBeGreaterThan(rLo.projectedPPG)

    // Summary lines reflect the direction
    expect(rHi.adjustmentSummary).toContain('High snap share ↑')
    expect(rLo.adjustmentSummary).toContain('Low snap share ↓')
  })

  // ── Missing snap/RZ data → factors inert (regression guard) ───────────────
  it('missing snap data → usage factors are inert (1.0), snapShare null', () => {
    // Default makeVet's makeSeasonEntry carries no off_snp/tm_off_snp fields and a
    // sub-cohort rush_att (20 < 30), so both usage factors stay neutral and the
    // pipeline product is byte-identical to pre-D2.
    const r = computeNextSeasonProjection(makeVet({ playerId: 'P_D2_INERT' }).asOptions())

    expect(r.factors.snapShare).toBeNull()
    expect(r.factors.snapShareFactor).toBe(1.0)
    expect(r.factors.rzUsageFactor).toBe(1.0)
    // No usage adjustment lines when factors are neutral
    expect(r.adjustmentSummary).not.toContain('High snap share ↑')
    expect(r.adjustmentSummary).not.toContain('Low snap share ↓')
    expect(r.adjustmentSummary).not.toContain('Red-zone role ↑')
    expect(r.adjustmentSummary).not.toContain('Limited red-zone role ↓')
  })

  // ── High vs low RZ own-rate moves projectedPPG; category recorded ─────────
  it('high RZ own-rate lifts projectedPPG; low tempers; rzUsageCategory = rush', () => {
    const hiCohort = rbRzCohort('D2_RZHI_C', RB_RZ_SPREAD)
    const rHi = computeNextSeasonProjection(
      makeVet({
        playerId: 'P_D2_RZ_HI',
        player:   { position: 'RB', age: 26, years_exp: 5, team: 'KC' },
        // rush_rz_att 40 → rate 0.40, strictly above the cohort max (0.30).
        careerStats: rbCareerWithLastStats('P_D2_RZ_HI',
          { rush_att: 100, rush_rz_att: 40, rush_yd: 400, rush_td: 2 }, hiCohort.extraSeasonEntries),
        extraPlayers: hiCohort.extraPlayers,
      }).asOptions()
    )

    const loCohort = rbRzCohort('D2_RZLO_C', RB_RZ_SPREAD)
    const rLo = computeNextSeasonProjection(
      makeVet({
        playerId: 'P_D2_RZ_LO',
        player:   { position: 'RB', age: 26, years_exp: 5, team: 'KC' },
        careerStats: rbCareerWithLastStats('P_D2_RZ_LO',
          { rush_att: 100, rush_rz_att: 5, rush_yd: 400, rush_td: 2 }, loCohort.extraSeasonEntries),
        extraPlayers: loCohort.extraPlayers,
      }).asOptions()
    )

    expect(rHi.factors.rzUsageRate).toBe(0.4)
    expect(rLo.factors.rzUsageRate).toBe(0.05)
    expect(rHi.factors.rzUsageCategory).toBe('rush')
    expect(rLo.factors.rzUsageCategory).toBe('rush')
    expect(rHi.factors.rzUsageFactor).toBeGreaterThan(1)
    expect(rLo.factors.rzUsageFactor).toBeLessThan(1)
    expect(rHi.projectedPPG,
      `high-RZ (${rHi.projectedPPG}) should exceed low-RZ (${rLo.projectedPPG})`
    ).toBeGreaterThan(rLo.projectedPPG)
    expect(rHi.adjustmentSummary).toContain('Red-zone role ↑')
    expect(rLo.adjustmentSummary).toContain('Limited red-zone role ↓')
  })

  // ── §5.1 committee RB: low snap corrects the depth-1 "starter" label ──────
  it('committee RB (depthOrder 1 + low snap): snapShareFactor < 1 despite depthFactor 1.05', () => {
    const cohort = rbSnapCohort('D2_COMM_C', RB_SNAP_SPREAD)
    const r = computeNextSeasonProjection(
      makeVet({
        playerId: 'P_D2_COMMITTEE',
        player:   { position: 'RB', age: 26, years_exp: 5, team: 'KC' },
        careerStats: rbCareerWithLastStats('P_D2_COMMITTEE',
          { off_snp: 290, tm_off_snp: 1000 }, cohort.extraSeasonEntries),
        extraPlayers: cohort.extraPlayers,
        depthMap: { P_D2_COMMITTEE: { depthOrder: 1 } },
      }).asOptions()
    )

    // Depth chart calls the player a starter…
    expect(r.factors.depthFactor).toBe(1.05)
    // …but the low snap share corrects that overstatement.
    expect(r.factors.snapShare).toBe(0.29)
    expect(r.factors.snapShareFactor).toBeLessThan(1)
  })

  // ── §5.2 high RZ + TD-reliant: RZ cannot fully offset the TD-reliance ──────
  it('high RZ + TD-reliant: rzUsageFactor > 1 but rzUsageFactor × tdRelianceFactor < 1', () => {
    const cohort = rbRzCohort('D2_RZTD_C', RB_RZ_SPREAD)
    const r = computeNextSeasonProjection(
      makeVet({
        playerId: 'P_D2_RZ_TD',
        player:   { position: 'RB', age: 26, years_exp: 5, team: 'KC' },
        // 2024 last season: rush_td=10 with fp=112 → TD points (60) > 40% → TD-reliant.
        careerStats: rbCareerWithLastStats('P_D2_RZ_TD',
          { rush_att: 100, rush_rz_att: 30, rush_yd: 200, rush_td: 10 },
          cohort.extraSeasonEntries, 112),
        extraPlayers: cohort.extraPlayers,
        scoringSettings: { rush_yd: 0.1, rush_td: 6, rush_att: 0 },
      }).asOptions()
    )

    expect(r.factors.isTdReliant).toBe(true)
    expect(r.factors.tdRelianceFactor).toBe(0.93)
    expect(r.factors.rzUsageFactor).toBeGreaterThan(1)
    expect(r.factors.rzUsageFactor * r.factors.tdRelianceFactor,
      'structural RZ role softens but does not fully offset TD-reliance'
    ).toBeLessThan(1)
  })

  // ── Upper rail (1.50) binds when snap + RZ push product above 1.50 ───────────
  it('new upper rail: all signals stacked + high snap + high RZ → combinedNewFactor = 1.50', () => {
    const id = 'P_D2_CLAMP_HI'
    const cs = clampHiCareerStats(id)
    // Augment the most-recent (2024) season with high snap + high RZ data.
    cs[2024][id].stats = {
      ...cs[2024][id].stats,
      off_snp: 900, tm_off_snp: 1000, rush_att: 100, rush_rz_att: 30, rush_yd: 400,
    }
    // Cohort players (snap + rz spread) so both percentile pools have a reference.
    const extraPlayers = {}
    RB_SNAP_SPREAD.forEach((sh, i) => {
      cs[2024][`D2_CH_${i}`] = {
        stats: {
          off_snp: Math.round(sh * 1000), tm_off_snp: 1000,
          rush_att: 100, rush_rz_att: Math.round(RB_RZ_SPREAD[i] * 100),
        },
      }
      extraPlayers[`D2_CH_${i}`] = { position: 'RB', age: 25, years_exp: 3, team: 'KC' }
    })

    const r = computeNextSeasonProjection(
      makeVet({
        playerId:        id,
        player:          { position: 'RB', age: 24, years_exp: 5 },
        careerStats:     cs,
        empiricalCurves: breakoutCurves(),
        qbQualityByTeam: { KC: 100 },
        extraPlayers,
      }).asOptions()
    )

    expect(r).not.toBeNull()
    expect(r.factors.snapShareFactor).toBeGreaterThan(1)
    expect(r.factors.rzUsageFactor).toBeGreaterThan(1)
    // Product exceeds 1.50 → new upper rail binds
    expect(r.factors.combinedNewFactorRaw,
      `combinedNewFactorRaw should exceed 1.50; got ${r.factors.combinedNewFactorRaw}`
    ).toBeGreaterThan(1.50)
    expect(r.factors.combinedNewFactor,
      `new upper rail must bind at 1.50; got ${r.factors.combinedNewFactor}`
    ).toBe(1.5)
  })

  // ── QB gated out of snap share even with full snap data ───────────────────
  it('QB with full snap data → snapShareFactor 1.0, snapShare null; RZ pass-rate still fires', () => {
    const id = 'P_D2_QB'
    const qs = () => ({
      fantasyPoints: 320, gamesPlayed: 16, dnpWeeks: 0,
      stats: { off_snp: 950, tm_off_snp: 1000, pass_att: 550, pass_yd: 4200, pass_td: 32, pass_int: 10, pass_rz_att: 75 },
    })
    const cs = {
      2020: { [id]: qs() }, 2021: { [id]: qs() }, 2022: { [id]: qs() },
      2023: { [id]: qs() }, 2024: { [id]: qs() },
    }
    const r = computeNextSeasonProjection(
      makeVet({
        playerId: id,
        player:   { position: 'QB', age: 28, years_exp: 7, team: 'KC' },
        careerStats: cs,
      }).asOptions()
    )

    expect(r.factors.snapShare).toBeNull()
    expect(r.factors.snapShareFactor).toBe(1.0)
    // QB is still in scope for RZ pass-rate
    expect(r.factors.rzUsageCategory).toBe('pass')
    expect(r.factors.rzUsageRate).not.toBeNull()
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
      makeRookie({
        playerId,
        player:       { position: 'WR', age: 22, years_exp: 0 },
        extraPlayers: Object.fromEntries(
          [...ktcMap.keys()].filter(k => k !== playerId).map(k => [k, playersMap[k]])
        ),
        ktcMap,
        collegeStats,
      }).asOptions()
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
      makeRookie({ playerId: 'P_ROO_SOPH', player: { age: 23, years_exp: 1 } }).asOptions()
    )
    const rAge23 = computeNextSeasonProjection(
      makeRookie({ playerId: 'P_ROO_SOPH2', player: { age: 23, years_exp: 0 } }).asOptions()
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
      makeRookie({
        playerId: 'P_ROO_Y4',
        player:   { position: 'WR', age: 25, years_exp: 3 },
        // careerStats has one season but GP<8 → doesn't qualify
        careerStats: {
          2023: { P_ROO_Y4: { fantasyPoints: 14, gamesPlayed: 4, dnpWeeks: 3, stats: {} } },
        },
      }).asOptions()
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
      makeRookie({
        playerId,
        player:          { position: 'WR', age: 21, years_exp: 0 },
        nflDraftMatches: { [playerId]: { year: 2024, round: 1, pick: 1 } },
      }).asOptions()
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
      makeRookie({
        playerId,
        nflDraftMatches: {},   // player not in map
      }).asOptions()
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
      makeRookie({
        playerId,
        nflDraftMatches: null,
      }).asOptions()
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
      makeRookie({
        playerId,
        player:          { position: 'WR', age: 25, years_exp: 3 },
        careerStats:     {},
        nflDraftMatches: { [playerId]: { year: 2021, round: 5, pick: 150 } },
      }).asOptions()
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
      makeRookie({
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
      }).asOptions()
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
      makeRookie({
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
      }).asOptions()
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
      makeRookie({
        playerId,
        player:          { position: 'WR', age: 22, years_exp: 0 },
        ktcMap:          null,
        collegeStats:    null,
        nflDraftMatches: { [playerId]: { year: 2024, round: 2, pick: 40 } },
      }).asOptions()
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
      makeVet({
        playerId,
        nflDraftMatches: { [playerId]: { year: 2020, round: 1, pick: 1 } },
      }).asOptions()
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
  it('D1 rookie schema: factors object has exactly 45 keys (39 pre-D1 + 6 D1)', () => {
    const playerId = 'P_D1_SCHEMA'
    const r = computeNextSeasonProjection(
      makeRookie({
        playerId,
        nflDraftMatches: { [playerId]: { year: 2024, round: 1, pick: 4 } },
      }).asOptions()
    )

    expect(r).not.toBeNull()
    assertFactorKeys(r.factors, ROOKIE_FACTORS_KEYS, 'D1 rookie schema (45 keys)')
    expect(Object.keys(r.factors)).toHaveLength(45)
  })

  // ── Test 10: Rookie with no college data ─────────────────────────────────
  it('rookie without college data: collegeMult=1.0, college keys are null sentinels', () => {
    const r = computeNextSeasonProjection(
      makeRookie({
        playerId:    'P_ROO_NOCOL',
        player:      { position: 'WR', age: 22, years_exp: 0 },
        collegeStats: null,
      }).asOptions()
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

// ═══════════════════════════════════════════════════════════════════════════════
// C4 — QB PASSER-RATING EFFICIENCY
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeNextSeasonProjection — C4 QB passer-rating efficiency', () => {
  // Four cohort QBs shared by both target runs — ensures percentile pool is
  // non-degenerate (mirrors makeQBCareerStats approach from efficiencyMetrics.test.js).
  const qbCohortEntries = {
    QB_C4_C1: { gamesPlayed: 16, stats: { pass_att: 500, pass_cmp: 350, pass_yd: 4500, pass_td: 40, pass_int: 5  } }, // rating ≈ 120.4
    QB_C4_C2: { gamesPlayed: 16, stats: { pass_att: 400, pass_cmp: 260, pass_yd: 3200, pass_td: 28, pass_int: 12 } }, // rating ≈ 100.4
    QB_C4_C3: { gamesPlayed: 16, stats: { pass_att: 300, pass_cmp: 195, pass_yd: 2100, pass_td: 18, pass_int: 9  } }, // rating ≈  92.9
    QB_C4_C4: { gamesPlayed: 16, stats: { pass_att: 250, pass_cmp: 150, pass_yd: 1500, pass_td: 10, pass_int: 15 } }, // rating ≈  65.4
  }
  const qbCohortPlayers = {
    QB_C4_C1: { position: 'QB', age: 28, years_exp: 6, team: 'KC' },
    QB_C4_C2: { position: 'QB', age: 27, years_exp: 5, team: 'SF' },
    QB_C4_C3: { position: 'QB', age: 26, years_exp: 4, team: 'DAL' },
    QB_C4_C4: { position: 'QB', age: 29, years_exp: 7, team: 'NYG' },
  }

  // Five-season QB career at a flat PPG. The 2024 (most-recent) season carries
  // the supplied lastPassStats; cohort entries are merged into 2024.
  function qbEffCareerStats(id, lastPassStats) {
    const s = () => ({
      fantasyPoints: 280, gamesPlayed: 16, dnpWeeks: 0,
      stats: { pass_att: 400, pass_cmp: 260, pass_yd: 3200, pass_td: 25, pass_int: 10 },
    })
    return {
      2020: { [id]: s() },
      2021: { [id]: s() },
      2022: { [id]: s() },
      2023: { [id]: s() },
      2024: {
        [id]: { fantasyPoints: 280, gamesPlayed: 16, dnpWeeks: 0, stats: { ...lastPassStats } },
        ...qbCohortEntries,
      },
    }
  }

  it('great pass stats yield higher efficiencyFactor and higher projectedPPG than poor pass stats', () => {
    const GREAT_STATS = { pass_att: 500, pass_cmp: 375, pass_yd: 4500, pass_td: 45, pass_int: 4  }
    const POOR_STATS  = { pass_att: 400, pass_cmp: 220, pass_yd: 2800, pass_td: 15, pass_int: 20 }

    const rGreat = computeNextSeasonProjection(
      makeVet({
        playerId:     'P_C4_QB_GREAT',
        player:       { position: 'QB', age: 28, years_exp: 7, team: 'KC' },
        careerStats:  qbEffCareerStats('P_C4_QB_GREAT', GREAT_STATS),
        extraPlayers: qbCohortPlayers,
      }).asOptions()
    )

    const rPoor = computeNextSeasonProjection(
      makeVet({
        playerId:     'P_C4_QB_POOR',
        player:       { position: 'QB', age: 28, years_exp: 7, team: 'KC' },
        careerStats:  qbEffCareerStats('P_C4_QB_POOR', POOR_STATS),
        extraPlayers: qbCohortPlayers,
      }).asOptions()
    )

    expect(rGreat, 'great QB result must not be null').not.toBeNull()
    expect(rPoor,  'poor QB result must not be null').not.toBeNull()

    expect(rGreat.factors.efficiencyFactor,
      `great QB efficiencyFactor (${rGreat.factors.efficiencyFactor}) must exceed ` +
      `poor QB's (${rPoor.factors.efficiencyFactor})`
    ).toBeGreaterThan(rPoor.factors.efficiencyFactor)

    expect(rGreat.projectedPPG,
      `great QB projectedPPG (${rGreat.projectedPPG}) must exceed ` +
      `poor QB's (${rPoor.projectedPPG})`
    ).toBeGreaterThan(rPoor.projectedPPG)

    // efficiencyMetrics inner shape: QB has passerRating and completionPct
    expect(rGreat.factors.efficiencyMetrics).not.toBeNull()
    const em = rGreat.factors.efficiencyMetrics
    expect(typeof em.passerRating).toBe('number')
    expect(typeof em.completionPct).toBe('number')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// aDOT CAPTURE-ONLY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeNextSeasonProjection — aDOT capture-only', () => {

  // ── WR with rec_air_yd across 2 qualifying seasons ───────────────────────
  it('WR with rec_air_yd and 2 qualifying seasons: adot, adotDelta, adotSampleSize all computed', () => {
    // 2023: rec_tgt=100, rec_air_yd=450 → prevAdot = 4.5
    // 2024: rec_tgt=120, rec_air_yd=720 → adot = 6.0
    // adotDelta = 6.0 − 4.5 = 1.5; adotSampleSize = 120
    const id = 'P_ADOT_WR2'
    const cs = {
      2023: { [id]: { fantasyPoints: 154, gamesPlayed: 14, dnpWeeks: 0,
        stats: { rec_tgt: 100, rec: 65, rec_yd: 800, rec_td: 5, rec_air_yd: 450 } } },
      2024: { [id]: { fantasyPoints: 182, gamesPlayed: 15, dnpWeeks: 0,
        stats: { rec_tgt: 120, rec: 80, rec_yd: 1000, rec_td: 7, rec_air_yd: 720 } } },
    }
    const r = computeNextSeasonProjection(
      makeVet({ playerId: id, player: { position: 'WR', age: 26, years_exp: 3 }, careerStats: cs }).asOptions()
    )
    expect(r).not.toBeNull()
    // Exact values from clean integer arithmetic
    expect(r.factors.adot,          'adot = 720/120 = 6').toBe(6)
    expect(r.factors.adotDelta,     'adotDelta = 6 − 4.5 = 1.5').toBe(1.5)
    expect(r.factors.adotSampleSize,'adotSampleSize = latest rec_tgt = 120').toBe(120)
    // Capture-only: schema intact
    assertFactorKeys(r.factors, VET_FACTORS_KEYS, 'WR aDOT two-season')
  })

  // ── TE with rec_air_yd (1 qualifying season) ─────────────────────────────
  it('TE with rec_air_yd and 1 qualifying season: adot and adotSampleSize computed, adotDelta null', () => {
    // rec_tgt=80, rec_air_yd=320 → adot = 4.0; single season → adotDelta null
    const id = 'P_ADOT_TE'
    const cs = {
      2024: { [id]: { fantasyPoints: 168, gamesPlayed: 14, dnpWeeks: 0,
        stats: { rec_tgt: 80, rec: 60, rec_yd: 700, rec_td: 5, rec_air_yd: 320 } } },
    }
    const r = computeNextSeasonProjection(
      makeVet({ playerId: id, player: { position: 'TE', age: 26, years_exp: 3 }, careerStats: cs }).asOptions()
    )
    expect(r).not.toBeNull()
    expect(r.factors.adot,           'adot = 320/80 = 4').toBe(4)
    expect(r.factors.adotSampleSize, 'adotSampleSize = 80').toBe(80)
    expect(r.factors.adotDelta,      'adotDelta null with 1 qualifying season').toBeNull()
  })

  // ── RB: null sentinels (Q3 resolution) ───────────────────────────────────
  it('RB with rec_air_yd: all three aDOT fields null (Q3 resolution — RB out of scope)', () => {
    const id = 'P_ADOT_RB'
    const cs = {
      2023: { [id]: { fantasyPoints: 154, gamesPlayed: 14, dnpWeeks: 0,
        stats: { rec_tgt: 50, rec: 35, rec_yd: 300, rec_air_yd: 80 } } },
      2024: { [id]: { fantasyPoints: 182, gamesPlayed: 14, dnpWeeks: 0,
        stats: { rec_tgt: 60, rec: 40, rec_yd: 350, rec_air_yd: 90 } } },
    }
    const r = computeNextSeasonProjection(
      makeVet({ playerId: id, player: { position: 'RB', age: 26, years_exp: 3 }, careerStats: cs }).asOptions()
    )
    expect(r).not.toBeNull()
    expect(r.factors.adot).toBeNull()
    expect(r.factors.adotDelta).toBeNull()
    expect(r.factors.adotSampleSize).toBeNull()
  })

  // ── QB: null sentinels (Q3 resolution) ───────────────────────────────────
  it('QB with pass_air_yd: all three aDOT fields null (Q3 resolution — QB out of scope)', () => {
    const id = 'P_ADOT_QB'
    const qbSeason = () => ({ fantasyPoints: 280, gamesPlayed: 16, dnpWeeks: 0,
      stats: { pass_att: 400, pass_yd: 3200, pass_td: 25, pass_int: 10, pass_air_yd: 1400 } })
    const cs = {
      2020: { [id]: qbSeason() }, 2021: { [id]: qbSeason() }, 2022: { [id]: qbSeason() },
      2023: { [id]: qbSeason() }, 2024: { [id]: qbSeason() },
    }
    const r = computeNextSeasonProjection(
      makeVet({ playerId: id, player: { position: 'QB', age: 28, years_exp: 5 }, careerStats: cs }).asOptions()
    )
    expect(r).not.toBeNull()
    expect(r.factors.adot).toBeNull()
    expect(r.factors.adotDelta).toBeNull()
    expect(r.factors.adotSampleSize).toBeNull()
  })

  // ── Rookie path: null sentinels ───────────────────────────────────────────
  it('rookie path: adot, adotDelta, adotSampleSize all null', () => {
    const r = computeNextSeasonProjection(
      makeRookie({ playerId: 'P_ADOT_RK' }).asOptions()
    )
    expect(r).not.toBeNull()
    expect(r.confidence).toBe('rookie')
    expect(r.factors.adot).toBeNull()
    expect(r.factors.adotDelta).toBeNull()
    expect(r.factors.adotSampleSize).toBeNull()
    assertFactorKeys(r.factors, ROOKIE_FACTORS_KEYS, 'Rookie aDOT sentinels')
  })

  // ── Missing rec_air_yd → all null ────────────────────────────────────────
  it('WR missing rec_air_yd: adot, adotDelta, adotSampleSize all null', () => {
    const id = 'P_ADOT_NOAIR'
    const cs = {
      2023: { [id]: { fantasyPoints: 154, gamesPlayed: 14, dnpWeeks: 0,
        stats: { rec_tgt: 100, rec: 65, rec_yd: 800, rec_td: 5 } } },
      2024: { [id]: { fantasyPoints: 182, gamesPlayed: 15, dnpWeeks: 0,
        stats: { rec_tgt: 120, rec: 80, rec_yd: 1000, rec_td: 7 } } },
    }
    const r = computeNextSeasonProjection(
      makeVet({ playerId: id, player: { position: 'WR', age: 26, years_exp: 3 }, careerStats: cs }).asOptions()
    )
    expect(r).not.toBeNull()
    expect(r.factors.adot).toBeNull()
    expect(r.factors.adotDelta).toBeNull()
    expect(r.factors.adotSampleSize).toBeNull()
  })

  // ── Single qualifying season → adotDelta null, adot computed ─────────────
  it('WR with 1 qualifying season: adot computed, adotDelta null (null sentinel, not zero)', () => {
    const id = 'P_ADOT_WR1'
    const cs = {
      2024: { [id]: { fantasyPoints: 168, gamesPlayed: 14, dnpWeeks: 0,
        stats: { rec_tgt: 80, rec: 55, rec_yd: 700, rec_td: 4, rec_air_yd: 480 } } },
    }
    const r = computeNextSeasonProjection(
      makeVet({ playerId: id, player: { position: 'WR', age: 26, years_exp: 3 }, careerStats: cs }).asOptions()
    )
    expect(r).not.toBeNull()
    // adot = 480/80 = 6.0
    expect(r.factors.adot).toBe(6)
    // Only 1 qualifying season → adotDelta is null, not 0
    expect(r.factors.adotDelta).toBeNull()
    expect(r.factors.adotSampleSize).toBe(80)
  })

  // ── Regression guard: capture-only — projectedPPG unaffected ─────────────
  it('aDOT capture-only: projectedPPG identical with or without rec_air_yd (WR regression guard)', () => {
    const makeWrCareer = (id, withAirYd) => {
      const s = () => ({
        fantasyPoints: 168, gamesPlayed: 14, dnpWeeks: 0,
        stats: {
          rec_tgt: 80, rec: 55, rec_yd: 700, rec_td: 4,
          ...(withAirYd ? { rec_air_yd: 480 } : {}),
        },
      })
      return {
        2020: { [id]: s() }, 2021: { [id]: s() }, 2022: { [id]: s() },
        2023: { [id]: s() }, 2024: { [id]: s() },
      }
    }

    const rAir = computeNextSeasonProjection(
      makeVet({
        playerId: 'P_ADOT_REG_AIR',
        player:   { position: 'WR', age: 26, years_exp: 5 },
        careerStats: makeWrCareer('P_ADOT_REG_AIR', true),
      }).asOptions()
    )
    const rNoAir = computeNextSeasonProjection(
      makeVet({
        playerId: 'P_ADOT_REG_NO',
        player:   { position: 'WR', age: 26, years_exp: 5 },
        careerStats: makeWrCareer('P_ADOT_REG_NO', false),
      }).asOptions()
    )

    expect(rAir).not.toBeNull()
    expect(rNoAir).not.toBeNull()

    // aDOT fields populated when rec_air_yd present, absent when missing
    expect(rAir.factors.adot,          'adot populated with rec_air_yd').not.toBeNull()
    expect(rAir.factors.adotSampleSize,'adotSampleSize populated').toBe(80)
    expect(rNoAir.factors.adot,        'adot null without rec_air_yd').toBeNull()

    // projectedPPG must be byte-identical — aDOT is capture-only
    expect(rAir.projectedPPG,
      `aDOT must not move projectedPPG: with=${rAir.projectedPPG}, without=${rNoAir.projectedPPG}`
    ).toBe(rNoAir.projectedPPG)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// CLAMP RESTRUCTURE — REGRESSION & ENVELOPE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeNextSeasonProjection — clamp restructure (Option A)', () => {

  // ── Typical-case regression pins (6 cases) ───────────────────────────────
  // Option A is byte-identical for players whose product was inside [0.78,1.30].
  // These flat-career fixtures produce combinedNewFactor === 1.0 exactly because
  // every signal is neutral (stable momentum, flat trajectory, no binary flags,
  // no efficiency/snap/rz cohort data). Pin the exact value and verify
  // combinedNewFactor === combinedNewFactorRaw (no clamp fired).

  it('regression: RB flat career → combinedNewFactor 1.0 exactly, raw matches', () => {
    const r = computeNextSeasonProjection(
      makeVet({ playerId: 'P_REG_RB', player: { position: 'RB', age: 26, years_exp: 5 } }).asOptions()
    )
    expect(r.factors.combinedNewFactor).toBe(1)
    expect(r.factors.combinedNewFactorRaw).toBe(1)
    expect(r.factors.combinedNewFactor).toBe(r.factors.combinedNewFactorRaw)
  })

  it('regression: WR flat career → combinedNewFactor 1.0 exactly, raw matches', () => {
    const r = computeNextSeasonProjection(
      makeVet({ playerId: 'P_REG_WR', player: { position: 'WR', age: 27, years_exp: 5 } }).asOptions()
    )
    expect(r.factors.combinedNewFactor).toBe(1)
    expect(r.factors.combinedNewFactorRaw).toBe(1)
    expect(r.factors.combinedNewFactor).toBe(r.factors.combinedNewFactorRaw)
  })

  it('regression: TE flat career → combinedNewFactor 1.0 exactly, raw matches', () => {
    const r = computeNextSeasonProjection(
      makeVet({ playerId: 'P_REG_TE', player: { position: 'TE', age: 28, years_exp: 5 } }).asOptions()
    )
    expect(r.factors.combinedNewFactor).toBe(1)
    expect(r.factors.combinedNewFactorRaw).toBe(1)
    expect(r.factors.combinedNewFactor).toBe(r.factors.combinedNewFactorRaw)
  })

  it('regression: QB flat career → combinedNewFactor 1.0 exactly, raw matches', () => {
    const r = computeNextSeasonProjection(
      makeVet({ playerId: 'P_REG_QB', player: { position: 'QB', age: 30, years_exp: 7 } }).asOptions()
    )
    expect(r.factors.combinedNewFactor).toBe(1)
    expect(r.factors.combinedNewFactorRaw).toBe(1)
    expect(r.factors.combinedNewFactor).toBe(r.factors.combinedNewFactorRaw)
  })

  it('regression: ascending career (positive signals, inside old bounds) → raw matches clamped', () => {
    // clampHiCareerStats WITHOUT breakoutCurves / qbQuality:
    //   momentum 1.08 (accelerating) × bounceBack 1.05 × trajectory ≈1.069 × others 1.0
    //   product ≈ 1.213 — inside old [0.78,1.30] → byte-identical before and after.
    const r = computeNextSeasonProjection(
      makeVet({
        playerId:    'P_REG_ASC',
        player:      { position: 'RB', age: 24, years_exp: 5 },
        careerStats: clampHiCareerStats('P_REG_ASC'),
        // No breakoutCurves → isBreakout=false; no qbQuality → qbQualityFactor=1.0
      }).asOptions()
    )
    expect(r.factors.combinedNewFactor).toBe(r.factors.combinedNewFactorRaw)
    expect(r.factors.combinedNewFactor).toBeGreaterThan(0.78)
    expect(r.factors.combinedNewFactor).toBeLessThan(1.30)
    // Exact pin — the value must be stable between runs (Option A byte-identical guarantee)
    expect(r.factors.combinedNewFactor).toBe(1.213)
  })

  it('regression: declining career (negative signals, inside old bounds) → raw matches clamped', () => {
    // clampLoCareerStats WITHOUT qbQuality / scoring:
    //   momentum 0.92 (decelerating) × trajectory ≈0.938 × efficiency ≈0.94 × rzUsage ≈0.97
    //   (rush_att=60 >= 30 → rz fires; rzRate=0 vs pool of 1 at same rate → 0th pct → ≈0.97)
    //   product ≈ 0.787 — inside old [0.78,1.30] → byte-identical before and after.
    const r = computeNextSeasonProjection(
      makeVet({
        playerId:    'P_REG_DEC',
        player:      { position: 'RB', age: 26, years_exp: 5 },
        careerStats: clampLoCareerStats('P_REG_DEC'),
        // No scoringSettings → tdReliance neutral; no qbQuality → qbQualityFactor=1.0
      }).asOptions()
    )
    expect(r.factors.combinedNewFactor).toBe(r.factors.combinedNewFactorRaw)
    expect(r.factors.combinedNewFactor).toBeGreaterThan(0.78)
    expect(r.factors.combinedNewFactor).toBeLessThan(1.30)
    // Exact pin — the value must be stable between runs (Option A byte-identical guarantee)
    expect(r.factors.combinedNewFactor).toBe(0.787)
  })

  // ── Envelope bound (intent pin) ──────────────────────────────────────────
  // Documents that the [0.67, 1.50] rail still exists and where it sits.
  // Upper rail: covered by the D2 extreme test above (product > 1.50 → clamped to 1.50).
  // Lower rail: all negative signals stacked to produce product < 0.67.

  it('lower rail: all negative signals stacked → combinedNewFactor === 0.67, raw < 0.67', () => {
    // Declining career (momentum 0.92, trajectory 0.938) + qbQuality 0.95 +
    // tdReliance 0.93 + efficiency near-min (cohort all above target) +
    // snap near-min (target barely participates) + rz near-min (same):
    //   product ≈ 0.638 < 0.67 → lower rail fires.
    const id = 'P_ENV_BOUND_LO'
    const scoringSettings = { rush_yd: 0.1, rush_td: 6 }

    // Build careerStats from clampLo (declining) and augment 2024 with
    // a large workload that is still bottom-of-cohort on all efficiency/snap/rz metrics.
    const cs = clampLoCareerStats(id)
    cs[2024][id].stats = {
      ...cs[2024][id].stats,
      // High rush_att → low shrinkage → efficiency penalty sticks; poor ypc relative to cohort
      rush_att: 600, rush_yd: 600,    // ypc=1.0, rushTdRate=8/600≈0.013 (both below cohort)
      off_snp: 200, tm_off_snp: 5000, // snap share 0.04, far below cohort
      rush_rz_att: 3,                  // rz rate 3/600=0.005, far below cohort
    }
    // Cohort: all above the target on every metric
    const cohortEntries = {
      ELo_1: { gamesPlayed: 16, stats: { rush_att: 200, rush_yd: 1200, rush_td: 16, off_snp: 800,  tm_off_snp: 1000, rush_rz_att: 60 } },
      ELo_2: { gamesPlayed: 16, stats: { rush_att: 200, rush_yd: 1000, rush_td: 14, off_snp: 850,  tm_off_snp: 1000, rush_rz_att: 50 } },
      ELo_3: { gamesPlayed: 16, stats: { rush_att: 200, rush_yd: 800,  rush_td: 12, off_snp: 900,  tm_off_snp: 1000, rush_rz_att: 40 } },
      ELo_4: { gamesPlayed: 16, stats: { rush_att: 200, rush_yd: 1400, rush_td: 18, off_snp: 950,  tm_off_snp: 1000, rush_rz_att: 70 } },
    }
    Object.assign(cs[2024], cohortEntries)

    const r = computeNextSeasonProjection(
      makeVet({
        playerId:        id,
        player:          { position: 'RB', age: 26, years_exp: 5, team: 'KC' },
        careerStats:     cs,
        qbQualityByTeam: { KC: 0 },   // score 0 → qbQualityFactor = 0.95
        scoringSettings,
        extraPlayers: {
          ELo_1: { position: 'RB', age: 26, years_exp: 5, team: 'KC' },
          ELo_2: { position: 'RB', age: 25, years_exp: 4, team: 'KC' },
          ELo_3: { position: 'RB', age: 27, years_exp: 6, team: 'KC' },
          ELo_4: { position: 'RB', age: 28, years_exp: 7, team: 'KC' },
        },
      }).asOptions()
    )

    expect(r).not.toBeNull()
    // Lower rail fires
    expect(r.factors.combinedNewFactor).toBe(0.67)
    expect(r.factors.combinedNewFactorRaw).toBeLessThan(0.67)

    // Sanity: the key negative signals all fired as intended
    expect(r.factors.momentumLabel).toBe('decelerating')
    expect(r.factors.isTdReliant).toBe(true)
    expect(r.factors.qbQualityFactor).toBe(0.95)
    expect(r.factors.efficiencyFactor).toBeLessThan(1)
    expect(r.factors.snapShareFactor).toBeLessThan(1)
    expect(r.factors.rzUsageFactor).toBeLessThan(1)
  })
})
