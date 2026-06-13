import { describe, it, expect } from 'vitest'
import { computeEfficiencyFactor } from './efficiencyMetrics.js'

// Minimal careerStats + playersMap fixture with 5 QBs in the most recent season.
// Each QB has pass_att >= 50 and pass_cmp present so they enter the cohort pool.
// Player 'QB_target' is the player we test.
function makeQBCareerStats() {
  const cohortQBs = {
    QB_low:  { stats: { pass_att: 200, pass_cmp: 120, pass_yd: 1200, pass_td: 8,  pass_int: 12 } }, // poor:  rating ≈ 65.4
    QB_med1: { stats: { pass_att: 300, pass_cmp: 195, pass_yd: 2100, pass_td: 18, pass_int: 9  } }, // mid:   rating ≈ 92.9
    QB_med2: { stats: { pass_att: 300, pass_cmp: 195, pass_yd: 2100, pass_td: 18, pass_int: 9  } }, // mid:   rating ≈ 92.9
    QB_hi:   { stats: { pass_att: 400, pass_cmp: 280, pass_yd: 3200, pass_td: 32, pass_int: 6  } }, // good:  rating ≈ 114.2
    QB_top:  { stats: { pass_att: 500, pass_cmp: 350, pass_yd: 4500, pass_td: 45, pass_int: 4  } }, // elite: rating ≈ 124.6
  }
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

  it('QB happy path — median-efficiency player → factor within [0.90, 1.10]', () => {
    const careerStats = makeQBCareerStats()
    const playersMap  = makeQBPlayersMap()
    // QB_target at median level: same as QB_med1/2 (rating ≈ 92.9)
    const lastSeasonStats = { pass_att: 300, pass_cmp: 195, pass_yd: 2100, pass_td: 18, pass_int: 9 }
    const r = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r.efficiencyFactor).toBeGreaterThanOrEqual(0.90)
    expect(r.efficiencyFactor).toBeLessThanOrEqual(1.10)
    expect(r.efficiencyMetrics).toBeTruthy()
  })

  it('QB happy path — elite efficiency → factor > 1.05', () => {
    const careerStats = makeQBCareerStats()
    const playersMap  = makeQBPlayersMap()
    // QB_target at elite level: high cmp%, ypa=9, tdRate high, 0 ints → top cohort rating
    const lastSeasonStats = { pass_att: 500, pass_cmp: 375, pass_yd: 4500, pass_td: 45, pass_int: 0 }
    const r = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r.efficiencyFactor).toBeGreaterThan(1.05)
  })

  it('shrinkage — low-opportunity player shrunk toward 50 vs high-opportunity same ratios', () => {
    const careerStats = makeRBCareerStats()
    // Elite ratios (ypc=10, rushTdRate=0.10) for both players, but one has 50 att and one 200
    const eliteStatsLow  = { rush_att: 50,  rush_yd: 500, rush_td: 5  }  // low sample
    const eliteStatsHigh = { rush_att: 200, rush_yd: 2000, rush_td: 20 } // high sample

    const lowCS  = { 2024: { ...careerStats[2024] } }
    const highCS = { 2024: { ...careerStats[2024] } }

    const rLow  = computeEfficiencyFactor('RB', eliteStatsLow,  lowCS,  makeRBPlayersMap())
    const rHigh = computeEfficiencyFactor('RB', eliteStatsHigh, highCS, makeRBPlayersMap())

    // Both should return a factor > 1 (elite ratios), but low sample should be less extreme
    expect(rHigh.efficiencyFactor).toBeGreaterThanOrEqual(rLow.efficiencyFactor)
  })

  it('high INT% lowers passer rating and factor compared to low INT%', () => {
    // INT% is a component of the NFL passer rating formula; more ints → lower rating → lower factor
    const badStats  = { pass_att: 300, pass_cmp: 195, pass_yd: 2100, pass_td: 18, pass_int: 30 }
    const goodStats = { pass_att: 300, pass_cmp: 195, pass_yd: 2100, pass_td: 18, pass_int: 0  }

    const cs2 = { 2024: { ...makeQBCareerStats()[2024] } }
    const cs3 = { 2024: { ...makeQBCareerStats()[2024] } }

    const rBad  = computeEfficiencyFactor('QB', badStats,  cs2, makeQBPlayersMap())
    const rGood = computeEfficiencyFactor('QB', goodStats, cs3, makeQBPlayersMap())

    expect(rGood.efficiencyFactor).toBeGreaterThanOrEqual(rBad.efficiencyFactor)
  })

  it('cohort cache — same careerStats reference, result is consistent', () => {
    const careerStats = makeQBCareerStats()
    const playersMap  = makeQBPlayersMap()
    const lastSeasonStats = { pass_att: 300, pass_cmp: 195, pass_yd: 2100, pass_td: 18, pass_int: 9 }
    const r1 = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    const r2 = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r1.efficiencyFactor).toBe(r2.efficiencyFactor)
    expect(r1.efficiencyIndex).toBe(r2.efficiencyIndex)
  })

  it('passerRating metric is recorded in efficiencyMetrics (regression guard for QB key)', () => {
    const careerStats = makeQBCareerStats()
    const playersMap  = makeQBPlayersMap()
    const lastSeasonStats = { pass_att: 300, pass_cmp: 195, pass_yd: 2100, pass_td: 18, pass_int: 9 }
    const r = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r.efficiencyMetrics).not.toBeNull()
    expect(r.efficiencyMetrics.passerRating).not.toBeNull()
    expect(typeof r.efficiencyMetrics.passerRating).toBe('number')
    expect(r.efficiencyMetrics.passerRating).toBeGreaterThan(0)
  })

  // ─── New C4 passer-rating cases ────────────────────────────────────────────

  it('QB high passer rating (elite cmp/yd/td, 0 int) → efficiencyFactor > 1.05', () => {
    const careerStats = { 2024: { ...makeQBCareerStats()[2024] } }
    const playersMap  = makeQBPlayersMap()
    // All four passer-rating components near max: high cmp%, ypa=9, high tdRate, 0 ints
    const lastSeasonStats = { pass_att: 500, pass_cmp: 375, pass_yd: 4500, pass_td: 45, pass_int: 0 }
    const r = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r.efficiencyFactor).toBeGreaterThan(1.05)
    expect(r.efficiencyMetrics.passerRating).toBeGreaterThan(100)
  })

  it('QB low passer rating (low cmp%, ypa, td; high int) → efficiencyFactor < 0.95', () => {
    const careerStats = { 2024: { ...makeQBCareerStats()[2024] } }
    const playersMap  = makeQBPlayersMap()
    // Poor stats across all components: low cmp%, low ypa, few TDs, many ints
    const lastSeasonStats = { pass_att: 200, pass_cmp: 100, pass_yd: 800, pass_td: 3, pass_int: 15 }
    const r = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r.efficiencyFactor).toBeLessThan(0.95)
    expect(r.efficiencyMetrics.passerRating).toBeLessThan(70)
  })

  it('QB missing pass_cmp (rating null) with pass_att > 0 → NEUTRAL', () => {
    const careerStats = { 2024: { ...makeQBCareerStats()[2024] } }
    const playersMap  = makeQBPlayersMap()
    // No pass_cmp → passerRating returns null → available empty → NEUTRAL
    const lastSeasonStats = { pass_att: 300, pass_yd: 2100, pass_td: 18, pass_int: 9 }
    const r = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r).toEqual(NEUTRAL)
  })

  it('QB low sample (55 att) → shrunk toward neutral vs same rate at 500 att', () => {
    // Both QBs have similarly good per-attempt rates; low-sample QB is shrunk more
    const lowStats  = { pass_att: 55,  pass_cmp: 36,  pass_yd: 440,  pass_td: 4,  pass_int: 1 }
    const highStats = { pass_att: 500, pass_cmp: 325, pass_yd: 4000, pass_td: 35, pass_int: 9 }

    const csLow  = { 2024: { ...makeQBCareerStats()[2024] } }
    const csHigh = { 2024: { ...makeQBCareerStats()[2024] } }

    const rLow  = computeEfficiencyFactor('QB', lowStats,  csLow,  makeQBPlayersMap())
    const rHigh = computeEfficiencyFactor('QB', highStats, csHigh, makeQBPlayersMap())

    // Both should be above 1.0 (good rates vs cohort), but high-sample is less shrunk → higher factor
    expect(rHigh.efficiencyFactor).toBeGreaterThan(rLow.efficiencyFactor)
  })

  it('QB efficiencyMetrics inner shape: exactly { passerRating, completionPct }, both numeric', () => {
    const careerStats = makeQBCareerStats()
    const playersMap  = makeQBPlayersMap()
    const lastSeasonStats = { pass_att: 300, pass_cmp: 195, pass_yd: 2100, pass_td: 18, pass_int: 9 }
    const r = computeEfficiencyFactor('QB', lastSeasonStats, careerStats, playersMap)
    expect(r.efficiencyMetrics).not.toBeNull()
    const em = r.efficiencyMetrics
    expect(Object.keys(em).sort()).toEqual(['completionPct', 'passerRating'])
    expect(typeof em.passerRating).toBe('number')
    expect(typeof em.completionPct).toBe('number')
    // completionPct = 195/300 = 0.650 (3dp)
    expect(em.completionPct).toBeCloseTo(0.65, 3)
  })

  // ─── Regression: RB/WR composite untouched ─────────────────────────────────

  it('RB composite still fires correctly (non-QB path unaffected)', () => {
    const careerStats = makeRBCareerStats()
    const playersMap  = makeRBPlayersMap()
    // RB with high ypc and rushTdRate → should get a factor above 1.0
    const lastSeasonStats = { rush_att: 200, rush_yd: 1200, rush_td: 16 } // ypc=6, tdRate=0.08
    const r = computeEfficiencyFactor('RB', lastSeasonStats, careerStats, playersMap)
    expect(r.efficiencyFactor).toBeGreaterThanOrEqual(0.90)
    expect(r.efficiencyFactor).toBeLessThanOrEqual(1.10)
    expect(r.efficiencyMetrics).not.toBeNull()
    expect(r.efficiencyMetrics).toHaveProperty('ypc')
    expect(r.efficiencyMetrics).toHaveProperty('rushTdRate')
    expect(r.efficiencyMetrics).not.toHaveProperty('passerRating')
    expect(r.efficiencyMetrics).not.toHaveProperty('completionPct')
  })
})
