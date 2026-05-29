import { describe, it, expect } from 'vitest'
import { computeEfficiencyFactor } from './efficiencyMetrics.js'

// Minimal careerStats + playersMap fixture with 5 QBs in the most recent season.
// Each QB has pass_att >= 50 so they enter the cohort pool.
// Player 'QB_target' is the player we test.
function makeQBCareerStats() {
  const cohortQBs = {
    QB_low:  { stats: { pass_att: 200, pass_yd: 1200, pass_td: 8,  pass_int: 12 } }, // poor: ypa=6, tdRate=0.04, intRate=0.06
    QB_med1: { stats: { pass_att: 300, pass_yd: 2100, pass_td: 18, pass_int: 9  } }, // mid:  ypa=7, tdRate=0.06, intRate=0.03
    QB_med2: { stats: { pass_att: 300, pass_yd: 2100, pass_td: 18, pass_int: 9  } }, // mid:  ypa=7, tdRate=0.06, intRate=0.03
    QB_hi:   { stats: { pass_att: 400, pass_yd: 3200, pass_td: 32, pass_int: 6  } }, // good: ypa=8, tdRate=0.08, intRate=0.015
    QB_top:  { stats: { pass_att: 500, pass_yd: 4500, pass_td: 45, pass_int: 4  } }, // elite: ypa=9, tdRate=0.09, intRate=0.008
  }
  // All gamesPlayed >= 8 is required by the snapshot selection logic (refSeason uses max season key)
  for (const d of Object.values(cohortQBs)) d.gamesPlayed = 16
  return { 2024: cohortQBs }
}

function makeQBPlayersMap() {
  return {
    QB_low:    { position: 'QB' },
    QB_med1:   { position: 'QB' },
    QB_med2:   { position: 'QB' },
    QB_hi:     { position: 'QB' },
    QB_top:    { position: 'QB' },
    QB_target: { position: 'QB' },
  }
}

// RB careerStats for shrinkage test
function makeRBCareerStats() {
  const cohortRBs = {
    RB_a: { stats: { rush_att: 100, rush_yd: 400, rush_td: 4 }, gamesPlayed: 16 },
    RB_b: { stats: { rush_att: 200, rush_yd: 900, rush_td: 8 }, gamesPlayed: 16 },
    RB_c: { stats: { rush_att: 150, rush_yd: 750, rush_td: 9 }, gamesPlayed: 16 },
    RB_d: { stats: { rush_att: 120, rush_yd: 480, rush_td: 6 }, gamesPlayed: 16 },
  }
  return { 2024: cohortRBs }
}

function makeRBPlayersMap() {
  return {
    RB_a: { position: 'RB' },
    RB_b: { position: 'RB' },
    RB_c: { position: 'RB' },
    RB_d: { position: 'RB' },
  }
}

const NEUTRAL = { efficiencyFactor: 1.0, efficiencyIndex: null, efficiencyMetrics: null }

