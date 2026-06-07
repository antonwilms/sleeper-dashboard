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
 * Current code is the authoritative source; the canonical count here is 73 vet / 51 rookie
 * (56 explicit + 13 ktcSignals; C4 added efficiencyMetrics sub-object; clamp
 * restructure added combinedNewFactorRaw; D2 added 5 usage keys; D3 added 3 team-RZ-share keys;
 * injury-backup heuristic added injurySeasons diagnostic;
 * team-change handling added isTeamChange/prevTeam/newTeam/depthStale).
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

// Vet-path factors: 57 explicit keys + 13 ktcSignals + 3 teamChangeFactors = 73 total.
// Derived from the `return { ... factors: { ... ...ktcSignals, ...teamChangeFactors } }` block.
const VET_FACTORS_KEYS = new Set([
  'basePPG', 'ageDelta', 'shareTrend', 'regressionFactor', 'regressionFactorRaw',
  'consistencyScore', 'consistencyBand', 'consistencyScale',
  'durabilityFactor', 'injurySeasons', 'teamFactor', 'depthFactor', 'depthStale',
  'momentumFactor', 'momentumLabel', 'absenceShapeFactor', 'absenceShape',
  'shareTrendRaw', 'shareVolatilityLabel', 'shareVolatilityScale',
  'qbQualityFactor', 'qbQualityScore', 'combinedNewFactor', 'combinedNewFactorRaw',
  'isBreakout', 'breakoutFactor', 'isBounceBack', 'bounceBackFactor',
  'isTdReliant', 'tdRelianceFactor', 'tdDependency',
  'trajectoryFactor', 'trajectoryNormalized',
  'efficiencyFactor', 'efficiencyIndex', 'efficiencyMetrics',
  // D2 — snap share & own-rate red-zone usage (5):
  'snapShare', 'snapShareFactor', 'rzUsageRate', 'rzUsageFactor', 'rzUsageCategory',
  // D3 — team-aggregated red-zone share (3):
  'teamRzShare', 'teamRzShareFactor', 'teamRzShareCategory',
  'positionMultiplicityRatio', 'primaryCategory', 'primaryCategoryPoints', 'secondaryCategoryPoints',
  // aDOT capture-only (3):
  'adot', 'adotDelta', 'adotSampleSize',
  'pipelinePPG', 'compPPG', 'compCount', 'compAvgSimilarity', 'compConfidence', 'compBlendWeight',
  // ktcSignals (13):
  'ktcHistDelta', 'ktcHistDeltaPct', 'ktcHistVolatility', 'ktcHistVolatilityPct',
  'ktcHistTrajectorySlope', 'ktcHistTrajectoryNormalized', 'ktcHistTrajectoryLabel',
  'ktcHistRankVsMedianTrend', 'ktcHistRankVsMedianLabel', 'ktcHistValueVsPosMedian',
  'ktcHistSampleSize', 'ktcHistWindowSpanDays', 'ktcHistConfidence',
  // Team-change factors (3) — both paths:
  'isTeamChange', 'prevTeam', 'newTeam',
])