describe('computeEfficiencyFactor', () => {
  it('unsupported position (K) → NEUTRAL', () => {
    const r = computeEfficiencyFactor('K', { pass_att: 100 }, { 2024: {} }, {})
    expect(r).toEqual(NEUTRAL)
  })

  it('no lastSeasonStats → NEUTRAL', () => {
    const r = computeEfficiencyFactor('QB', undefined, makeQBCareerStats(), makeQBPlayersMap())
    expect(r).toEqual(NEUTRAL)
  })

  it('no careerStats → NEUTRAL', () => {
    const r = computeEfficiencyFactor('QB', { pass_att: 200 }, undefined, makeQBPlayersMap())
    expect(r).toEqual(NEUTRAL)
  })

  it('zero opportunities → rawMetrics null, returns NEUTRAL', () => {
    const r = computeEfficiencyFactor('QB', { pass_att: 0 }, makeQBCareerStats(), makeQBPlayersMap())
    expect(r).toEqual(NEUTRAL)
  })

  it('QB happy path — median-efficiency player → factor ≈ 1.0', () => {
    const careerStats = makeQBCareerStats()
    const playersMap  = makeQBPlayersMap()
    // QB_target at median level: ypa=7, tdRate=0.06, intRate=0.03 (same as QB_med1/2)
    const lastSeasonStats = { pass_att: 300, pass_yd: 2100, pass_td: 18, pass_int: 9 }
    const r = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r.efficiencyFactor).toBeGreaterThanOrEqual(0.90)
    expect(r.efficiencyFactor).toBeLessThanOrEqual(1.10)
    expect(r.efficiencyMetrics).toBeTruthy()
  })

  it('QB happy path — elite efficiency → factor > 1.05', () => {
    const careerStats = makeQBCareerStats()
    const playersMap  = makeQBPlayersMap()
    // QB_target at elite level: ypa=9, tdRate=0.09, intRate=0 (best in cohort on all metrics)
    const lastSeasonStats = { pass_att: 500, pass_yd: 4500, pass_td: 45, pass_int: 0 }
    const r = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r.efficiencyFactor).toBeGreaterThan(1.05)
  })

  it('shrinkage — low-opportunity player shrunk toward 50 vs high-opportunity same ratios', () => {
    const careerStats = makeRBCareerStats()
    const playersMap  = makeRBPlayersMap()
    // Elite ratios (ypc=10, rushTdRate=0.10) for both players, but one has 50 att and one 500
    const eliteStatsLow  = { rush_att: 50,  rush_yd: 500, rush_td: 5  }  // low sample
    const eliteStatsHigh = { rush_att: 200, rush_yd: 2000, rush_td: 20 } // high sample

    // Both need distinct position entries that haven't been seen before
    const lowCS  = { 2024: { ...careerStats[2024] } }
    const highCS = { 2024: { ...careerStats[2024] } }

    const rLow  = computeEfficiencyFactor('RB', eliteStatsLow,  lowCS,  makeRBPlayersMap())
    const rHigh = computeEfficiencyFactor('RB', eliteStatsHigh, highCS, makeRBPlayersMap())

    // Both should return a factor > 1 (elite ratios), but low sample should be less extreme
    expect(rHigh.efficiencyFactor).toBeGreaterThanOrEqual(rLow.efficiencyFactor)
  })

  it('invert (intRate) — high INT% maps to low factor contribution', () => {
    // Use a fresh careerStats where QB_target has high INT% → bad → lower factor
    const careerStats = makeQBCareerStats()
    const playersMap  = makeQBPlayersMap()
    // Very high INT rate (terrible): intRate = 30/300 = 0.10 (worst in cohort)
    const badStats  = { pass_att: 300, pass_yd: 2100, pass_td: 18, pass_int: 30 }
    const goodStats = { pass_att: 300, pass_yd: 2100, pass_td: 18, pass_int: 0  }

    const cs2 = { 2024: { ...makeQBCareerStats()[2024] } }
    const cs3 = { 2024: { ...makeQBCareerStats()[2024] } }

    const rBad  = computeEfficiencyFactor('QB', badStats,  cs2, makeQBPlayersMap())
    const rGood = computeEfficiencyFactor('QB', goodStats, cs3, makeQBPlayersMap())

    // Good INT% should yield higher factor than bad INT%
    expect(rGood.efficiencyFactor).toBeGreaterThanOrEqual(rBad.efficiencyFactor)
  })

  it('cohort cache — same careerStats reference, result is consistent', () => {
    const careerStats = makeQBCareerStats()
    const playersMap  = makeQBPlayersMap()
    const lastSeasonStats = { pass_att: 300, pass_yd: 2100, pass_td: 18, pass_int: 9 }
    const r1 = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    const r2 = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r1.efficiencyFactor).toBe(r2.efficiencyFactor)
    expect(r1.efficiencyIndex).toBe(r2.efficiencyIndex)
  })

  it('pass_int key present fires intRate metric (regression for original miss)', () => {
    const careerStats = makeQBCareerStats()
    const playersMap  = makeQBPlayersMap()
    // Provide pass_int in stats — the intRate metric should fire (rawMetrics.intRate !== null)
    const lastSeasonStats = { pass_att: 300, pass_yd: 2100, pass_td: 18, pass_int: 9 }
    const r = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r.efficiencyMetrics).not.toBeNull()
    expect(r.efficiencyMetrics.intRate).not.toBeNull()
    expect(r.efficiencyMetrics.intRate).toBeGreaterThan(0)  // 9/300 = 0.03
  })
})