// Rookie-path factors: 29 explicit keys + 13 ktcSignals + 6 D1 NFL-draft + 3 teamChangeFactors = 51 total.
// Derived from rookieProjection()'s `factors` object + the { ...r.factors, ...ktcSignals, ...teamChangeFactors } spread.
// NOTE: D1 keys are rookie-path only — do NOT add them to VET_FACTORS_KEYS.
// NOTE: depthStale is vet-only — do NOT add it to ROOKIE_FACTORS_KEYS.
const ROOKIE_FACTORS_KEYS = new Set([
  'basePPG', 'ageDelta', 'shareTrend', 'regressionFactor', 'durabilityFactor',
  'teamFactor', 'depthFactor', 'ktcMult', 'collegeMult', 'ktcPct',
  'collegeBase', 'productionTrend', 'productionTrendAdjust',
  'finalYearDominator', 'finalYearAdjust', 'breakoutAge', 'breakoutAgeFactor',
  'collegeContribution', 'rookieAgeAtDraft',
  'positionMultiplicityRatio', 'primaryCategory', 'primaryCategoryPoints', 'secondaryCategoryPoints',
  // aDOT capture-only (3) — always null on rookie path:
  'adot', 'adotDelta', 'adotSampleSize',
  // D3 — team-aggregated red-zone share (3 sentinels — rookie path out of scope):
  'teamRzShare', 'teamRzShareFactor', 'teamRzShareCategory',
  // ktcSignals (13):
  'ktcHistDelta', 'ktcHistDeltaPct', 'ktcHistVolatility', 'ktcHistVolatilityPct',
  'ktcHistTrajectorySlope', 'ktcHistTrajectoryNormalized', 'ktcHistTrajectoryLabel',
  'ktcHistRankVsMedianTrend', 'ktcHistRankVsMedianLabel', 'ktcHistValueVsPosMedian',
  'ktcHistSampleSize', 'ktcHistWindowSpanDays', 'ktcHistConfidence',
  // D1 — NFL draft slot (6):
  'nflDraftMultiplier', 'nflDraftRound', 'nflDraftPick',
  'nflDraftTier', 'nflDraftMatchSource', 'rookieMultiplierProduct',
  // Team-change factors (3) — both paths:
  'isTeamChange', 'prevTeam', 'newTeam',
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

// Base options shared by both vet calls below.
const SHARED_OPTIONS = {
  playerId:         VET_ID,
  playersMap:       vetPlayersMap,
  careerStats:      vetCareerStats,
  empiricalCurves:  {},                                    // empty → ageDelta stays 1.0
  positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
  historicalShares: {},
  depthMap:         { [VET_ID]: { depthOrder: 1 } },
  teamContext:      { teamOffense: { SF: { rank: 5 } } },
  scoringSettings:  null,
  ktcMap:           null,
  collegeStats:     null,
  currentSeason:    2025,
  qbQualityByTeam:  null,
  ktcHistory:       null,
  nflDraftMatches:  null,
}

// Rookie fixture: WR years_exp 0, empty careerStats → routes to rookie path.
const RK_ID = 'rk_schema_contract'

const rookiePlayersMap = {
  [RK_ID]: { position: 'WR', age: 22, years_exp: 0, team: 'KC', depth_chart_order: 1 },
}

const ROOKIE_OPTIONS = {
  playerId:         RK_ID,
  playersMap:       rookiePlayersMap,
  careerStats:      {},                                    // empty → no qualifying seasons
  empiricalCurves:  {},
  positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
  historicalShares: {},
  depthMap:         {},
  teamContext:      {},
  scoringSettings:  null,
  ktcMap:           null,
  collegeStats:     null,
  currentSeason:    2025,
  qbQualityByTeam:  null,
  ktcHistory:       null,
  nflDraftMatches:  null,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeNextSeasonProjection — factors schema contract', () => {
  it('vet path returns a result (sanity check)', () => {
    const r = computeNextSeasonProjection(SHARED_OPTIONS)
    expect(r).not.toBeNull()
    expect(r.confidence).toMatch(/^(low|medium|high)$/)
    expect(r.factors).toBeTruthy()
  })

  it('vet path emits exactly the documented 73 factors keys (both directions)', () => {
    const r = computeNextSeasonProjection(SHARED_OPTIONS)
    assertFactorsKeySet(r.factors, VET_FACTORS_KEYS, 'Vet')
  })

  it('rookie path returns a result (sanity check)', () => {
    const r = computeNextSeasonProjection(ROOKIE_OPTIONS)
    expect(r).not.toBeNull()
    expect(r.confidence).toBe('rookie')
    expect(r.factors).toBeTruthy()
  })

  it('rookie path emits exactly the documented 51 factors keys (both directions)', () => {
    const r = computeNextSeasonProjection(ROOKIE_OPTIONS)
    assertFactorsKeySet(r.factors, ROOKIE_FACTORS_KEYS, 'Rookie')
  })

  it('vet factors value types and enum constraints', () => {
    const r = computeNextSeasonProjection(SHARED_OPTIONS)
    const f = r.factors

    // Numeric scalars
    expect(typeof f.basePPG).toBe('number')
    expect(f.basePPG).toBeGreaterThan(0)
    expect(typeof f.ageDelta).toBe('number')
    expect(typeof f.regressionFactor).toBe('number')
    expect(typeof f.durabilityFactor).toBe('number')
    // injurySeasons: vet-only diagnostic; all healthy seasons in fixture → 0
    expect(typeof f.injurySeasons).toBe('number')
    expect(f.injurySeasons).toBeGreaterThanOrEqual(0)
    expect(typeof f.combinedNewFactor).toBe('number')
    expect(typeof f.combinedNewFactorRaw).toBe('number')
    expect(f.combinedNewFactorRaw).toBeGreaterThan(0)

    // combinedNewFactor is clamped [0.67, 1.50] (sanity rail, fires ~0% on real players)
    expect(f.combinedNewFactor).toBeGreaterThanOrEqual(0.67)
    expect(f.combinedNewFactor).toBeLessThanOrEqual(1.50)

    // clamp relationship: combinedNewFactor === clamp(combinedNewFactorRaw, 0.67, 1.50)
    const expectedClamped = Math.max(0.67, Math.min(1.50, f.combinedNewFactorRaw))
    // Compare after rounding to match the 3dp recording
    expect(Math.round(f.combinedNewFactor * 1000)).toBe(Math.round(expectedClamped * 1000))

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
    const r = computeNextSeasonProjection(ROOKIE_OPTIONS)
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

    // aDOT fields are always null on rookie path (no prior-season stats)
    expect(f.adot).toBeNull()
    expect(f.adotDelta).toBeNull()
    expect(f.adotSampleSize).toBeNull()

    // ktcHist sentinels
    expect(f.ktcHistSampleSize).toBe(0)
    expect(f.ktcHistConfidence).toBe('none')
  })

  it('QB vet path: efficiencyMetrics sub-object contains exactly passerRating and completionPct', () => {
    // Lightweight QB shell — exercises the QB efficiency sub-object shape without
    // affecting the vet-path key counts (efficiencyMetrics is one top-level key).
    const QB_ID = 'qb_schema_contract'
    const plain = (fp, gp = 16) => ({
      fantasyPoints: fp, gamesPlayed: gp, dnpWeeks: 0,
      stats: { pass_att: 400, pass_cmp: 260, pass_yd: 3200, pass_td: 28, pass_int: 10 },
    })
    const qbCareerStats = {
      2020: { [QB_ID]: plain(280) },
      2021: { [QB_ID]: plain(280) },
      2022: { [QB_ID]: plain(280) },
      2023: { [QB_ID]: plain(280) },
      2024: {
        [QB_ID]: plain(280),
        QB_SCH_C1: { gamesPlayed: 16, stats: { pass_att: 300, pass_cmp: 195, pass_yd: 2100, pass_td: 18, pass_int: 9 } },
      },
    }
    const qbPlayersMap = {
      [QB_ID]:   { position: 'QB', age: 28, years_exp: 7, team: 'KC', depth_chart_order: 1 },
      QB_SCH_C1: { position: 'QB', age: 26, years_exp: 5, team: 'SF' },
    }
    const r = computeNextSeasonProjection({
      playerId:         QB_ID,
      playersMap:       qbPlayersMap,
      careerStats:      qbCareerStats,
      empiricalCurves:  {},
      positionPeakPPG:  { QB: 22, RB: 18, WR: 18, TE: 14 },
      historicalShares: {},
      depthMap:         { [QB_ID]: { depthOrder: 1 } },
      teamContext:      { teamOffense: { KC: { rank: 8 } } },
      scoringSettings:  null,
      ktcMap:           null,
      collegeStats:     null,
      currentSeason:    2025,
      qbQualityByTeam:  null,
      ktcHistory:       null,
      nflDraftMatches:  null,
    })
    expect(r).not.toBeNull()
    expect(r.factors.efficiencyMetrics).not.toBeNull()
    const em = r.factors.efficiencyMetrics
    // Exactly these two keys — any accidental key drift trips this test.
    expect(Object.keys(em).sort()).toEqual(['completionPct', 'passerRating'])
    expect(typeof em.passerRating).toBe('number')
    expect(typeof em.completionPct).toBe('number')
  })

  it('non-skill position returns null', () => {
    const k = computeNextSeasonProjection({
      playerId:         'kicker',
      playersMap:       { kicker: { position: 'K', age: 32, years_exp: 10, team: 'BAL' } },
      careerStats:      {},
      empiricalCurves:  {},
      positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
      historicalShares: {},
      depthMap:         {},
      teamContext:      {},
      scoringSettings:  null,
      ktcMap:           null,
      collegeStats:     null,
      currentSeason:    2025,
      qbQualityByTeam:  null,
      ktcHistory:       null,
      // nflDraftMatches omitted → destructure default = null
    })
    expect(k).toBeNull()
  })
})
